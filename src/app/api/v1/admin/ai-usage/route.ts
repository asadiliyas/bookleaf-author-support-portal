import { z } from "zod";
import { json, parseQuery, route } from "@/server/http/route";
import { getAiUsageStats } from "@/server/services/stats";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** GET /api/v1/admin/ai-usage: AI calls, tokens, estimated cost, override rate, draft acceptance. */
export const GET = route({ roles: ["admin"] }, async (ctx) => {
  const { days } = parseQuery(ctx.req, querySchema);
  return json(await getAiUsageStats(ctx, days));
});
