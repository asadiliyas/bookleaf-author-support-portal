/**
 * Resilience of the Gemini provider, with the SDK mocked: overloads, rate
 * limits, malformed output and model fallback must all end in either a valid
 * result or a typed AiError, never a hang or an unhandled exception.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const { ApiError } = await import("@google/genai");
const { GeminiProvider } = await import("@/server/ai/gemini");
const { AiError } = await import("@/server/ai/provider");

const schema = z.object({ category: z.string(), priority: z.string() });
const request = {
  operation: "classify" as const,
  models: ["model-primary", "model-fallback"],
  system: "system",
  prompt: "prompt",
  jsonSchema: {},
  outputSchema: schema,
  maxOutputTokens: 100,
  temperature: 0,
  reasoning: "none" as const,
  deadlineMs: 20_000,
};

const ok = (data: unknown) => ({
  text: JSON.stringify(data),
  candidates: [{ finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 40 },
});

describe("GeminiProvider", () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it("returns validated data and token usage", async () => {
    generateContent.mockResolvedValueOnce(ok({ category: "royalty_payments", priority: "high" }));
    const res = await new GeminiProvider().generateStructured(request);
    expect(res.data.category).toBe("royalty_payments");
    expect(res.usage.inputTokens).toBe(600);
    expect(res.model).toBe("model-primary");
  });

  it("retries once on an overloaded model, then succeeds", async () => {
    generateContent
      .mockRejectedValueOnce(new ApiError({ message: "overloaded", status: 503 }))
      .mockResolvedValueOnce(ok({ category: "isbn_metadata", priority: "high" }));
    const res = await new GeminiProvider().generateStructured(request);
    expect(res.attempts).toBe(2);
    expect(res.model).toBe("model-primary");
  });

  it("falls back to the next model when the primary stays rate-limited", async () => {
    generateContent
      .mockRejectedValueOnce(new ApiError({ message: "quota", status: 429 }))
      .mockRejectedValueOnce(new ApiError({ message: "quota", status: 429 }))
      .mockResolvedValueOnce(ok({ category: "general_inquiry", priority: "low" }));
    const res = await new GeminiProvider().generateStructured(request);
    expect(res.model).toBe("model-fallback");
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("re-asks when the output fails schema validation", async () => {
    generateContent
      .mockResolvedValueOnce({ text: '{"category": 42', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockResolvedValueOnce(ok({ category: "printing_quality", priority: "medium" }));
    const res = await new GeminiProvider().generateStructured(request);
    expect(res.data.category).toBe("printing_quality");
  });

  it("gives up with a typed error when every model is down", async () => {
    generateContent.mockRejectedValue(new ApiError({ message: "down", status: 503 }));
    await expect(new GeminiProvider().generateStructured(request)).rejects.toMatchObject({ code: "unavailable" });
    expect(generateContent).toHaveBeenCalledTimes(4); // 2 attempts × 2 models
  });

  it("does not retry requests the API rejected as invalid", async () => {
    generateContent.mockRejectedValue(new ApiError({ message: "bad schema", status: 400 }));
    const err = await new GeminiProvider().generateStructured(request).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("bad_request");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("respects the overall deadline", async () => {
    generateContent.mockImplementation(
      (args: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_, reject) => args.config.abortSignal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const started = Date.now();
    const err = await new GeminiProvider().generateStructured({ ...request, deadlineMs: 2500 }).catch((e) => e);
    expect(err.code).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
