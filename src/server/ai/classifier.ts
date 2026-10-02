import "server-only";
import { assessRoyalty, type RoyaltyState } from "@/lib/domain/royalty";
import { systemDb } from "../db/clients";
import { env, modelChain } from "../env";
import { recordEvent } from "../services/events";
import { loadTicketAiContext, renderClassificationFacts, type TicketAiContext } from "./context";
import { geminiProvider } from "./gemini";
import { applyPriorityPolicy } from "./guardrails";
import {
  CLASSIFY_JSON_SCHEMA,
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM,
  buildClassifyPrompt,
  classificationOutputSchema,
  type ClassificationOutput,
} from "./prompts";
import { AiError, type LlmProvider, type TokenUsage } from "./provider";
import { logAiRequest } from "./telemetry";

export interface ClassificationResult extends ClassificationOutput {
  model: string;
  appliedRule: string | null;
  usage: TokenUsage;
  latencyMs: number;
}

interface RunOptions {
  ticketId?: string | null;
  /** Override the configured model chain (used by the eval script). */
  models?: string[];
  /** Record the call in ai_requests (off for offline evaluation runs). */
  log?: boolean;
}

/**
 * Pure-ish core: build the prompt, call the model, apply policy floors.
 * Separated from persistence so the eval script can run it on raw text.
 */
export async function runClassification(
  input: { subject: string; description: string; facts: string; royaltyState: RoyaltyState | null },
  provider: LlmProvider = geminiProvider(),
  { ticketId = null, models, log = true }: RunOptions = {},
): Promise<ClassificationResult> {
  const started = Date.now();
  try {
    const result = await provider.generateStructured({
      operation: "classify",
      models: models ?? modelChain(env().GEMINI_CLASSIFY_MODELS),
      system: CLASSIFY_SYSTEM,
      prompt: buildClassifyPrompt(input),
      jsonSchema: CLASSIFY_JSON_SCHEMA,
      outputSchema: classificationOutputSchema,
      maxOutputTokens: 400,
      temperature: 0,
      reasoning: "none",
      deadlineMs: 15_000,
    });

    if (log) await logAiRequest({
      ticketId,
      operation: "classify",
      model: result.model,
      promptVersion: CLASSIFY_PROMPT_VERSION,
      outcome: "success",
      attempts: result.attempts,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });

    const policy = applyPriorityPolicy({
      category: result.data.category,
      priority: result.data.priority,
      text: `${input.subject}\n${input.description}`,
      royaltyState: input.royaltyState,
    });
    return {
      ...result.data,
      priority: policy.priority,
      model: result.model,
      appliedRule: policy.appliedRule,
      usage: result.usage,
      latencyMs: result.latencyMs,
    };
  } catch (err) {
    const aiErr = err instanceof AiError ? err : new AiError("unknown", String(err));
    if (log) await logAiRequest({
      ticketId,
      operation: "classify",
      model: aiErr.model,
      promptVersion: CLASSIFY_PROMPT_VERSION,
      outcome: "error",
      errorCode: aiErr.code,
      attempts: aiErr.attempts,
      latencyMs: Date.now() - started,
    });
    throw aiErr;
  }
}

function royaltyStateOf(ctx: TicketAiContext): RoyaltyState | null {
  const b = ctx.book;
  if (!b) return null;
  return assessRoyalty({
    isPublished: b.stage === "published_live",
    publicationDate: b.publication_date,
    totalRoyaltyEarned: Number(b.total_royalty_earned),
    royaltyPaid: Number(b.royalty_paid),
    royaltyPending: Number(b.royalty_pending),
    lastRoyaltyPayoutDate: b.last_royalty_payout_date,
  }).state;
}

/**
 * Classifies a stored ticket and persists the result. Runs after the ticket
 * has been created (via `after()`), so authors never wait on the AI.
 *
 * Admin overrides win: the AI never overwrites a category/priority an admin
 * set, even if the override lands while classification is in flight.
 */
export async function classifyTicket(ticketId: string, provider: LlmProvider = geminiProvider()): Promise<void> {
  const ctx = await loadTicketAiContext(ticketId);
  if (!ctx) return;
  const db = systemDb();

  if (!provider.isConfigured()) {
    await markFailed(ticketId, "not_configured");
    return;
  }

  try {
    const result = await runClassification(
      {
        subject: ctx.ticket.subject,
        description: ctx.ticket.description,
        facts: renderClassificationFacts(ctx),
        royaltyState: royaltyStateOf(ctx),
      },
      provider,
      { ticketId },
    );

    const now = new Date().toISOString();
    await db
      .from("tickets")
      .update({
        ai_status: "completed",
        ai_category: result.category,
        ai_priority: result.priority,
        ai_confidence: result.confidence,
        ai_rationale: result.appliedRule ? `${result.rationale} (Raised: ${result.appliedRule}.)` : result.rationale,
        ai_error: null,
        ai_classified_at: now,
      })
      .eq("id", ticketId);
    // Conditional updates: only replace values that did not come from an admin.
    await db
      .from("tickets")
      .update({ category: result.category, category_source: "ai" })
      .eq("id", ticketId)
      .neq("category_source", "admin");
    await db
      .from("tickets")
      .update({ priority: result.priority, priority_source: "ai" })
      .eq("id", ticketId)
      .neq("priority_source", "admin");

    await recordEvent(ticketId, null, "ai_classified", {
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      model: result.model,
      policyRule: result.appliedRule,
    });
  } catch (err) {
    await markFailed(ticketId, err instanceof AiError ? err.code : "unknown");
  }
}

async function markFailed(ticketId: string, code: string) {
  await systemDb()
    .from("tickets")
    .update({ ai_status: "failed", ai_error: code })
    .eq("id", ticketId);
  await recordEvent(ticketId, null, "ai_classification_failed", { reason: code });
}
