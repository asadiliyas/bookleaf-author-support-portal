import "server-only";
import type {
  InternalNote,
  Paginated,
  TicketDetail,
  TicketEvent,
  TicketMessage,
  TicketSummary,
} from "@/lib/api-types";
import { STATUS_LABELS, canTransition, type TicketStatus } from "@/lib/domain/constants";
import type {
  CreateMessageInput,
  CreateNoteInput,
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput,
} from "@/lib/schemas";
import { draftSimilarity } from "@/lib/text-similarity";
import type { Database } from "@/types/database";
import { classifyByRules } from "../ai/fallback-classifier";
import type { AuthContext } from "../auth/actor";
import { systemDb } from "../db/clients";
import { check, conflict, forbidden, notFound, tooManyRequests, validationError } from "../http/errors";
import { TICKET_SELECT, toTicketSummary, type TicketRowWithRefs } from "../mappers";
import { listAttachments } from "./attachments";
import { recordEvent } from "./events";

type TicketUpdate = Database["public"]["Tables"]["tickets"]["Update"];

const CREATE_LIMIT_PER_HOUR = 10;

// ---------------------------------------------------------------------------
// Reads (request-scoped client: RLS guarantees authors only see their rows)
// ---------------------------------------------------------------------------
export async function listTickets({ actor, db }: AuthContext, query: ListTicketsQuery): Promise<Paginated<TicketSummary>> {
  let q = db.from("tickets").select(TICKET_SELECT, { count: "exact" });

  // Explicit scoping on top of RLS: intent is visible in code, not only in SQL.
  if (actor.role === "author") q = q.eq("author_id", actor.authorId!);

  if (query.status) q = q.in("status", query.status);
  if (query.category) q = q.in("category", query.category);
  if (query.priority) q = q.in("priority", query.priority);
  if (query.from) q = q.gte("created_at", `${query.from}T00:00:00Z`);
  if (query.to) q = q.lte("created_at", `${query.to}T23:59:59.999Z`);
  if (query.q) {
    const term = query.q.replace(/[%,()]/g, " ").trim();
    const asNumber = Number(term.replace(/^#/, ""));
    q = Number.isInteger(asNumber) && asNumber > 0
      ? q.or(`number.eq.${asNumber},subject.ilike.%${term}%`)
      : q.ilike("subject", `%${term}%`);
  }
  if (actor.role === "admin" && query.assignee) {
    if (query.assignee === "unassigned") q = q.is("assigned_admin_id", null);
    else q = q.eq("assigned_admin_id", query.assignee === "me" ? actor.userId : query.assignee);
  }

  switch (query.sort) {
    case "newest":
      q = q.order("created_at", { ascending: false });
      break;
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "updated":
      q = q.order("last_activity_at", { ascending: false });
      break;
    default:
      // Unresolved first, then critical → low, then oldest first.
      q = q
        .order("is_unresolved", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
  }

  const offset = (query.page - 1) * query.pageSize;
  const result = await q.range(offset, offset + query.pageSize - 1);
  const rows = check(result, "list tickets") as unknown as TicketRowWithRefs[];
  return {
    items: rows.map(toTicketSummary),
    page: query.page,
    pageSize: query.pageSize,
    total: result.count ?? rows.length,
  };
}

async function loadTicketRow({ db }: AuthContext, id: string): Promise<TicketRowWithRefs> {
  const row = check(await db.from("tickets").select(TICKET_SELECT).eq("id", id).maybeSingle(), "load ticket");
  // 404 (not 403) for other authors' tickets: don't reveal that the id exists.
  if (!row) throw notFound("Ticket");
  return row as unknown as TicketRowWithRefs;
}

export async function getTicket(ctx: AuthContext, id: string): Promise<TicketDetail> {
  const row = await loadTicketRow(ctx, id);
  const isAdmin = ctx.actor.role === "admin";

  const [messages, attachments, notes] = await Promise.all([
    listMessages(ctx, id),
    listAttachments(ctx, id),
    isAdmin ? listNotes(ctx, id) : Promise.resolve(undefined),
  ]);

  return {
    ...toTicketSummary(row),
    description: row.description,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    messages,
    attachments,
    ...(isAdmin && {
      notes,
      ai: {
        status: row.ai_status,
        category: row.ai_category,
        priority: row.ai_priority,
        confidence: row.ai_confidence,
        rationale: row.ai_rationale,
        error: row.ai_error,
        classifiedAt: row.ai_classified_at,
      },
    }),
  };
}

async function listMessages({ db }: AuthContext, ticketId: string): Promise<TicketMessage[]> {
  const rows = check(
    await db
      .from("ticket_messages")
      .select("id, sender_role, sender_name, body, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    "list messages",
  );
  return rows.map((m) => ({
    id: m.id,
    senderRole: m.sender_role,
    senderName: m.sender_name,
    body: m.body,
    createdAt: m.created_at,
  }));
}

export async function listNotes({ db }: AuthContext, ticketId: string): Promise<InternalNote[]> {
  const rows = check(
    await db
      .from("ticket_internal_notes")
      .select("id, admin_name, body, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    "list notes",
  );
  return rows.map((n) => ({ id: n.id, adminName: n.admin_name, body: n.body, createdAt: n.created_at }));
}

export async function listEvents(ctx: AuthContext, ticketId: string): Promise<TicketEvent[]> {
  await loadTicketRow(ctx, ticketId);
  const rows = check(
    await ctx.db
      .from("ticket_events")
      .select("id, type, actor_label, payload, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    "list events",
  );
  return rows.map((e) => ({
    id: e.id,
    type: e.type,
    actorLabel: e.actor_label,
    payload: (e.payload ?? {}) as Record<string, unknown>,
    createdAt: e.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Writes (authorised here, executed with the system client)
// ---------------------------------------------------------------------------

/**
 * Creates a ticket with an instant rule-based classification, so the queue is
 * never uncategorised. The caller schedules AI classification afterwards; the
 * author's request never waits on (or fails because of) the AI.
 */
export async function createTicket(ctx: AuthContext, input: CreateTicketInput): Promise<TicketDetail> {
  const { actor, db } = ctx;
  if (actor.role !== "author") throw forbidden("Only authors can raise tickets.");
  const sys = systemDb();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await sys
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("author_id", actor.authorId!)
    .gte("created_at", since);
  if ((recent.count ?? 0) >= CREATE_LIMIT_PER_HOUR) {
    throw tooManyRequests("You've raised several tickets in the last hour. Please wait a little, or add details to an existing ticket.");
  }

  if (input.bookId) {
    const book = check(await db.from("books").select("id").eq("id", input.bookId).maybeSingle(), "check book");
    if (!book) throw validationError("Choose one of your books, or General / Account Level.", [
      { path: "bookId", message: "Book not found on your account" },
    ]);
  }

  const initial = classifyByRules(input.subject, input.description);
  const created = check(
    await sys
      .from("tickets")
      .insert({
        author_id: actor.authorId!,
        book_id: input.bookId,
        subject: input.subject,
        description: input.description,
        category: initial.category,
        priority: initial.priority,
        category_source: "fallback",
        priority_source: "fallback",
        ai_status: "pending",
      })
      .select("id")
      .single(),
    "create ticket",
  );

  await recordEvent(created.id, actor, "created", { bookId: input.bookId });
  return getTicket(ctx, created.id);
}

export async function updateTicket(ctx: AuthContext, id: string, input: UpdateTicketInput): Promise<TicketDetail> {
  const { actor } = ctx;
  if (actor.role !== "admin") throw forbidden();
  const current = await loadTicketRow(ctx, id);
  const sys = systemDb();
  const patch: TicketUpdate = {};
  const events: Promise<void>[] = [];
  const now = new Date().toISOString();

  if (input.status && input.status !== current.status) {
    if (!canTransition(current.status, input.status)) {
      throw conflict(`Can't move a ticket from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[input.status]}.`);
    }
    Object.assign(patch, statusSideEffects(input.status, now));
    events.push(recordEvent(id, actor, "status_changed", { from: current.status, to: input.status }));
  }

  if (input.category && (input.category !== current.category || current.category_source !== "admin")) {
    patch.category = input.category;
    patch.category_source = "admin";
    if (input.category !== current.category) {
      events.push(
        recordEvent(id, actor, "category_changed", {
          from: current.category,
          to: input.category,
          overrodeAi: current.category_source === "ai",
        }),
      );
    }
  }

  if (input.priority && (input.priority !== current.priority || current.priority_source !== "admin")) {
    patch.priority = input.priority;
    patch.priority_source = "admin";
    if (input.priority !== current.priority) {
      events.push(
        recordEvent(id, actor, "priority_changed", {
          from: current.priority,
          to: input.priority,
          overrodeAi: current.priority_source === "ai",
        }),
      );
    }
  }

  if (input.assigneeId !== undefined && input.assigneeId !== current.assigned_admin_id) {
    if (input.assigneeId) {
      const admin = check(
        await sys.from("admins").select("user_id, name").eq("user_id", input.assigneeId).maybeSingle(),
        "check assignee",
      );
      if (!admin) throw validationError("Assignee must be a BookLeaf admin.", [{ path: "assigneeId", message: "Unknown admin" }]);
      events.push(recordEvent(id, actor, "assigned", { to: admin.name, toId: admin.user_id }));
    } else {
      events.push(recordEvent(id, actor, "unassigned", { from: current.assignee?.name ?? null }));
    }
    patch.assigned_admin_id = input.assigneeId;
  }

  if (Object.keys(patch).length > 0) {
    check(await sys.from("tickets").update(patch).eq("id", id).select("id").single(), "update ticket");
    await Promise.all(events);
  }
  return getTicket(ctx, id);
}

function statusSideEffects(status: TicketStatus, now: string): TicketUpdate {
  switch (status) {
    case "resolved":
      return { status, resolved_at: now, last_activity_at: now };
    case "closed":
      return { status, closed_at: now, last_activity_at: now };
    default:
      return { status, resolved_at: null, closed_at: null, last_activity_at: now };
  }
}

/**
 * Posts a message on a ticket and applies the lifecycle rules:
 *  - author reply on a Resolved ticket reopens it (In Progress)
 *  - first admin reply records first_response_at (SLA) and moves Open → In Progress
 *  - admins can set a status together with the reply ("Send & resolve")
 *  - nobody can reply on a Closed ticket (admins reopen it first)
 */
export async function addMessage(ctx: AuthContext, id: string, input: CreateMessageInput): Promise<TicketMessage> {
  const { actor } = ctx;
  const ticket = await loadTicketRow(ctx, id);
  const isAdmin = actor.role === "admin";
  const sys = systemDb();
  const now = new Date().toISOString();

  if (!isAdmin && (input.statusAfter || input.aiDraftId)) {
    throw forbidden("statusAfter and aiDraftId can only be set by admins.");
  }
  if (ticket.status === "closed") {
    throw conflict(
      isAdmin
        ? "This ticket is closed. Reopen it before replying."
        : "This ticket is closed. Please raise a new ticket and mention this one if it's related.",
    );
  }

  // Validate the status change before writing anything.
  const targetStatus: TicketStatus | undefined = isAdmin
    ? (input.statusAfter ?? (ticket.status === "open" ? "in_progress" : undefined))
    : ticket.status === "resolved"
      ? "in_progress"
      : undefined;
  if (targetStatus && targetStatus !== ticket.status && !canTransition(ticket.status, targetStatus)) {
    throw conflict(`Can't move a ticket from ${STATUS_LABELS[ticket.status]} to ${STATUS_LABELS[targetStatus]}.`);
  }

  let similarity: number | null = null;
  if (input.aiDraftId) {
    const draft = check(
      await sys.from("ai_drafts").select("id, reply, ticket_id").eq("id", input.aiDraftId).maybeSingle(),
      "load draft",
    );
    if (!draft || draft.ticket_id !== id) throw validationError("Unknown draft for this ticket.", [{ path: "aiDraftId", message: "Not found" }]);
    similarity = draftSimilarity(draft.reply, input.body);
  }

  const message = check(
    await sys
      .from("ticket_messages")
      .insert({
        ticket_id: id,
        author_id: ticket.author_id,
        sender_role: isAdmin ? "admin" : "author",
        sender_user_id: actor.userId,
        sender_name: isAdmin ? actor.name : (ticket.author?.name ?? actor.name),
        body: input.body,
        ai_draft_id: input.aiDraftId ?? null,
        draft_similarity: similarity,
      })
      .select("id, sender_role, sender_name, body, created_at")
      .single(),
    "create message",
  );

  const patch: TicketUpdate = { last_activity_at: now };
  if (isAdmin) {
    if (!ticket.first_response_at) patch.first_response_at = now;
    if (targetStatus && targetStatus !== ticket.status) {
      Object.assign(patch, statusSideEffects(targetStatus, now));
      await recordEvent(id, actor, "status_changed", { from: ticket.status, to: targetStatus });
    }
    await recordEvent(id, actor, "admin_replied", { fromDraft: Boolean(input.aiDraftId), similarity });
  } else {
    if (targetStatus) {
      Object.assign(patch, statusSideEffects(targetStatus, now));
      await recordEvent(id, null, "reopened", { reason: "Author replied to a resolved ticket" });
    }
    await recordEvent(id, actor, "author_replied");
  }
  check(await sys.from("tickets").update(patch).eq("id", id).select("id").single(), "touch ticket");

  return {
    id: message.id,
    senderRole: message.sender_role,
    senderName: message.sender_name,
    body: message.body,
    createdAt: message.created_at,
  };
}

export async function addNote(ctx: AuthContext, id: string, input: CreateNoteInput): Promise<InternalNote> {
  const { actor } = ctx;
  if (actor.role !== "admin") throw forbidden();
  await loadTicketRow(ctx, id);
  const note = check(
    await systemDb()
      .from("ticket_internal_notes")
      .insert({ ticket_id: id, admin_id: actor.userId, admin_name: actor.name, body: input.body })
      .select("id, admin_name, body, created_at")
      .single(),
    "create note",
  );
  await recordEvent(id, actor, "note_added");
  return { id: note.id, adminName: note.admin_name, body: note.body, createdAt: note.created_at };
}

