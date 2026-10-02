/**
 * Offline evaluation of ticket classification.
 *
 *   npm run eval:classify                                   # configured model chain
 *   npm run eval:classify -- --models=gemini-2.5-flash-lite # one or more models, compared side by side
 *
 * Reports category accuracy, priority accuracy (exact and "acceptable"),
 * latency, tokens and estimated cost per 1,000 tickets, plus the rule-based
 * fallback on the same set as a baseline. Accuracy is computed over completed
 * calls; errors (rate limits, outages) are reported separately. Calls are not
 * logged to ai_requests.
 */
import { runClassification } from "../src/server/ai/classifier";
import { classifyByRules } from "../src/server/ai/fallback-classifier";
import { geminiProvider } from "../src/server/ai/gemini";
import { estimateCostUsd } from "../src/server/ai/pricing";
import { env, modelChain } from "../src/server/env";
import { EVAL_CASES } from "./eval-cases";

const modelsArg = process.argv.find((a) => a.startsWith("--models="))?.split("=")[1];
const models = modelsArg ? modelsArg.split(",").map((m) => m.trim()) : [modelChain(env().GEMINI_CLASSIFY_MODELS)[0]];
const verbose = process.argv.includes("--verbose");
// Free-tier keys allow ~15 requests/minute per model; pace calls to stay under it.
const delayMs = Number(process.argv.find((a) => a.startsWith("--delay="))?.split("=")[1] ?? 4500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  label: string;
  categoryCorrect: number;
  priorityExact: number;
  priorityAcceptable: number;
  errors: number;
  latencies: number[];
  costUsd: number;
  inputTokens: number[];
}

function pct(n: number, d: number) {
  return d ? `${((n / d) * 100).toFixed(0)}%` : "n/a";
}

async function evalModel(model: string): Promise<Row> {
  const row: Row = { label: model, categoryCorrect: 0, priorityExact: 0, priorityAcceptable: 0, errors: 0, latencies: [], costUsd: 0, inputTokens: [] };
  for (const [i, c] of EVAL_CASES.entries()) {
    if (i > 0) await sleep(delayMs);
    try {
      const r = await runClassification(c, geminiProvider(), { models: [model], log: false });
      const catOk = r.category === c.category;
      const priExact = r.priority === c.acceptablePriorities[0];
      const priOk = c.acceptablePriorities.includes(r.priority);
      row.categoryCorrect += catOk ? 1 : 0;
      row.priorityExact += priExact ? 1 : 0;
      row.priorityAcceptable += priOk ? 1 : 0;
      row.latencies.push(r.latencyMs);
      row.inputTokens.push(r.usage.inputTokens ?? 0);
      row.costUsd += estimateCostUsd(r.model, {
        input: r.usage.inputTokens ?? 0,
        output: r.usage.outputTokens ?? 0,
        cached: r.usage.cachedTokens ?? 0,
        thinking: r.usage.thinkingTokens ?? 0,
      });
      if (verbose || !catOk || !priOk) {
        console.log(
          `  ${catOk ? "✓" : "✗"}${priOk ? "✓" : "✗"} ${c.subject.padEnd(36)} → ${r.category}/${r.priority}` +
            (catOk && priOk ? "" : `  (expected ${c.category}/${c.acceptablePriorities.join("|")})`),
        );
      }
    } catch (err) {
      row.errors++;
      console.log(`  !! ${c.subject}: ${(err as Error).message}`);
    }
  }
  return row;
}

function evalFallback(): Row {
  const row: Row = { label: "rule-based fallback", categoryCorrect: 0, priorityExact: 0, priorityAcceptable: 0, errors: 0, latencies: [], costUsd: 0, inputTokens: [] };
  for (const c of EVAL_CASES) {
    const r = classifyByRules(c.subject, c.description);
    row.categoryCorrect += r.category === c.category ? 1 : 0;
    row.priorityExact += r.priority === c.acceptablePriorities[0] ? 1 : 0;
    row.priorityAcceptable += c.acceptablePriorities.includes(r.priority) ? 1 : 0;
  }
  return row;
}

async function main() {
  const n = EVAL_CASES.length;
  const rows: Row[] = [];
  for (const model of models) {
    console.log(`\n${model}`);
    rows.push(await evalModel(model));
  }
  rows.push(evalFallback());

  console.log(`\nResults on ${n} labelled tickets`);
  console.log(
    ["model".padEnd(24), "category", "priority(exact)", "priority(ok)", "errors", "p50 ms", "avg in-tok", "$/1k tickets"].join(" | "),
  );
  for (const r of rows) {
    const sorted = [...r.latencies].sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const avgIn = r.inputTokens.length ? Math.round(r.inputTokens.reduce((s, v) => s + v, 0) / r.inputTokens.length) : null;
    const done = n - r.errors;
    console.log(
      [
        r.label.padEnd(24),
        pct(r.categoryCorrect, done).padStart(8),
        pct(r.priorityExact, done).padStart(15),
        pct(r.priorityAcceptable, done).padStart(12),
        String(r.errors).padStart(6),
        String(p50 ?? "-").padStart(6),
        String(avgIn ?? "-").padStart(10),
        (done ? `$${((r.costUsd / done) * 1000).toFixed(3)}` : "-").padStart(12),
      ].join(" | "),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
