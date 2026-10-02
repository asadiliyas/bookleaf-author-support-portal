import "server-only";
import type { Me, SessionResponse } from "@/lib/api-types";
import type { LoginInput } from "@/lib/schemas";
import type { Actor } from "../auth/actor";
import { createCookieClient } from "../db/clients";
import { AppError, forbidden } from "../http/errors";

export function toMe(actor: Actor): Me {
  return {
    userId: actor.userId,
    role: actor.role,
    name: actor.name,
    email: actor.email,
    authorId: actor.authorId,
  };
}

/**
 * Email/password sign-in. The Supabase SSR client writes the session cookies
 * on this response (used by the browser and the proxy); the access token is
 * also returned so API tools (Swagger, Postman) can use `Authorization: Bearer`.
 */
export async function login(input: LoginInput): Promise<SessionResponse> {
  const supabase = await createCookieClient();
  const { data, error } = await supabase.auth.signInWithPassword(input);

  if (error || !data.session || !data.user) {
    if (error?.status === 429) throw new AppError(429, "RATE_LIMITED", "Too many sign-in attempts. Please wait a minute.");
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  const meta = (data.user.app_metadata ?? {}) as { role?: string; author_id?: string; name?: string };
  if (meta.role !== "author" && meta.role !== "admin") {
    await supabase.auth.signOut();
    throw forbidden("This account has no portal access.");
  }

  return {
    user: {
      userId: data.user.id,
      role: meta.role,
      name: meta.name ?? data.user.email ?? "User",
      email: data.user.email ?? input.email,
      authorId: meta.role === "author" ? (meta.author_id ?? null) : null,
    },
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at ?? null,
  };
}

export async function logout(): Promise<void> {
  const supabase = await createCookieClient();
  await supabase.auth.signOut();
}
