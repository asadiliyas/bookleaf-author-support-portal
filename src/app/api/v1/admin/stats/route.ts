import { json, route } from "@/server/http/route";
import { getQueueStats } from "@/server/services/stats";

/** GET /api/v1/admin/stats: queue counters (open, unassigned, SLA breaches…). */
export const GET = route({ roles: ["admin"] }, async (ctx) => json(await getQueueStats(ctx)));
