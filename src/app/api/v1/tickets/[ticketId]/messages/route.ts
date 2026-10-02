import { createMessageSchema } from "@/lib/schemas";
import { json, parseBody, parseId, route } from "@/server/http/route";
import { addMessage, getTicket } from "@/server/services/tickets";

type Params = { ticketId: string };

/** GET /api/v1/tickets/:ticketId/messages: the visible conversation. */
export const GET = route<Params>({ roles: ["author", "admin"] }, async (ctx) => {
  const ticket = await getTicket(ctx, parseId(ctx.params.ticketId, "Ticket"));
  return json({ items: ticket.messages });
});

/** POST /api/v1/tickets/:ticketId/messages: author follow-up or admin response. */
export const POST = route<Params>({ roles: ["author", "admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  const input = await parseBody(ctx.req, createMessageSchema);
  return json(await addMessage(ctx, id, input), { status: 201 });
});
