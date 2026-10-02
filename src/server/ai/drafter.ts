import "server-only";
import { createHash } from "node:crypto";
import type { AiDraft, DraftResponse } from "@/lib/api-types";
import type { Actor } from "../auth/actor";
import { systemDb } from "../db/clients";
import { env, modelChain } from "../env";
import { check } from "../http/errors";
import type { Database } from "@/types/database";
import { loadTicketAiContext, renderConversation, renderFacts, type TicketAiContext } from "./context";
import { geminiProvider } from "./gemini";
import { DRAFT_JSON_SCHEMA, DRAFT_PROMPT_VERSION, DRAFT_SYSTEM, buildDraftPrompt, draftOutputSchema } from "./prompts";
import { AiError, describeAiError, type LlmProvider } from "./provider";
import { logAiRequest } from "./telemetry";

type DraftRow = Database["public"]["Tables"]["ai_drafts"]["Row"];

/**
 * Cache key = everything that would change the draft. Opening the same ticket
 * twice, or two agents opening it, reuses one generation; a new author
 * message, a category change, updated royalty data or a prompt change
 * produces a new key and therefore a fresh draft.
 */
export function draftContextKey(ctx: TicketAiContext): string {
  const last = ctx.messages.at(-1);
  const parts = [
    DRAFT_PROMPT_VERSION,
    ctx.ticket.category,
    ctx.ticket.book_id ?? "general",
    last?.id ?? "no-messages",
    ctx.book?.stage ?? "",
    ctx.book?.royalty_pending ?? "",
    ctx.book?.last_royalty_payout_date ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function toDraft(row: DraftRow, agentName: string, cached: boolean): AiDraft {
  const escalation = row.escalation as { required: boolean; team: string; reason: string } | null;
  return {
    id: row.id,
    reply: resign(row.reply, row.agent_name, agentName),
    suggestedStatus: row.suggested_status,
    escalation: escalation
      ? { required: escalation.required, team: escalation.team === "none" ? null : escalation.team, reason: escalation.reason || null }
      : null,
    adminChecklist: (row.admin_checklist as string[]) ?? [],
    model: row.model,
    promptVersion: row.prompt_version,
    cached,
    createdAt: row.created_at,
  };
}

/** Swaps the sign-off name so a cached draft reads correctly for whoever opens it. */
function resign(reply: string, from: string, to: string): string {
  if (from === to) return reply;
  return reply.replace(new RegExp(`(Warm regards,\\s*\\n)${escapeRegExp(from)}`), `$1${to}`);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns a draft reply for the ticket: the cached one when the context is
 * unchanged, otherwise a fresh generation. Never throws for AI failures:
 * the caller gets `draft: null` plus a reason, and the admin writes manually.
 */
export async function getOrCreateDraft(
  ticketId: string,
  actor: Actor,
  options: { regenerate: boolean },
  provider: LlmProvider = geminiProvider(),
): Promise<DraftResponse> {
  const ctx = await loadTicketAiContext(ticketId);
  if (!ctx) return { draft: null, degraded: { reason: "not_found", message: "Ticket not found." } };

  const db = systemDb();
  const contextKey = draftContextKey(ctx);

  if (!options.regenerate) {
    const cached = check(
      await db
        .from("ai_drafts")
        .select("*")
        .eq("ticket_id", ticketId)
        .eq("context_key", contextKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load cached draft",
    );
    if (cached) {
      await db.from("ai_drafts").update({ cache_hits: cached.cache_hits + 1 }).eq("id", cached.id);
      return { draft: toDraft(cached, actor.name, true), degraded: null };
    }
  }

  if (!provider.isConfigured()) {
    return { draft: null, degraded: { reason: "not_configured", message: describeAiError("not_configured") } };
  }

  const started = Date.now();
  const lastMessage = ctx.messages.at(-1);
  try {
    const result = await provider.generateStructured({
      operation: "draft",
      models: modelChain(env().GEMINI_DRAFT_MODELS),
      system: DRAFT_SYSTEM,
      prompt: buildDraftPrompt({
        category: ctx.ticket.category,
        facts: renderFacts(ctx),
        conversation: renderConversation(ctx),
        agentName: actor.name,
        isFollowUp: lastMessage?.sender_role === "admin",
      }),
      jsonSchema: DRAFT_JSON_SCHEMA,
      outputSchema: draftOutputSchema,
      maxOutputTokens: 3000,
      temperature: 0.4,
      reasoning: "low",
      deadlineMs: 40_000,
    });

    await logAiRequest({
      ticketId,
      operation: "draft",
      model: result.model,
      promptVersion: DRAFT_PROMPT_VERSION,
      outcome: "success",
      attempts: result.attempts,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });

    const out = result.data;
    const row = check(
      await db
        .from("ai_drafts")
        .insert({
          ticket_id: ticketId,
          context_key: contextKey,
          reply: out.reply.trim(),
          suggested_status: out.suggested_status,
          escalation: out.escalation,
          admin_checklist: out.admin_checklist.slice(0, 4),
          model: result.model,
          prompt_version: DRAFT_PROMPT_VERSION,
          created_by: actor.userId,
          agent_name: actor.name,
        })
        .select("*")
        .single(),
      "store draft",
    );
    return { draft: toDraft(row, actor.name, false), degraded: null };
  } catch (err) {
    const aiErr = err instanceof AiError ? err : new AiError("unknown", String(err));
    await logAiRequest({
      ticketId,
      operation: "draft",
      model: aiErr.model,
      promptVersion: DRAFT_PROMPT_VERSION,
      outcome: "error",
      errorCode: aiErr.code,
      attempts: aiErr.attempts,
      latencyMs: Date.now() - started,
    });
    if (!(err instanceof AiError)) console.error("[ai] unexpected draft failure", err);
    return { draft: null, degraded: { reason: aiErr.code, message: describeAiError(aiErr.code) } };
  }
}

/** Latest cached draft for the current context, without generating. */
export async function findCurrentDraft(ticketId: string, actor: Actor): Promise<AiDraft | null> {
  const ctx = await loadTicketAiContext(ticketId);
  if (!ctx) return null;
  const row = check(
    await systemDb()
      .from("ai_drafts")
      .select("*")
      .eq("ticket_id", ticketId)
      .eq("context_key", draftContextKey(ctx))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "load draft",
  );
  return row ? toDraft(row, actor.name, true) : null;
}
