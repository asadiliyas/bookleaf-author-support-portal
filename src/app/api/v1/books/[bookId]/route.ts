import { json, route } from "@/server/http/route";
import { getBook } from "@/server/services/books";

/** GET /api/v1/books/:bookId: one book (authors: own books only, via RLS). */
export const GET = route<{ bookId: string }>({ roles: ["author", "admin"] }, async (ctx) =>
  json(await getBook(ctx, ctx.params.bookId)),
);
