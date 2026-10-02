import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";
import { env } from "../env";
import {
  AiError,
  type AiErrorCode,
  type LlmProvider,
  type StructuredRequest,
  type StructuredResult,
  type TokenUsage,
} from "./provider";

const MAX_ATTEMPTS_PER_MODEL = 2;
const MIN_USEFUL_BUDGET_MS = 1500;

/**
 * Gemini implementation of LlmProvider.
 *
 * Resilience strategy (the SDK's own retries are disabled; its default of up
 * to 5 attempts with 60s backoff would hang a request):
 *   - every call has a hard per-attempt timeout inside an overall deadline
 *   - 429/5xx/timeouts are retried once on the same model with jittered backoff
 *     (honouring the server's retryDelay hint when it fits the budget)
 *   - then the next model in the chain is tried (e.g. 3.5 Flash -> 2.5 Flash)
 *   - output must pass both the JSON Schema (server-side) and Zod (here)
 * If all of that fails, an AiError is thrown and callers degrade gracefully.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private client: GoogleGenAI | null = null;

  isConfigured(): boolean {
    return Boolean(env().GEMINI_API_KEY);
  }

  private getClient(): GoogleGenAI {
    const apiKey = env().GEMINI_API_KEY;
    if (!apiKey) throw new AiError("not_configured", "GEMINI_API_KEY is not set.");
    this.client ??= new GoogleGenAI({ apiKey });
    return this.client;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const client = this.getClient();
    const started = Date.now();
    const deadline = started + req.deadlineMs;
    let attempts = 0;
    let lastError: AiError | null = null;

    for (const model of req.models) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining < MIN_USEFUL_BUDGET_MS) {
          throw new AiError("timeout", "AI deadline exceeded.", attempts, model);
        }

        attempts++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remaining);

        try {
          const response = await client.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: req.prompt }] }],
            config: {
              systemInstruction: req.system,
              temperature: req.temperature,
              maxOutputTokens: req.maxOutputTokens,
              responseMimeType: "application/json",
              responseJsonSchema: req.jsonSchema,
              thinkingConfig: thinkingConfigFor(model, req.reasoning),
              abortSignal: controller.signal,
              httpOptions: { timeout: remaining, retryOptions: { attempts: 1 } },
            },
          });

          if (response.promptFeedback?.blockReason) {
            throw new AiError("blocked", `Prompt blocked: ${response.promptFeedback.blockReason}`, attempts, model);
          }
          const finish = response.candidates?.[0]?.finishReason;
          if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
            throw new AiError("blocked", `Response blocked: ${finish}`, attempts, model);
          }

          const parsed = parseJson(response.text);
          const validated = req.outputSchema.safeParse(parsed);
          if (!validated.success) {
            // Usually a truncated or malformed response; one retry tends to fix it.
            lastError = new AiError(
              "invalid_output",
              `Output failed validation (finish: ${finish ?? "unknown"}): ${validated.error.issues[0]?.message}`,
              attempts,
              model,
            );
            continue;
          }

          const usage = response.usageMetadata;
          const tokenUsage: TokenUsage = {
            inputTokens: usage?.promptTokenCount ?? null,
            outputTokens: usage?.candidatesTokenCount ?? null,
            cachedTokens: usage?.cachedContentTokenCount ?? null,
            thinkingTokens: usage?.thoughtsTokenCount ?? null,
          };
          return { data: validated.data, model, usage: tokenUsage, latencyMs: Date.now() - started, attempts };
        } catch (err) {
          if (err instanceof AiError && err.code === "blocked") throw err;
          const classified = classifyError(err, controller.signal.aborted, attempts, model);
          lastError = classified.error;

          if (classified.code === "bad_request") throw classified.error;
          if (classified.code === "model_not_found" || !classified.retryable) break; // next model
          if (attempt < MAX_ATTEMPTS_PER_MODEL) {
            const backoff = classified.retryAfterMs ?? 400 * 2 ** (attempt - 1) + Math.random() * 300;
            if (Date.now() + backoff + MIN_USEFUL_BUDGET_MS > deadline) break;
            await sleep(backoff);
          }
        } finally {
          clearTimeout(timer);
        }
      }
    }

    throw lastError ?? new AiError("unknown", "No model produced a response.", attempts);
  }
}

/**
 * Thinking is billed as output and adds latency, so it is kept small:
 *  - classification needs none (constrained enum output)
 *  - drafting gets a modest budget on 2.5 Flash (~6s end to end)
 *  - Gemini 3.x only offers coarse levels; LOW measured ~40s per draft and
 *    MINIMAL ~11s, so MINIMAL is used there regardless.
 */
function thinkingConfigFor(model: string, reasoning: "none" | "low"): ThinkingConfig | undefined {
  if (/^gemini-3/.test(model)) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  // Gemini 2.5 Flash / Flash-Lite accept a token budget (0 disables thinking).
  if (/^gemini-2\.5-flash/.test(model)) {
    return { thinkingBudget: reasoning === "none" ? 0 : 1024 };
  }
  return undefined;
}

function parseJson(text: string | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in a code fence despite responseMimeType.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

interface ClassifiedError {
  code: AiErrorCode | "model_not_found";
  retryable: boolean;
  retryAfterMs?: number;
  error: AiError;
}

function classifyError(err: unknown, aborted: boolean, attempts: number, model: string): ClassifiedError {
  const make = (code: AiErrorCode, retryable: boolean, message: string, retryAfterMs?: number): ClassifiedError => ({
    code,
    retryable,
    retryAfterMs,
    error: new AiError(code, message, attempts, model),
  });

  if (aborted || (err instanceof Error && /abort|timed? ?out/i.test(err.message))) {
    return make("timeout", true, `Timed out waiting for ${model}.`);
  }
  if (err instanceof ApiError) {
    const status = err.status;
    if (status === 429) return make("rate_limited", true, `Rate limited on ${model}.`, retryDelayMs(err.message));
    if (status >= 500) return make("unavailable", true, `${model} unavailable (${status}).`);
    if (status === 404) {
      return { ...make("unavailable", false, `Model ${model} not found.`), code: "model_not_found" };
    }
    return make("bad_request", false, `Request rejected by ${model} (${status}): ${err.message.slice(0, 200)}`);
  }
  if (err instanceof TypeError) return make("unavailable", true, `Network error calling ${model}.`);
  return make("unknown", false, err instanceof Error ? err.message : String(err));
}

/** Extracts Gemini's `"retryDelay": "3s"` hint, ignoring waits too long to be useful. */
function retryDelayMs(message: string): number | undefined {
  const match = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return undefined;
  const ms = Number(match[1]) * 1000;
  return ms <= 4000 ? ms : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let provider: GeminiProvider | undefined;
export function geminiProvider(): GeminiProvider {
  provider ??= new GeminiProvider();
  return provider;
}
