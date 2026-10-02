import { json, route } from "@/server/http/route";
import { getMyBooks } from "@/server/services/books";

/** GET /api/v1/me/books: the author's books with royalty status and totals. */
export const GET = route({ roles: ["author"] }, async (ctx) => json(await getMyBooks(ctx)));
