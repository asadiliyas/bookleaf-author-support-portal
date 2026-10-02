import "server-only";
import type { AdminUser, AiUsageStats, QueueStats } from "@/lib/api-types";
import { UNRESOLVED_STATUSES } from "@/lib/domain/constants";
import { firstResponseSla } from "@/lib/domain/sla";
import { estimateCostUsd } from "../ai/pricing";
import type { AuthContext } from "../auth/actor";
import { check, forbidden } from "../http/errors";

export async function getQueueStats({ actor, db }: AuthContext): Promise<QueueStats> {
  if (actor.role !== "admin") throw forbidden();
  const rows = check(
    await db
      .from("tickets")
      .select("status, priority, assigned_admin_id, first_response_at, created_at, resolved_at, category_source, priority_source, ai_status"),
    "queue stats",
  );
  const now = new Date();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const unresolved = rows.filter((r) => UNRESOLVED_STATUSES.includes(r.status));

  return {
    open: rows.filter((r) => r.status === "open").length,
    inProgress: rows.filter((r) => r.status === "in_progress").length,
    unassigned: unresolved.filter((r) => !r.assigned_admin_id).length,
    mine: unresolved.filter((r) => r.assigned_admin_id === actor.userId).length,
    criticalOrHigh: unresolved.filter((r) => r.priority === "critical" || r.priority === "high").length,
    slaBreached: unresolved.filter(
      (r) =>
        firstResponseSla({
          priority: r.priority,
          status: r.status,
          createdAt: r.created_at,
          firstResponseAt: r.first_response_at,
          now,
        }).state === "breached",
    ).length,
    // Fallback-classified tickets deserve a human glance.
    needsReview: unresolved.filter(
      (r) => r.ai_status === "failed" && (r.category_source === "fallback" || r.priority_source === "fallback"),
    ).length,
    resolvedLast7Days: rows.filter((r) => r.resolved_at && new Date(r.resolved_at).getTime() >= weekAgo).length,
  };
}

export async function getAiUsageStats({ actor, db }: AuthContext, windowDays = 30): Promise<AiUsageStats> {
  if (actor.role !== "admin") throw forbidden();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [requests, tickets, drafts, messages] = await Promise.all([
    db
      .from("ai_requests")
      .select("operation, model, outcome, error_code, input_tokens, output_tokens, cached_tokens, thinking_tokens, latency_ms, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    db
      .from("tickets")
      .select("category, priority, ai_category, ai_priority, ai_status, category_source, priority_source")
      .gte("created_at", since),
    db.from("ai_drafts").select("cache_hits").gte("created_at", since),
    db
      .from("ticket_messages")
      .select("draft_similarity")
      .eq("sender_role", "admin")
      .not("ai_draft_id", "is", null)
      .gte("created_at", since),
  ]);

  const reqRows = check(requests, "ai requests");
  const ticketRows = check(tickets, "ai tickets");
  const draftRows = check(drafts, "ai drafts");
  const messageRows = check(messages, "draft replies");

  const avg = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);
  const sumOf = (pick: (r: (typeof reqRows)[number]) => number | null) => reqRows.reduce((s, r) => s + (pick(r) ?? 0), 0);

  const byOperation = (["classify", "draft"] as const).map((operation) => {
    const ops = reqRows.filter((r) => r.operation === operation);
    const ok = ops.filter((r) => r.outcome === "success");
    return {
      operation,
      requests: ops.length,
      failures: ops.length - ok.length,
      avgInputTokens: avg(ok.map((r) => r.input_tokens ?? 0)),
      avgOutputTokens: avg(ok.map((r) => (r.output_tokens ?? 0) + (r.thinking_tokens ?? 0))),
      avgLatencyMs: avg(ok.map((r) => r.latency_ms ?? 0)),
    };
  });

  const classified = ticketRows.filter((t) => t.ai_status === "completed" && t.ai_category && t.ai_priority);
  const categoryOverrides = classified.filter((t) => t.category_source === "admin" && t.category !== t.ai_category).length;
  const priorityOverrides = classified.filter((t) => t.priority_source === "admin" && t.priority !== t.ai_priority).length;
  const similarities = messageRows.map((m) => m.draft_similarity).filter((v): v is number => v !== null);

  return {
    windowDays,
    totals: {
      requests: reqRows.length,
      failures: reqRows.filter((r) => r.outcome === "error").length,
      inputTokens: sumOf((r) => r.input_tokens),
      outputTokens: sumOf((r) => (r.output_tokens ?? 0) + (r.thinking_tokens ?? 0)),
      cachedTokens: sumOf((r) => r.cached_tokens),
      avgLatencyMs: avg(reqRows.filter((r) => r.outcome === "success").map((r) => r.latency_ms ?? 0)),
      estimatedCostUsd: reqRows.reduce(
        (s, r) =>
          s +
          estimateCostUsd(r.model, {
            input: r.input_tokens ?? 0,
            output: r.output_tokens ?? 0,
            cached: r.cached_tokens ?? 0,
            thinking: r.thinking_tokens ?? 0,
          }),
        0,
      ),
    },
    byOperation,
    classification: {
      classified: classified.length,
      categoryOverrides,
      priorityOverrides,
      categoryAgreement: classified.length ? 1 - categoryOverrides / classified.length : null,
      priorityAgreement: classified.length ? 1 - priorityOverrides / classified.length : null,
      fallbackUsed: ticketRows.filter((t) => t.ai_status === "failed").length,
    },
    drafts: {
      generated: draftRows.length,
      cacheHits: draftRows.reduce((s, d) => s + d.cache_hits, 0),
      repliesFromDraft: similarities.length,
      avgSimilarity: similarities.length
        ? Math.round((similarities.reduce((s, v) => s + v, 0) / similarities.length) * 1000) / 1000
        : null,
    },
    recentFailures: reqRows
      .filter((r) => r.outcome === "error")
      .slice(0, 8)
      .map((r) => ({ createdAt: r.created_at, operation: r.operation, errorCode: r.error_code, model: r.model })),
  };
}

export async function listAdmins({ actor, db }: AuthContext): Promise<AdminUser[]> {
  if (actor.role !== "admin") throw forbidden();
  const rows = check(await db.from("admins").select("user_id, name, email").order("name"), "list admins");
  return rows.map((r) => ({ id: r.user_id, name: r.name, email: r.email }));
}
