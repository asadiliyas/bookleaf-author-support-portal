import { systemDb } from "@/server/db/clients";
import { env } from "@/server/env";

/**
 * GET /api/cron/keepalive: daily Vercel cron. Supabase pauses free-tier
 * projects after a week without activity, which would take the live demo
 * down; one trivial query a day prevents that. Protected by CRON_SECRET
 * (Vercel sends it as a bearer token).
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "Invalid cron secret." } }, { status: 401 });
  }
  const { count, error } = await systemDb().from("authors").select("id", { count: "exact", head: true });
  if (error) return Response.json({ ok: false }, { status: 500 });
  return Response.json({ ok: true, authors: count, at: new Date().toISOString() });
}
