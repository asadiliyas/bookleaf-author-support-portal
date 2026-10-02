import "server-only";
import type { Role } from "@/lib/domain/constants";
import { createBearerClient, createCookieClient, type Db } from "../db/clients";
import { forbidden, unauthorized } from "../http/errors";

/** The authenticated caller, resolved once per request. */
export interface Actor {
  userId: string;
  role: Role;
  email: string;
  name: string;
  /** Set for authors only (e.g. "AUTH003"). */
  authorId: string | null;
}

export interface AuthContext {
  actor: Actor;
  /** Request-scoped client carrying the user's JWT (RLS enforced). */
  db: Db;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Verifies the session (cookie or bearer token) and builds the Actor from the
 * JWT claims. Role and author_id come from app_metadata, which only the
 * server can write, so a user cannot promote themselves.
 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const token = bearerToken(req);
  const db = token ? createBearerClient(token) : await createCookieClient();

  const { data, error } = await db.auth.getClaims(token ?? undefined);
  if (error || !data?.claims) return null;

  const claims = data.claims;
  const meta = (claims.app_metadata ?? {}) as { role?: string; author_id?: string; name?: string };
  if (meta.role !== "author" && meta.role !== "admin") return null;

  return {
    db,
    actor: {
      userId: claims.sub,
      role: meta.role,
      email: (claims.email as string | undefined) ?? "",
      name: meta.name ?? (claims.email as string | undefined) ?? "User",
      authorId: meta.role === "author" ? (meta.author_id ?? null) : null,
    },
  };
}

export async function requireAuth(req: Request, roles?: readonly Role[]): Promise<AuthContext> {
  const ctx = await authenticate(req);
  if (!ctx) throw unauthorized();
  if (roles && !roles.includes(ctx.actor.role)) throw forbidden();
  if (ctx.actor.role === "author" && !ctx.actor.authorId) throw forbidden("Author profile is not linked.");
  return ctx;
}
