/**
 * Paid-tier list prices (USD per 1M tokens) from ai.google.dev/gemini-api/docs/pricing,
 * checked Oct 2026. Used only to *estimate* spend on the AI Insights page; the
 * free tier costs nothing, but the numbers show what production volume would cost.
 * Output price applies to thinking tokens too.
 */
const PRICES: Record<string, { input: number; output: number; cached: number }> = {
  "gemini-3.5-flash": { input: 1.5, output: 9.0, cached: 0.15 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cached: 0.03 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cached: 0.025 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cached: 0.03 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cached: 0.01 },
};

export function estimateCostUsd(
  model: string | null,
  usage: { input: number; output: number; cached: number; thinking: number },
): number {
  const price = model ? PRICES[model] : undefined;
  if (!price) return 0;
  const uncachedInput = Math.max(0, usage.input - usage.cached);
  return (
    (uncachedInput * price.input + usage.cached * price.cached + (usage.output + usage.thinking) * price.output) /
    1_000_000
  );
}
