import { json, route } from "@/server/http/route";
import { toMe } from "@/server/services/auth";

/** GET /api/v1/auth/me: the signed-in user and role. */
export const GET = route({ roles: ["author", "admin"] }, async ({ actor }) => json(toMe(actor)));
