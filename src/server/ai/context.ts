import "server-only";
import {
  DISTRIBUTION_PLATFORMS,
  PRODUCTION_STAGES,
  ROYALTY_MIN_PAYOUT_INR,
  STAGE_LABELS,
  bookStatusLabel,
  stageIndex,
  type TicketCategory,
} from "@/lib/domain/constants";
import { assessRoyalty, daysBetween, formatLongDate } from "@/lib/domain/royalty";
import { inr } from "@/lib/format";
import { systemDb } from "../db/clients";
import { check } from "../http/errors";
import type { AuthorRow, BookRow, TicketRow } from "../mappers";

/**
 * Everything the AI layer may know about a ticket, loaded once.
 *
 * Privacy: only what a reply needs is ever rendered into a prompt: the
 * author's first name and book/royalty data. Email, phone and city never
 * leave our system.
 */
export interface TicketAiContext {
  ticket: TicketRow;
  author: AuthorRow;
  book: BookRow | null;
  /** All of the author's books (used for account-level tickets). */
  books: BookRow[];
  messages: { id: string; sender_role: "author" | "admin"; sender_name: string; body: string; created_at: string }[];
}

export async function loadTicketAiContext(ticketId: string): Promise<TicketAiContext | null> {
  const db = systemDb();
  const ticket = check(await db.from("tickets").select("*").eq("id", ticketId).maybeSingle(), "load ticket");
  if (!ticket) return null;

  const [author, books, messages] = await Promise.all([
    db.from("authors").select("*").eq("id", ticket.author_id).single(),
    db.from("books").select("*").eq("author_id", ticket.author_id).order("id"),
    db
      .from("ticket_messages")
      .select("id, sender_role, sender_name, body, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
  ]);

  const allBooks = check(books, "load books");
  return {
    ticket,
    author: check(author, "load author"),
    book: allBooks.find((b) => b.id === ticket.book_id) ?? null,
    books: allBooks,
    messages: check(messages, "load messages"),
  };
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

// ---------------------------------------------------------------------------
// Facts: computed in code, rendered as terse lines the model must treat as truth
// ---------------------------------------------------------------------------

function bookFacts(book: BookRow, category: TicketCategory, asOf: Date): string[] {
  const published = book.stage === "published_live";
  const lines: string[] = [];
  lines.push(`Book: "${book.title}" (${book.genre}), ISBN ${book.isbn}`);

  if (!published) {
    const idx = stageIndex(book.stage);
    const next = PRODUCTION_STAGES[idx + 1];
    lines.push(
      `Production status: ${bookStatusLabel(book.stage)} (stage ${idx + 1} of ${PRODUCTION_STAGES.length}; next: ${next ? STAGE_LABELS[next] : "n/a"}).`,
      "Not yet published: no MRP, sales or royalties yet; no platform listings yet.",
      "Stage start date is not tracked in our system: do not claim how long the book has been in this stage beyond what the author says.",
    );
    if (book.stage === "cover_design" || book.stage === "proofreading") {
      lines.push(
        `Note: ${STAGE_LABELS[book.stage]} is where delays most often occur (${book.stage === "cover_design" ? "waiting for author approval of the cover" : "revision rounds"}).`,
      );
    }
    return lines;
  }

  const pubDays = book.publication_date ? daysBetween(new Date(book.publication_date), asOf) : null;
  lines.push(
    `Status: Published & Live since ${book.publication_date ? formatLongDate(book.publication_date) : "unknown"}${pubDays !== null ? ` (${pubDays} days ago)` : ""}.`,
    `Pricing: MRP ${inr(book.mrp)}; author royalty ${inr(book.author_royalty_per_copy)} per copy (the author's 80% share of net profit per copy, i.e. after printing cost, platform commission and shipping are deducted from MRP).`,
    `Sales & royalty to date: ${book.total_copies_sold} copies sold; earned ${inr(book.total_royalty_earned)}; paid ${inr(book.royalty_paid)}; pending ${inr(book.royalty_pending)}.`,
    `Last royalty payout: ${book.last_royalty_payout_date ? formatLongDate(book.last_royalty_payout_date) : "none yet"}.`,
  );

  const royalty = assessRoyalty(
    {
      isPublished: true,
      publicationDate: book.publication_date,
      totalRoyaltyEarned: Number(book.total_royalty_earned),
      royaltyPaid: Number(book.royalty_paid),
      royaltyPending: Number(book.royalty_pending),
      lastRoyaltyPayoutDate: book.last_royalty_payout_date,
    },
    asOf,
  );
  const cal = royalty.calendar;
  lines.push(
    `Royalty calendar: next payout is for ${cal.upcoming.label}, due by ${formatLongDate(cal.upcoming.deadline)}; the previous cycle (${cal.lastPassed.label}) was due by ${formatLongDate(cal.lastPassed.deadline)}.`,
    `Royalty assessment [${royalty.state.toUpperCase()}]: ${royalty.summary}`,
  );

  // Listing gaps only matter for distribution questions; elsewhere they tempt
  // the model into raising issues the author never asked about.
  const missing = DISTRIBUTION_PLATFORMS.filter((p) => !book.available_on.includes(p));
  lines.push(
    `Listed on: ${book.available_on.join(", ") || "none"}.${missing.length && category === "distribution_availability" ? ` Not listed on: ${missing.join(", ")}.` : ""}`,
    `Print partner: ${book.print_partner ?? "n/a"}.`,
  );
  return lines;
}

export function renderFacts(ctx: TicketAiContext, asOf: Date = new Date()): string {
  const lines: string[] = [
    `As of: ${formatLongDate(asOf)}`,
    `Author first name: ${firstName(ctx.author.name)} (BookLeaf author since ${formatLongDate(ctx.author.joined_date)})`,
    `Ticket #${ctx.ticket.number}, opened ${formatLongDate(ctx.ticket.created_at)}, status ${ctx.ticket.status}`,
  ];

  if (ctx.book) {
    lines.push(...bookFacts(ctx.book, ctx.ticket.category, asOf));
  } else {
    lines.push("Ticket is about: General / Account level (no specific book).");
    lines.push(`Author's books (${ctx.books.length}):`);
    for (const b of ctx.books) {
      const royaltyBit =
        b.stage === "published_live"
          ? `, ${b.total_copies_sold} sold, pending royalty ${inr(b.royalty_pending)}, last payout ${b.last_royalty_payout_date ? formatLongDate(b.last_royalty_payout_date) : "none"}`
          : "";
      lines.push(`- "${b.title}": ${bookStatusLabel(b.stage)}${royaltyBit}`);
    }
    const pendingTotal = ctx.books.reduce((s, b) => s + Number(b.royalty_pending), 0);
    lines.push(
      `Total pending royalty across books: ${inr(pendingTotal)} (minimum payout ${inr(ROYALTY_MIN_PAYOUT_INR)}).`,
    );
  }
  lines.push("Bank account details are not visible to support: if relevant, ask the author to confirm the account linked in their dashboard.");
  return lines.join("\n");
}

/** Short facts line for classification: just enough to judge urgency. */
export function renderClassificationFacts(ctx: TicketAiContext, asOf: Date = new Date()): string {
  if (!ctx.book) return `About: General / Account level (${ctx.books.length} book(s) on account)`;
  const b = ctx.book;
  if (b.stage !== "published_live") return `About: "${b.title}" (${bookStatusLabel(b.stage)})`;
  const royalty = assessRoyalty(
    {
      isPublished: true,
      publicationDate: b.publication_date,
      totalRoyaltyEarned: Number(b.total_royalty_earned),
      royaltyPaid: Number(b.royalty_paid),
      royaltyPending: Number(b.royalty_pending),
      lastRoyaltyPayoutDate: b.last_royalty_payout_date,
    },
    asOf,
  );
  return `About: "${b.title}" (Published & Live since ${b.publication_date}; pending royalty ${inr(b.royalty_pending)}; royalty status ${royalty.state})`;
}

// ---------------------------------------------------------------------------
// Conversation: bounded history (cost control)
// ---------------------------------------------------------------------------
export const HISTORY_MAX_MESSAGES = 4;
export const HISTORY_MAX_CHARS = 1200;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [truncated]`;
}

/**
 * The original query is always included (it defines the issue); after that
 * only the most recent messages, each clipped. A 30-message thread costs the
 * same as a 5-message one.
 */
export function renderConversation(ctx: TicketAiContext): string {
  const t = ctx.ticket;
  const parts = [
    `[Author, ${formatLongDate(t.created_at)}] Original ticket\nSubject: ${t.subject}\n${clip(t.description, 2500)}`,
  ];
  const recent = ctx.messages.slice(-HISTORY_MAX_MESSAGES);
  const omitted = ctx.messages.length - recent.length;
  if (omitted > 0) parts.push(`(${omitted} earlier message${omitted === 1 ? "" : "s"} omitted)`);
  for (const m of recent) {
    const who = m.sender_role === "author" ? "Author" : `BookLeaf (${m.sender_name})`;
    parts.push(`[${who}, ${formatLongDate(m.created_at)}]\n${clip(m.body, HISTORY_MAX_CHARS)}`);
  }
  return parts.join("\n\n");
}
