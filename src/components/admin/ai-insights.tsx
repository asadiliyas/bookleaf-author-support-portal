"use client";

import { useQuery } from "@tanstack/react-query";
import { Bot, Coins, Gauge, PenLine, ShieldCheck, Timer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ErrorState, ListSkeleton } from "@/components/states";
import type { AiUsageStats } from "@/lib/api-types";
import { api, errorMessage } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-IN"));

export function AiInsights() {
  const [days, setDays] = useState(30);
  const stats = useQuery({ queryKey: ["admin", "ai-usage", days], queryFn: () => api<AiUsageStats>(`/admin/ai-usage?days=${days}`) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">AI insights</h1>
          <p className="mt-1 max-w-2xl text-ink-soft">
            How the AI is performing: cost, latency, reliability, and how often the team agrees with it. Every AI call is logged with
            its token usage.
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={cn("rounded-full px-3 py-1 text-sm", d === days ? "bg-coral-600 font-bold text-white" : "text-ink-soft")}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {stats.isPending && <ListSkeleton rows={3} />}
      {stats.isError && <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />}
      {stats.data && <Body s={stats.data} />}
    </div>
  );
}

function Body({ s }: { s: AiUsageStats }) {
  const failureRate = s.totals.requests ? s.totals.failures / s.totals.requests : null;
  const tiles = [
    { icon: Bot, label: "AI calls", value: num(s.totals.requests), sub: `${s.totals.failures} failed (${pct(failureRate)})` },
    { icon: Coins, label: "Estimated cost", value: `$${s.totals.estimatedCostUsd.toFixed(4)}`, sub: "at paid-tier list prices" },
    { icon: Gauge, label: "Tokens", value: num(s.totals.inputTokens + s.totals.outputTokens), sub: `${num(s.totals.inputTokens)} in · ${num(s.totals.outputTokens)} out` },
    { icon: Timer, label: "Avg latency", value: s.totals.avgLatencyMs ? `${(s.totals.avgLatencyMs / 1000).toFixed(1)}s` : "–", sub: "successful calls" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs text-ink-soft">
              <t.icon className="size-3.5 text-coral-600" /> {t.label}
            </p>
            <p className="tabular mt-1.5 text-2xl font-black text-ink">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={ShieldCheck} title="Classification quality" note="Agreement = share of AI-classified tickets the team did not override.">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Category agreement" value={pct(s.classification.categoryAgreement)} />
            <Metric label="Priority agreement" value={pct(s.classification.priorityAgreement)} />
            <Metric label="Tickets classified by AI" value={num(s.classification.classified)} />
            <Metric label="Fell back to rules" value={num(s.classification.fallbackUsed)} tone={s.classification.fallbackUsed ? "warn" : undefined} />
            <Metric label="Category overrides" value={num(s.classification.categoryOverrides)} />
            <Metric label="Priority overrides" value={num(s.classification.priorityOverrides)} />
          </div>
        </Card>

        <Card icon={PenLine} title="Reply drafts" note="Kept = word-level similarity between the AI draft and the reply actually sent.">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Drafts generated" value={num(s.drafts.generated)} />
            <Metric label="Served from cache" value={num(s.drafts.cacheHits)} sub="no tokens spent" />
            <Metric label="Replies sent from a draft" value={num(s.drafts.repliesFromDraft)} />
            <Metric label="Avg. draft kept" value={pct(s.drafts.avgSimilarity)} />
          </div>
        </Card>
      </div>

      <Card icon={Gauge} title="By operation">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                <th className="py-2">Operation</th>
                <th className="py-2">Calls</th>
                <th className="py-2">Failures</th>
                <th className="py-2">Avg input tokens</th>
                <th className="py-2">Avg output tokens*</th>
                <th className="py-2">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {s.byOperation.map((o) => (
                <tr key={o.operation} className="border-t border-line">
                  <td className="py-2.5 font-bold capitalize">{o.operation === "classify" ? "Classification" : "Reply draft"}</td>
                  <td className="tabular">{o.requests}</td>
                  <td className="tabular">{o.failures}</td>
                  <td className="tabular">{num(o.avgInputTokens)}</td>
                  <td className="tabular">{num(o.avgOutputTokens)}</td>
                  <td className="tabular">{o.avgLatencyMs ? `${(o.avgLatencyMs / 1000).toFixed(1)}s` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">*Includes thinking tokens, which are billed as output.</p>
        </div>
      </Card>

      <Card icon={TriangleAlert} title="Recent AI failures" note="Tickets are never blocked by these: classification falls back to rules, drafts fall back to manual replies.">
        {s.recentFailures.length === 0 ? (
          <p className="text-sm text-ink-soft">No failures in this period.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {s.recentFailures.map((f, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-bold capitalize">{f.operation}</span> · {f.errorCode ?? "unknown"} {f.model && <span className="text-muted-foreground">on {f.model}</span>}
                </span>
                <span className="text-muted-foreground">{formatDateTime(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Card({ icon: Icon, title, note, children }: { icon: React.ComponentType<{ className?: string }>; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink">
        <Icon className="size-4 text-coral-600" /> {title}
      </h2>
      {note && <p className="mb-4 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular text-xl font-black text-ink", tone === "warn" && "text-amber-700")}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
