import "server-only";
import type { Book, PersonRef, TicketSummary } from "@/lib/api-types";
import { bookStatusLabel } from "@/lib/domain/constants";
import { assessRoyalty, isoDate } from "@/lib/domain/royalty";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
export type BookRow = Tables["books"]["Row"];
export type TicketRow = Tables["tickets"]["Row"];
export type AuthorRow = Tables["authors"]["Row"];

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function toBook(row: BookRow, asOf: Date = new Date()): Book {
  const isPublished = row.stage === "published_live";
  const royalty = assessRoyalty(
    {
      isPublished,
      publicationDate: row.publication_date,
      totalRoyaltyEarned: Number(row.total_royalty_earned),
      royaltyPaid: Number(row.royalty_paid),
      royaltyPending: Number(row.royalty_pending),
      lastRoyaltyPayoutDate: row.last_royalty_payout_date,
    },
    asOf,
  );
  return {
    id: row.id,
    title: row.title,
    isbn: row.isbn,
    genre: row.genre,
    stage: row.stage,
    statusLabel: bookStatusLabel(row.stage),
    isPublished,
    publicationDate: row.publication_date,
    mrp: num(row.mrp),
    royaltyPerCopy: num(row.author_royalty_per_copy),
    copiesSold: row.total_copies_sold,
    royaltyEarned: Number(row.total_royalty_earned),
    royaltyPaid: Number(row.royalty_paid),
    royaltyPending: Number(row.royalty_pending),
    lastPayoutDate: row.last_royalty_payout_date,
    printPartner: row.print_partner,
    availableOn: row.available_on,
    royalty: {
      state: royalty.state,
      summary: royalty.authorMessage,
      staffSummary: royalty.summary,
      meetsThreshold: royalty.meetsThreshold,
      upcomingCycle: royalty.calendar.upcoming.label,
      upcomingDeadline: isoDate(royalty.calendar.upcoming.deadline),
    },
  };
}

/** Row shape returned by the ticket list/detail select with joined refs. */
export type TicketRowWithRefs = TicketRow & {
  book: { id: string; title: string } | null;
  author: { id: string; name: string } | null;
  assignee: { user_id: string; name: string } | null;
};

export const TICKET_SELECT = `*,
  book:books!tickets_book_id_author_id_fkey(id, title),
  author:authors!tickets_author_id_fkey(id, name),
  assignee:admins!tickets_assigned_admin_id_fkey(user_id, name)` as const;

export function toTicketSummary(row: TicketRowWithRefs): TicketSummary {
  const assignee: PersonRef | null = row.assignee ? { id: row.assignee.user_id, name: row.assignee.name } : null;
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    status: row.status,
    category: row.category,
    priority: row.priority,
    categorySource: row.category_source,
    prioritySource: row.priority_source,
    aiStatus: row.ai_status,
    book: row.book ? { id: row.book.id, title: row.book.title } : null,
    author: { id: row.author_id, name: row.author?.name ?? row.author_id },
    assignee,
    firstResponseAt: row.first_response_at,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
