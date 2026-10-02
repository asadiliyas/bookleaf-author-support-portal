import type { DraftResponse } from "@/lib/api-types";
import { generateDraftSchema } from "@/lib/schemas";
import { findCurrentDraft, getOrCreateDraft } from "@/server/ai/drafter";
import { conflict } from "@/server/http/errors";
import { json, parseBody, parseId, route } from "@/server/http/route";
import { getTicket } from "@/server/services/tickets";

type Params = { ticketId: string };

export const maxDuration = 60;

/** GET /api/v1/tickets/:ticketId/draft: cached draft for the current context, if any (never calls the AI). */
export const GET = route<Params>({ roles: ["admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  await getTicket(ctx, id);
  return json<DraftResponse>({ draft: await findCurrentDraft(id, ctx.actor), degraded: null });
});

/**
 * POST /api/v1/tickets/:ticketId/draft: get an AI-drafted reply.
 * Returns the cached draft when nothing changed (no token spend) unless
 * `regenerate: true`. If the AI is unavailable, responds 200 with
 * `draft: null` and a `degraded` reason so the admin writes manually.
 */
export const POST = route<Params>({ roles: ["admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  const ticket = await getTicket(ctx, id);
  if (ticket.status === "closed") throw conflict("This ticket is closed. Reopen it to draft a reply.");
  const input = await parseBody(ctx.req, generateDraftSchema);
  return json(await getOrCreateDraft(id, ctx.actor, input));
});
