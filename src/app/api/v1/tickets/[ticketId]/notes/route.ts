import { createNoteSchema } from "@/lib/schemas";
import { json, parseBody, parseId, route } from "@/server/http/route";
import { addNote, getTicket } from "@/server/services/tickets";

type Params = { ticketId: string };

/** GET /api/v1/tickets/:ticketId/notes: internal notes (admin only, never visible to authors). */
export const GET = route<Params>({ roles: ["admin"] }, async (ctx) => {
  const ticket = await getTicket(ctx, parseId(ctx.params.ticketId, "Ticket"));
  return json({ items: ticket.notes ?? [] });
});

/** POST /api/v1/tickets/:ticketId/notes: add an internal note. */
export const POST = route<Params>({ roles: ["admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  const input = await parseBody(ctx.req, createNoteSchema);
  return json(await addNote(ctx, id, input), { status: 201 });
});
