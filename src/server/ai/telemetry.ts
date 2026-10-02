import "server-only";
import { systemDb } from "../db/clients";
import type { AiErrorCode, AiOperation, TokenUsage } from "./provider";

export interface AiRequestLog {
  ticketId: string | null;
  operation: AiOperation;
  model: string | null;
  promptVersion: string;
  outcome: "success" | "error";
  errorCode?: AiErrorCode | null;
  attempts: number;
  usage?: TokenUsage;
  latencyMs: number;
}

/**
 * Records every AI call (tokens, latency, outcome). Powers the AI Insights
 * page and makes cost visible. Best effort: logging must never break the
 * request that triggered it.
 */
export async function logAiRequest(entry: AiRequestLog): Promise<void> {
  const { error } = await systemDb()
    .from("ai_requests")
    .insert({
      ticket_id: entry.ticketId,
      operation: entry.operation,
      model: entry.model,
      prompt_version: entry.promptVersion,
      outcome: entry.outcome,
      error_code: entry.errorCode ?? null,
      attempts: entry.attempts,
      input_tokens: entry.usage?.inputTokens ?? null,
      output_tokens: entry.usage?.outputTokens ?? null,
      cached_tokens: entry.usage?.cachedTokens ?? null,
      thinking_tokens: entry.usage?.thinkingTokens ?? null,
      latency_ms: entry.latencyMs,
    });
  if (error) console.error("[ai] failed to log request", error.message);
}
