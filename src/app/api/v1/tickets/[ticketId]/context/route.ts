import { json, parseId, route } from "@/server/http/route";
import { getTicketAuthorContext } from "@/server/services/books";

/** GET /api/v1/tickets/:ticketId/context: author + book facts for the admin sidebar. */
export const GET = route<{ ticketId: string }>({ roles: ["admin"] }, async (ctx) =>
  json(await getTicketAuthorContext(ctx, parseId(ctx.params.ticketId, "Ticket"))),
);
