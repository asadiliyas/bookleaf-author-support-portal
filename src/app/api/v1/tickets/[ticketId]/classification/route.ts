import { classifyTicket } from "@/server/ai/classifier";
import { json, parseId, route } from "@/server/http/route";
import { getTicket } from "@/server/services/tickets";

export const maxDuration = 30;

/**
 * POST /api/v1/tickets/:ticketId/classification: re-run AI classification
 * (e.g. after an outage left the ticket on the rule-based fallback).
 * Admin overrides are preserved.
 */
export const POST = route<{ ticketId: string }>({ roles: ["admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  await getTicket(ctx, id); // 404 if missing
  await classifyTicket(id);
  return json(await getTicket(ctx, id));
});
