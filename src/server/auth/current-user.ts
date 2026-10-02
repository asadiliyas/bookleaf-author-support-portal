import "server-only";
import type { Me } from "@/lib/api-types";
import { createCookieClient } from "../db/clients";

/** Current user for server-rendered layouts (the proxy already enforced access). */
export async function getCurrentUser(): Promise<Me | null> {
  const db = await createCookieClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const meta = (claims.app_metadata ?? {}) as { role?: string; author_id?: string; name?: string };
  if (meta.role !== "author" && meta.role !== "admin") return null;
  return {
    userId: claims.sub,
    role: meta.role,
    name: meta.name ?? (claims.email as string) ?? "User",
    email: (claims.email as string) ?? "",
    authorId: meta.role === "author" ? (meta.author_id ?? null) : null,
  };
}
