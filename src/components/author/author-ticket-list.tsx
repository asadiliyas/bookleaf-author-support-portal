"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquareText, Plus, Radio } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { CategoryBadge, StatusBadge } from "@/components/ticket-badges";
import { Button } from "@/components/ui/button";
import { fallbackInterval, useRealtime } from "@/hooks/use-realtime";
import type { Paginated, TicketSummary } from "@/lib/api-types";
import { api, errorMessage, toQueryString } from "@/lib/client/api";
import type { TicketStatus } from "@/lib/domain/constants";
import { formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS: { label: string; status?: TicketStatus[] }[] = [
  { label: "All" },
  { label: "Open", status: ["open", "in_progress"] },
  { label: "Resolved", status: ["resolved"] },
  { label: "Closed", status: ["closed"] },
];

export function AuthorTicketList({ authorId }: { authorId: string }) {
  const [tab, setTab] = useState(0);
  const status = TABS[tab].status?.join(",");
  const live = useRealtime(
    "author-tickets",
    [
      { table: "tickets", filter: `author_id=eq.${authorId}` },
      { table: "ticket_messages", filter: `author_id=eq.${authorId}` },
    ],
    [["tickets"]],
  );
  const query = useQuery({
    queryKey: ["tickets", "mine", status],
    queryFn: () => api<Paginated<TicketSummary>>(`/tickets${toQueryString({ status, sort: "updated", pageSize: 50 })}`),
    refetchInterval: fallbackInterval(live),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">My tickets</h1>
          <p className="mt-1 flex items-center gap-2 text-ink-soft">
            Every request you&apos;ve raised and every reply from the BookLeaf team.
            <LiveDot live={live} />
          </p>
        </div>
        <Button asChild className="h-10 rounded-full px-5 font-bold">
          <Link href="/tickets/new">
            <Plus /> New support request
          </Link>
        </Button>
      </div>

      <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-line sm:w-fit">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTab(i)}
            className={cn("flex-1 rounded-full px-4 py-1.5 text-sm transition sm:flex-none", i === tab ? "bg-coral-600 font-bold text-white" : "text-ink-soft hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.isPending && <ListSkeleton />}
      {query.isError && <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title={tab === 0 ? "No tickets yet" : "Nothing here"}
          description={tab === 0 ? "Questions about royalties, ISBNs, printing or your book's status? We usually reply within a day." : "No tickets match this filter."}
          action={
            tab === 0 && (
              <Button asChild className="rounded-full font-bold">
                <Link href="/tickets/new">Raise your first request</Link>
              </Button>
            )
          }
        />
      )}
      {query.data && query.data.items.length > 0 && (
        <ul className="space-y-3">
          {query.data.items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-line bg-white px-5 py-4 transition hover:border-coral-200 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={t.status} />
                    <CategoryBadge category={t.category} short />
                    <span className="text-xs text-muted-foreground">#{t.number}</span>
                  </div>
                  <p className="mt-2 truncate text-[16px] font-bold text-ink group-hover:text-coral-700">{t.subject}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t.book?.title ?? "General / Account Level"} · opened {formatDate(t.createdAt)} · last update {timeAgo(t.lastActivityAt)}
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", live ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500")}
      title={live ? "Updates arrive in real time" : "Reconnecting: checking for updates every 20 seconds"}
    >
      <Radio className={cn("size-3", live && "animate-pulse")} />
      {live ? "Live" : "Syncing"}
    </span>
  );
}
