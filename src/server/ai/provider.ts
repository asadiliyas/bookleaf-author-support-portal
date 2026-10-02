/**
 * Provider-agnostic contract for structured LLM calls. The rest of the app
 * (classifier, drafter) depends on this interface, not on Gemini, so swapping
 * providers or adding a second one is a single new implementation.
 */
import type { z } from "zod";

export type AiOperation = "classify" | "draft";

export interface StructuredRequest<T> {
  operation: AiOperation;
  /** Ordered model chain: primary first, fallbacks after. */
  models: string[];
  system: string;
  prompt: string;
  /** JSON Schema sent to the model to constrain its output. */
  jsonSchema: Record<string, unknown>;
  /** Zod schema the output must also pass before we trust it. */
  outputSchema: z.ZodType<T>;
  maxOutputTokens: number;
  temperature: number;
  /** How much the model may "think": classification needs none, drafting a little. */
  reasoning: "none" | "low";
  /** Total time budget across retries and fallbacks. */
  deadlineMs: number;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  thinkingTokens: number | null;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  attempts: number;
}

export type AiErrorCode =
  | "not_configured" // no API key
  | "rate_limited" // 429 on every model in the chain
  | "unavailable" // 5xx / overloaded on every model
  | "timeout" // deadline exceeded
  | "invalid_output" // response failed schema validation
  | "blocked" // safety filter
  | "bad_request" // our request was rejected (bug or bad config)
  | "unknown";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly attempts = 0,
    public readonly model: string | null = null,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface LlmProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** Author-facing explanation for each failure mode (shown to admins as a banner). */
export function describeAiError(code: AiErrorCode): string {
  switch (code) {
    case "not_configured":
      return "AI assistance is not configured on this environment.";
    case "rate_limited":
      return "The AI service is rate-limiting requests right now.";
    case "unavailable":
      return "The AI service is temporarily unavailable.";
    case "timeout":
      return "The AI service took too long to respond.";
    case "invalid_output":
      return "The AI returned an unusable response.";
    case "blocked":
      return "The AI declined to process this ticket's content.";
    default:
      return "The AI service failed unexpectedly.";
  }
}
