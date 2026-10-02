"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Search, ShieldAlert, UserRoundX, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LiveDot } from "@/components/author/author-ticket-list";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { CategoryBadge, PRIORITY_STRIPE, PriorityBadge, SlaBadge, SourceIcon, StatusBadge } from "@/components/ticket-badges";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar } from "@/components/user-menu";
import { fallbackInterval, useRealtime } from "@/hooks/use-realtime";
import type { AdminUser, Paginated, QueueStats, TicketSummary } from "@/lib/api-types";
import { api, errorMessage, toQueryString } from "@/lib/client/api";
import { CATEGORY_LABELS, PRIORITY_LABELS, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/lib/domain/constants";
import { firstResponseSla, formatDuration } from "@/lib/domain/sla";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const ALL = "all";

/** Preset views map onto the same filters the toolbar exposes. */
const VIEWS = [
  { id: "attention", label: "Needs attention", params: { status: "open,in_progress" } },
  { id: "unassigned", label: "Unassigned", params: { status: "open,in_progress", assignee: "unassigned" } },
  { id: "mine", label: "Assigned to me", params: { status: "open,in_progress", assignee: "me" } },
  { id: "urgent", label: "Critical & High", params: { status: "open,in_progress", priority: "critical,high" } },
  { id: "resolved", label: "Resolved", params: { status: "resolved", sort: "updated" } },
  { id: "all", label: "All tickets", params: {} },
] as const;

type Filters = { status?: string; category?: string; priority?: string; assignee?: string; from?: string; to?: string; q?: string; sort?: string };

export function TicketQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const viewId = sp.get("view") ?? "attention";
  const page = Number(sp.get("page") ?? 1);
  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];

  const filters: Filters = {
    ...view.params,
    ...Object.fromEntries(["category", "priority", "assignee", "from", "to", "q", "sort"].map((k) => [k, sp.get(k) ?? undefined]).filter(([, v]) => v)),
  };

  function update(next: Record<string, string | undefined>, resetPage = true) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === ALL) params.delete(k);
      else params.set(k, v);
    }
    if (resetPage) params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const [search, setSearch] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== search) update({ q: search || undefined });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const live = useRealtime("admin-queue", [{ table: "tickets" }], [["admin", "tickets"], ["admin", "stats"]], (e) => {
    if (e.table === "tickets" && e.eventType === "INSERT") {
      toast.info(`New ticket #${e.record.number}`, { description: String(e.record.subject ?? "") });
    }
  });

  const qs = toQueryString({ ...filters, page, pageSize: PAGE_SIZE });
  const tickets = useQuery({
    queryKey: ["admin", "tickets", qs],
    queryFn: () => api<Paginated<TicketSummary>>(`/tickets${qs}`),
    placeholderData: keepPreviousData,
    refetchInterval: fallbackInterval(live),
  });
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api<QueueStats>("/admin/stats"), refetchInterval: fallbackInterval(live, 30_000) });
  const admins = useQuery({ queryKey: ["admins"], queryFn: () => api<{ items: AdminUser[] }>("/admins"), staleTime: 5 * 60_000 });

  // Re-render every minute so ages and SLA countdowns stay current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const hasExtraFilters = ["category", "priority", "assignee", "from", "to", "q"].some((k) => sp.get(k));
  const totalPages = tickets.data ? Math.max(1, Math.ceil(tickets.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black">
            Ticket queue <LiveDot live={live} />
          </h1>
          <p className="mt-1 text-ink-soft">Most urgent first, then oldest. AI triage happens as tickets arrive.</p>
        </div>
      </div>

      <StatsRow stats={stats.data} onPick={(v) => update({ view: v, category: undefined, priority: undefined, assignee: undefined, q: undefined, from: undefined, to: undefined, sort: undefined })} />

      <div className="rounded-2xl border border-line bg-white">
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-3">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => update({ view: v.id === "attention" ? undefined : v.id, assignee: undefined, priority: undefined, sort: undefined })}
              className={cn(
                "-mb-px border-b-2 px-3 pb-2.5 text-sm whitespace-nowrap transition",
                v.id === view.id ? "border-coral-600 font-bold text-coral-800" : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject or #number" className="h-9 bg-paper pl-9" />
          </div>
          <FilterSelect label="Category" value={sp.get("category") ?? ALL} onChange={(v) => update({ category: v })} options={TICKET_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]])} />
          <FilterSelect label="Priority" value={sp.get("priority") ?? ALL} onChange={(v) => update({ priority: v })} options={TICKET_PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]])} />
          <FilterSelect
            label="Assignee"
            value={sp.get("assignee") ?? ALL}
            onChange={(v) => update({ assignee: v })}
            options={[["me", "Assigned to me"], ["unassigned", "Unassigned"], ...(admins.data?.items.map((a) => [a.id, a.name] as [string, string]) ?? [])]}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            From
            <Input type="date" value={sp.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} className="h-9 w-[140px] bg-paper" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            To
            <Input type="date" value={sp.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} className="h-9 w-[140px] bg-paper" />
          </label>
          <FilterSelect
            label="Sort"
            value={sp.get("sort") ?? ALL}
            onChange={(v) => update({ sort: v })}
            allLabel="Urgency, then oldest"
            options={[["newest", "Newest first"], ["oldest", "Oldest first"], ["updated", "Recently active"]]}
          />
          {hasExtraFilters && (
            <button
              onClick={() => {
                setSearch("");
                update({ category: undefined, priority: undefined, assignee: undefined, from: undefined, to: undefined, q: undefined, sort: undefined });
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-paper"
            >
              <X className="size-3.5" /> Clear
            </button>
          )}
        </div>

        {tickets.isPending && <ListSkeleton className="p-4" />}
        {tickets.isError && (
          <div className="p-4">
            <ErrorState message={errorMessage(tickets.error)} onRetry={() => tickets.refetch()} />
          </div>
        )}
        {tickets.data && tickets.data.items.length === 0 && (
          <EmptyState className="m-4 border-none" icon={Inbox} title="Nothing in this view" description={view.id === "attention" && !hasExtraFilters ? "Every open ticket has been handled. Nice work." : "No tickets match these filters."} />
        )}
        {tickets.data && tickets.data.items.length > 0 && (
          <div className={cn("overflow-x-auto transition-opacity", tickets.isPlaceholderData && "opacity-60")}>
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <th className="w-1 p-0" />
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Assignee</th>
                  <th className="px-3 py-3">Age</th>
                </tr>
              </thead>
              <tbody>
                {tickets.data.items.map((t) => (
                  <QueueRow key={t.id} t={t} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tickets.data && tickets.data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-soft">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tickets.data.total)} of {tickets.data.total}
            </span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)} className="rounded-lg p-1.5 hover:bg-paper disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </button>
              <button disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) }, false)} className="rounded-lg p-1.5 hover:bg-paper disabled:opacity-40" aria-label="Next page">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({ t, now }: { t: TicketSummary; now: Date }) {
  const sla = useMemo(
    () => firstResponseSla({ priority: t.priority, status: t.status, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt, now }),
    [t, now],
  );
  const href = `/admin/tickets/${t.id}`;
  return (
    <tr className={cn("group border-b border-line last:border-0 hover:bg-paper", sla.state === "breached" && "bg-red-50/40")}>
      <td className="p-0">
        <div className={cn("h-full min-h-[64px] w-1", PRIORITY_STRIPE[t.priority])} />
      </td>
      <td className="max-w-[420px] px-4 py-3">
        <Link href={href} className="block">
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#{t.number}</span>
            {t.aiStatus === "pending" && <span className="animate-pulse text-[11px] font-bold text-navy-600">AI triaging…</span>}
          </span>
          <span className="block truncate font-bold text-ink group-hover:text-coral-700">{t.subject}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {t.author.name} · {t.book?.title ?? "General / Account"}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5">
          <CategoryBadge category={t.category} short />
          <SourceIcon source={t.categorySource} />
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5">
          <PriorityBadge priority={t.priority} />
          <SourceIcon source={t.prioritySource} />
        </span>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={t.status} />
      </td>
      <td className="px-3 py-3">
        {t.assignee ? (
          <span className="flex items-center gap-2">
            <Avatar name={t.assignee.name} className="size-6 text-[10px]" />
            <span className="truncate">{t.assignee.name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <UserRoundX className="size-4" /> Unassigned
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="flex flex-col items-start gap-1">
          <span className="tabular text-ink-soft" title={formatDateTime(t.createdAt)}>
            {formatDuration(now.getTime() - new Date(t.createdAt).getTime())}
          </span>
          <SlaBadge sla={sla} />
        </span>
      </td>
    </tr>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 min-w-[140px] bg-paper text-sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel ?? `All ${label.toLowerCase()}`}</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatsRow({ stats, onPick }: { stats?: QueueStats; onPick: (view: string) => void }) {
  const items = [
    { label: "Open", value: stats ? stats.open + stats.inProgress : null, sub: stats ? `${stats.inProgress} in progress` : "", view: "attention", icon: Inbox },
    { label: "Critical & High", value: stats?.criticalOrHigh ?? null, sub: "unresolved", view: "urgent", icon: AlertTriangle, tone: "text-red-700" },
    { label: "Past first-response target", value: stats?.slaBreached ?? null, sub: "awaiting a first reply", view: "attention", icon: ShieldAlert, tone: stats?.slaBreached ? "text-red-700" : undefined },
    { label: "Unassigned", value: stats?.unassigned ?? null, sub: "nobody owns these yet", view: "unassigned", icon: UserRoundX },
    { label: "Assigned to me", value: stats?.mine ?? null, sub: "open tickets", view: "mine", icon: Inbox },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((s) => (
        <button key={s.label} onClick={() => onPick(s.view)} className="rounded-2xl border border-line bg-white p-4 text-left transition hover:border-coral-200">
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <s.icon className="size-3.5 text-coral-600" /> {s.label}
          </p>
          <p className={cn("tabular mt-1.5 text-2xl font-black text-ink", s.tone)}>{s.value ?? "–"}</p>
          <p className="text-xs text-muted-foreground">{s.sub}</p>
        </button>
      ))}
    </div>
  );
}
