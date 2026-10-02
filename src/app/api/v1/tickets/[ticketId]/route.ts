import { updateTicketSchema } from "@/lib/schemas";
import { json, parseBody, parseId, route } from "@/server/http/route";
import { getTicket, updateTicket } from "@/server/services/tickets";

type Params = { ticketId: string };

/** GET /api/v1/tickets/:ticketId: ticket with thread (admins also get AI details + internal notes). */
export const GET = route<Params>({ roles: ["author", "admin"] }, async (ctx) =>
  json(await getTicket(ctx, parseId(ctx.params.ticketId, "Ticket"))),
);

/** PATCH /api/v1/tickets/:ticketId: admin updates status, category, priority or assignee. */
export const PATCH = route<Params>({ roles: ["admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  const input = await parseBody(ctx.req, updateTicketSchema);
  return json(await updateTicket(ctx, id, input));
});
