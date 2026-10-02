import { json, parseId, route } from "@/server/http/route";
import { listEvents } from "@/server/services/tickets";

/** GET /api/v1/tickets/:ticketId/events: activity timeline / audit trail (admin only). */
export const GET = route<{ ticketId: string }>({ roles: ["admin"] }, async (ctx) =>
  json({ items: await listEvents(ctx, parseId(ctx.params.ticketId, "Ticket")) }),
);
