import "server-only";
import type { AuthorContext, Book, BookPortfolio } from "@/lib/api-types";
import { bookStatusLabel } from "@/lib/domain/constants";
import { isoDate, royaltyCalendar } from "@/lib/domain/royalty";
import type { AuthContext } from "../auth/actor";
import { check, forbidden, notFound } from "../http/errors";
import { toBook } from "../mappers";

export async function getMyBooks({ actor, db }: AuthContext): Promise<BookPortfolio> {
  if (actor.role !== "author") throw forbidden("Only authors have a book portfolio.");
  const rows = check(
    await db.from("books").select("*").eq("author_id", actor.authorId!).order("publication_date", { ascending: false, nullsFirst: true }),
    "list books",
  );
  const now = new Date();
  const books = rows.map((r) => toBook(r, now));
  const sum = (pick: (b: Book) => number) => books.reduce((s, b) => s + pick(b), 0);
  const calendar = royaltyCalendar(now);

  return {
    books,
    totals: {
      books: books.length,
      published: books.filter((b) => b.isPublished).length,
      inProduction: books.filter((b) => !b.isPublished).length,
      copiesSold: sum((b) => b.copiesSold),
      royaltyEarned: sum((b) => b.royaltyEarned),
      royaltyPaid: sum((b) => b.royaltyPaid),
      royaltyPending: sum((b) => b.royaltyPending),
    },
    nextPayout: { cycle: calendar.upcoming.label, deadline: isoDate(calendar.upcoming.deadline) },
  };
}

export async function getBook({ db }: AuthContext, id: string): Promise<Book> {
  // RLS restricts authors to their own books; admins can read any.
  const row = check(await db.from("books").select("*").eq("id", id).maybeSingle(), "load book");
  if (!row) throw notFound("Book");
  return toBook(row);
}

/**
 * Sidebar context for the admin ticket view: the same facts the AI saw, so
 * the agent can verify a draft before sending it.
 */
export async function getTicketAuthorContext({ actor, db }: AuthContext, ticketId: string): Promise<AuthorContext> {
  if (actor.role !== "admin") throw forbidden();
  const ticket = check(
    await db.from("tickets").select("id, author_id, book_id").eq("id", ticketId).maybeSingle(),
    "load ticket",
  );
  if (!ticket) throw notFound("Ticket");

  const [author, books, counts] = await Promise.all([
    db.from("authors").select("*").eq("id", ticket.author_id).single(),
    db.from("books").select("*").eq("author_id", ticket.author_id).order("id"),
    db.from("tickets").select("status").eq("author_id", ticket.author_id),
  ]);
  const a = check(author, "load author");
  const bookRows = check(books, "load books");
  const ticketRows = check(counts, "count tickets");
  const current = bookRows.find((b) => b.id === ticket.book_id);

  return {
    author: { id: a.id, name: a.name, email: a.email, city: a.city, joinedDate: a.joined_date },
    book: current ? toBook(current) : null,
    otherBooks: bookRows
      .filter((b) => b.id !== ticket.book_id)
      .map((b) => ({ id: b.id, title: b.title, statusLabel: bookStatusLabel(b.stage) })),
    openTickets: ticketRows.filter((t) => t.status === "open" || t.status === "in_progress").length,
    totalTickets: ticketRows.length,
  };
}
