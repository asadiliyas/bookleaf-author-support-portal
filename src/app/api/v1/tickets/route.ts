import { after } from "next/server";
import { createTicketSchema, listTicketsQuerySchema } from "@/lib/schemas";
import { classifyTicket } from "@/server/ai/classifier";
import { json, parseBody, parseQuery, route } from "@/server/http/route";
import { createTicket, listTickets } from "@/server/services/tickets";

// Leaves room for AI classification, which runs after the response is sent.
export const maxDuration = 60;

/** GET /api/v1/tickets: authors get their own tickets; admins get the filterable queue. */
export const GET = route({ roles: ["author", "admin"] }, async (ctx) => {
  const query = parseQuery(ctx.req, listTicketsQuerySchema);
  return json(await listTickets(ctx, query));
});

/**
 * POST /api/v1/tickets: author raises a ticket.
 * Responds immediately with a rule-based classification; Gemini classifies
 * in the background via after(), and the queue updates over realtime.
 */
export const POST = route({ roles: ["author"] }, async (ctx) => {
  const input = await parseBody(ctx.req, createTicketSchema);
  const ticket = await createTicket(ctx, input);
  after(() => classifyTicket(ticket.id));
  return json(ticket, { status: 201, headers: { Location: `/api/v1/tickets/${ticket.id}` } });
});
