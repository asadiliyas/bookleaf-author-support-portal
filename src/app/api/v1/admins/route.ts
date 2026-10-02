import { json, route } from "@/server/http/route";
import { listAdmins } from "@/server/services/stats";

/** GET /api/v1/admins: BookLeaf ops team members (for assignment). */
export const GET = route({ roles: ["admin"] }, async (ctx) => json({ items: await listAdmins(ctx) }));
