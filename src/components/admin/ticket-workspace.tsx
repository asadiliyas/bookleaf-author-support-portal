"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CalendarDays, UserRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { LiveDot } from "@/components/author/author-ticket-list";
import { Conversation } from "@/components/conversation";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { CategoryBadge, PriorityBadge, SlaBadge, StatusBadge } from "@/components/ticket-badges";
import { Button } from "@/components/ui/button";
import { fallbackInterval, useRealtime } from "@/hooks/use-realtime";
import type { Me, TicketDetail } from "@/lib/api-types";
import { ApiClientError, api, errorMessage } from "@/lib/client/api";
import { firstResponseSla } from "@/lib/domain/sla";
import { formatDateTime, timeAgo } from "@/lib/format";
import { ReplyComposer } from "./reply-composer";
import { TicketSidebar } from "./ticket-sidebar";

export function TicketWorkspace({ ticketId, me }: { ticketId: string; me: Me }) {
  const key = ["admin", "ticket", ticketId];
  const live = useRealtime(
    `admin-ticket-${ticketId}`,
    [
      { table: "tickets", filter: `id=eq.${ticketId}` },
      { table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
      { table: "ticket_internal_notes", filter: `ticket_id=eq.${ticketId}` },
      { table: "ticket_events", filter: `ticket_id=eq.${ticketId}` },
    ],
    [key, ["admin", "events", ticketId], ["admin", "tickets"], ["admin", "stats"]],
    (e) => {
      if (e.table === "ticket_messages" && e.eventType === "INSERT" && e.record.sender_role === "author") {
        toast.info("The author replied", { description: "The conversation has been updated." });
      }
    },
  );

  const ticket = useQuery({
    queryKey: key,
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}`),
    refetchInterval: fallbackInterval(live),
  });

  if (ticket.isPending) return <ListSkeleton rows={4} />;
  if (ticket.isError) {
    if (ticket.error instanceof ApiClientError && ticket.error.status === 404) {
      return <EmptyState title="Ticket not found" action={<Button asChild className="rounded-full"><Link href="/admin">Back to queue</Link></Button>} />;
    }
    return <ErrorState message={errorMessage(ticket.error)} onRetry={() => ticket.refetch()} />;
  }

  const t = ticket.data;
  const sla = firstResponseSla({ priority: t.priority, status: t.status, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt });

  return (
    <div>
      <Link href="/admin" className="mb-5 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Ticket queue
      </Link>

      <header className="mb-6 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">#{t.number}</span>
          <StatusBadge status={t.status} />
          <PriorityBadge priority={t.priority} />
          <CategoryBadge category={t.category} />
          <SlaBadge sla={sla} />
          <span className="ml-auto">
            <LiveDot live={live} />
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-black">{t.subject}</h1>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4" /> {t.author.name} ({t.author.id})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" /> {t.book ? `${t.book.title} (${t.book.id})` : "General / Account Level"}
          </span>
          <span className="inline-flex items-center gap-1.5" title={formatDateTime(t.createdAt)}>
            <CalendarDays className="size-4" /> Opened {timeAgo(t.createdAt)}
          </span>
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Conversation
            viewer="admin"
            authorName={t.author.name}
            subject={t.subject}
            description={t.description}
            createdAt={t.createdAt}
            messages={t.messages}
            attachments={t.attachments}
          />
          <ReplyComposer ticket={t} />
        </div>
        <TicketSidebar ticket={t} me={me} />
      </div>
    </div>
  );
}
