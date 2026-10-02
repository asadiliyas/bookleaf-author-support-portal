"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, Lock, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Conversation } from "@/components/conversation";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { CategoryBadge, StatusBadge } from "@/components/ticket-badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fallbackInterval, useRealtime } from "@/hooks/use-realtime";
import type { Me, TicketDetail } from "@/lib/api-types";
import { ApiClientError, api, errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/format";
import { LiveDot } from "./author-ticket-list";

export function AuthorTicketView({ ticketId, me }: { ticketId: string; me: Me }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const live = useRealtime(
    `ticket-${ticketId}`,
    [
      { table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
      { table: "tickets", filter: `id=eq.${ticketId}` },
    ],
    [["ticket", ticketId], ["tickets"]],
    (event) => {
      if (event.table === "ticket_messages" && event.eventType === "INSERT" && event.record.sender_role === "admin") {
        toast.info("New reply from BookLeaf", { description: String(event.record.sender_name ?? "") });
      }
    },
  );

  const ticket = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}`),
    refetchInterval: fallbackInterval(live),
  });

  const send = useMutation({
    mutationFn: (body: string) => api(`/tickets/${ticketId}/messages`, { method: "POST", json: { body } }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => toast.error("Message not sent", { description: errorMessage(err) }),
  });

  if (ticket.isPending) return <ListSkeleton rows={3} />;
  if (ticket.isError) {
    if (ticket.error instanceof ApiClientError && ticket.error.status === 404) {
      return <EmptyState title="Ticket not found" description="It may have been removed, or it belongs to a different account." action={<Button asChild className="rounded-full"><Link href="/tickets">Back to my tickets</Link></Button>} />;
    }
    return <ErrorState message={errorMessage(ticket.error)} onRetry={() => ticket.refetch()} />;
  }

  const t = ticket.data;
  const awaitingBookLeaf = t.messages.length === 0 || t.messages.at(-1)?.senderRole === "author";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/tickets" className="mb-6 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> My tickets
      </Link>

      <header className="rounded-2xl border border-line bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} />
          <CategoryBadge category={t.category} />
          <span className="text-sm text-muted-foreground">#{t.number}</span>
          <span className="ml-auto">
            <LiveDot live={live} />
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-black">{t.subject}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-4" /> {t.book?.title ?? "General / Account Level"}
          </span>
          <span>Opened {formatDate(t.createdAt)}</span>
          {t.assignee && <span>Handled by {t.assignee.name}</span>}
        </p>
      </header>

      <div className="mt-6">
        <Conversation
          viewer="author"
          authorName={me.name}
          subject={t.subject}
          description={t.description}
          createdAt={t.createdAt}
          messages={t.messages}
          attachments={t.attachments}
        />
      </div>

      {awaitingBookLeaf && t.status !== "closed" && t.status !== "resolved" && (
        <p className="mt-6 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-700">
          Thanks, the BookLeaf team has your message. Replies show up here instantly, no refresh needed.
        </p>
      )}

      <div className="mt-8">
        {t.status === "closed" ? (
          <p className="flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            <Lock className="size-4" /> This ticket is closed. Need more help?{" "}
            <Link href={`/tickets/new${t.book ? `?book=${t.book.id}` : ""}`} className="font-bold text-coral-700 hover:underline">
              Raise a new request
            </Link>
          </p>
        ) : (
          <form
            className="rounded-2xl border border-line bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (reply.trim()) send.mutate(reply.trim());
            }}
          >
            {t.status === "resolved" && (
              <p className="mb-3 flex items-center gap-2 text-sm text-emerald-800">
                <CheckCircle2 className="size-4" /> Marked as resolved. Reply below if anything is still not right and we&apos;ll reopen it.
              </p>
            )}
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="Write a reply to the BookLeaf team…"
              className="border-0 bg-transparent px-1 text-[15px] shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) send.mutate(reply.trim());
              }}
            />
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
              <Button type="submit" disabled={!reply.trim() || send.isPending} className="rounded-full px-5 font-bold">
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Send reply
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
