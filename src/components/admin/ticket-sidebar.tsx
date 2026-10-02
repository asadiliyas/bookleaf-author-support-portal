"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Loader2,
  Lock,
  NotebookPen,
  RefreshCw,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CATEGORY_ICONS, SourceIcon } from "@/components/ticket-badges";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminUser, AuthorContext, Me, TicketDetail, TicketEvent } from "@/lib/api-types";
import { api, errorMessage } from "@/lib/client/api";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "@/lib/domain/constants";
import { formatDate, formatDateTime, inr, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const UNASSIGNED = "unassigned";

export function TicketSidebar({ ticket, me }: { ticket: TicketDetail; me: Me }) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-6">
      <Properties ticket={ticket} me={me} />
      <AiTriage ticket={ticket} />
      <AuthorContextCard ticketId={ticket.id} />
      <Notes ticket={ticket} />
      <Timeline ticketId={ticket.id} />
    </aside>
  );
}

function Panel({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon className="size-4 text-coral-600" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function usePatchTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<TicketDetail>(`/tickets/${ticketId}`, { method: "PATCH", json: patch }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "ticket", ticketId], updated);
      queryClient.invalidateQueries({ queryKey: ["admin", "events", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (err) => toast.error("Update failed", { description: errorMessage(err) }),
  });
}

function Properties({ ticket, me }: { ticket: TicketDetail; me: Me }) {
  const patch = usePatchTicket(ticket.id);
  const admins = useQuery({ queryKey: ["admins"], queryFn: () => api<{ items: AdminUser[] }>("/admins"), staleTime: 5 * 60_000 });
  const allowedStatuses = [ticket.status, ...STATUS_TRANSITIONS[ticket.status]];

  return (
    <Panel
      title="Properties"
      icon={UserRoundCheck}
      action={patch.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
    >
      <dl className="space-y-3 text-sm">
        <Row label="Status">
          <Select value={ticket.status} onValueChange={(v) => patch.mutate({ status: v }, { onSuccess: () => toast.success(`Status: ${STATUS_LABELS[v as keyof typeof STATUS_LABELS]}`) })}>
            <SelectTrigger className="h-9 w-full bg-paper"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allowedStatuses.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Priority" source={<SourceIcon source={ticket.prioritySource} />}>
          <Select value={ticket.priority} onValueChange={(v) => patch.mutate({ priority: v as TicketPriority })}>
            <SelectTrigger className="h-9 w-full bg-paper"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Category" source={<SourceIcon source={ticket.categorySource} />}>
          <Select value={ticket.category} onValueChange={(v) => patch.mutate({ category: v as TicketCategory })}>
            <SelectTrigger className="h-9 w-full bg-paper"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Assignee">
          <div className="flex gap-2">
            <Select value={ticket.assignee?.id ?? UNASSIGNED} onValueChange={(v) => patch.mutate({ assigneeId: v === UNASSIGNED ? null : v })}>
              <SelectTrigger className="h-9 min-w-0 flex-1 bg-paper"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {admins.data?.items.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.id === me.userId ? `${a.name} (me)` : a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ticket.assignee?.id !== me.userId && (
              <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => patch.mutate({ assigneeId: me.userId }, { onSuccess: () => toast.success("Assigned to you") })}>
                Take it
              </Button>
            )}
          </div>
        </Row>
      </dl>
    </Panel>
  );
}

function Row({ label, source, children }: { label: string; source?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        {label} {source}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function AiTriage({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient();
  const ai = ticket.ai;
  const retry = useMutation({
    mutationFn: () => api<TicketDetail>(`/tickets/${ticket.id}/classification`, { method: "POST" }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "ticket", ticket.id], updated);
      queryClient.invalidateQueries({ queryKey: ["admin", "events", ticket.id] });
      if (updated.ai?.status === "completed") toast.success("Re-classified by AI");
      else toast.warning("AI still unavailable", { description: "The rule-based classification stays in place." });
    },
    onError: (err) => toast.error("Couldn't re-run classification", { description: errorMessage(err) }),
  });
  if (!ai) return null;

  const CatIcon = ai.category ? CATEGORY_ICONS[ai.category] : Bot;
  const overridden =
    (ticket.categorySource === "admin" && ai.category && ai.category !== ticket.category) ||
    (ticket.prioritySource === "admin" && ai.priority && ai.priority !== ticket.priority);

  return (
    <Panel
      title="AI triage"
      icon={Bot}
      action={
        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => retry.mutate()} disabled={retry.isPending}>
          <RefreshCw className={cn("size-3.5", retry.isPending && "animate-spin")} /> Re-run
        </Button>
      }
    >
      {ai.status === "pending" && (
        <p className="flex items-center gap-2 text-sm text-navy-700">
          <Loader2 className="size-4 animate-spin" /> Classifying… the rule-based triage is shown meanwhile.
        </p>
      )}
      {ai.status === "failed" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          AI classification unavailable ({ai.error ?? "unknown"}). Using the rule-based triage: please double-check category and priority.
        </p>
      )}
      {ai.status === "completed" && ai.category && ai.priority && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <CatIcon className="size-4 text-coral-600" />
            <span className="font-bold text-ink">{CATEGORY_LABELS[ai.category]}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-ink">{PRIORITY_LABELS[ai.priority]}</span>
          </div>
          {ai.confidence !== null && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Confidence</span>
                <span className="tabular">{Math.round(ai.confidence * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div className={cn("h-full rounded-full", ai.confidence >= 0.75 ? "bg-emerald-500" : ai.confidence >= 0.5 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${ai.confidence * 100}%` }} />
              </div>
            </div>
          )}
          {ai.rationale && <p className="rounded-lg bg-paper px-3 py-2 text-ink-soft italic">&ldquo;{ai.rationale}&rdquo;</p>}
          {overridden && <p className="text-xs font-bold text-emerald-700">Overridden by the ops team; the AI will not change it back.</p>}
          <p className="text-xs text-muted-foreground">Classified {ai.classifiedAt ? timeAgo(ai.classifiedAt) : ""}</p>
        </div>
      )}
    </Panel>
  );
}

function AuthorContextCard({ ticketId }: { ticketId: string }) {
  const ctx = useQuery({ queryKey: ["admin", "context", ticketId], queryFn: () => api<AuthorContext>(`/tickets/${ticketId}/context`) });
  return (
    <Panel title="Author & book" icon={NotebookPen}>
      {ctx.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {ctx.isError && <p className="text-sm text-destructive">{errorMessage(ctx.error)}</p>}
      {ctx.data && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-bold text-ink">{ctx.data.author.name}</p>
            <p className="text-muted-foreground">{ctx.data.author.email}</p>
            <p className="text-muted-foreground">
              {ctx.data.author.city} · author since {formatDate(ctx.data.author.joinedDate)} · {ctx.data.totalTickets} ticket{ctx.data.totalTickets === 1 ? "" : "s"} ({ctx.data.openTickets} open)
            </p>
          </div>
          {ctx.data.book ? (
            <div className="rounded-xl bg-paper p-3">
              <p className="font-bold text-ink">{ctx.data.book.title}</p>
              <p className="text-xs text-muted-foreground">ISBN {ctx.data.book.isbn} · {ctx.data.book.statusLabel}</p>
              {ctx.data.book.isPublished ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <Fact label="Published" value={formatDate(ctx.data.book.publicationDate)} />
                  <Fact label="MRP / royalty" value={`${inr(ctx.data.book.mrp)} / ${inr(ctx.data.book.royaltyPerCopy)}`} />
                  <Fact label="Copies sold" value={ctx.data.book.copiesSold.toLocaleString("en-IN")} />
                  <Fact label="Earned" value={inr(ctx.data.book.royaltyEarned)} />
                  <Fact label="Paid" value={inr(ctx.data.book.royaltyPaid)} />
                  <Fact label="Pending" value={inr(ctx.data.book.royaltyPending)} />
                  <Fact label="Last payout" value={formatDate(ctx.data.book.lastPayoutDate, "Never")} />
                  <Fact label="Printer" value={ctx.data.book.printPartner ?? "—"} />
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Listed on</dt>
                    <dd className="font-bold text-ink">{ctx.data.book.availableOn.join(", ")}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-ink-soft">In production; no sales or royalties yet.</p>
              )}
              <p className={cn("mt-2 rounded-lg px-2 py-1.5 text-xs", ctx.data.book.royalty.state === "likely_overdue" ? "bg-amber-50 text-amber-900" : "bg-white text-ink-soft")}>
                {ctx.data.book.royalty.staffSummary}
              </p>
            </div>
          ) : (
            <p className="text-ink-soft">Account-level ticket (no specific book).</p>
          )}
          {ctx.data.otherBooks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-muted-foreground">{ctx.data.book ? "Other books" : "Books"}</p>
              <ul className="space-y-0.5">
                {ctx.data.otherBooks.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2 text-xs">
                    <span className="truncate text-ink">{b.title}</span>
                    <span className="shrink-0 text-muted-foreground">{b.statusLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-bold text-ink">{value}</dd>
    </div>
  );
}

function Notes({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () => api(`/tickets/${ticket.id}/notes`, { method: "POST", json: { body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["admin", "ticket", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "events", ticket.id] });
    },
    onError: (err) => toast.error("Note not saved", { description: errorMessage(err) }),
  });
  const notes = ticket.notes ?? [];
  return (
    <Panel title="Internal notes" icon={Lock} action={<span className="text-[11px] text-muted-foreground">Never visible to the author</span>}>
      {notes.length > 0 && (
        <ul className="mb-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-amber-50/60 px-3 py-2 text-sm ring-1 ring-amber-100">
              <p className="whitespace-pre-wrap text-ink">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.adminName} · {formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
        className="space-y-2"
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add a note for the team…" className="bg-paper text-sm" />
        <Button type="submit" size="sm" variant="outline" className="w-full rounded-lg" disabled={!body.trim() || add.isPending}>
          {add.isPending && <Loader2 className="animate-spin" />} Add note
        </Button>
      </form>
    </Panel>
  );
}

function Timeline({ ticketId }: { ticketId: string }) {
  const events = useQuery({
    queryKey: ["admin", "events", ticketId],
    queryFn: () => api<{ items: TicketEvent[] }>(`/tickets/${ticketId}/events`),
  });
  return (
    <Panel title="Activity" icon={Activity}>
      {events.data && (
        <ol className="relative space-y-3 border-l border-line pl-4">
          {[...events.data.items].reverse().map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-white bg-coral-400" />
              <p className="text-ink">
                <span className="font-bold">{e.actorLabel}</span> {describeEvent(e)}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function label(map: Record<string, string>, value: unknown) {
  return typeof value === "string" ? (map[value] ?? value) : "";
}

function describeEvent(e: TicketEvent): string {
  const p = e.payload;
  switch (e.type) {
    case "created":
      return "raised the ticket";
    case "ai_classified":
      return `classified it as ${label(CATEGORY_LABELS, p.category)} · ${label(PRIORITY_LABELS, p.priority)}${p.policyRule ? " (priority raised by policy rule)" : ""}`;
    case "ai_classification_failed":
      return `couldn't classify (${String(p.reason ?? "error")}); rule-based triage kept`;
    case "status_changed":
      return `changed status ${label(STATUS_LABELS, p.from)} → ${label(STATUS_LABELS, p.to)}`;
    case "category_changed":
      return `changed category to ${label(CATEGORY_LABELS, p.to)}${p.overrodeAi ? " (overriding AI)" : ""}`;
    case "priority_changed":
      return `changed priority to ${label(PRIORITY_LABELS, p.to)}${p.overrodeAi ? " (overriding AI)" : ""}`;
    case "assigned":
      return `assigned it to ${String(p.to ?? "")}`;
    case "unassigned":
      return "unassigned it";
    case "admin_replied":
      return p.fromDraft ? `replied using the AI draft (${Math.round(Number(p.similarity ?? 0) * 100)}% kept)` : "replied";
    case "author_replied":
      return "replied";
    case "note_added":
      return "added an internal note";
    case "reopened":
      return "reopened the ticket (author replied)";
    default:
      return e.type;
  }
}
