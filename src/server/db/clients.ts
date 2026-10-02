import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { env } from "../env";

export type Db = SupabaseClient<Database>;

/**
 * Request-scoped client for the signed-in user, built from the session cookie
 * set by the login endpoint. Queries run with the user's JWT, so Postgres RLS
 * applies: even a bug in a service can't read another author's rows.
 */
export async function createCookieClient(): Promise<Db> {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session on the next request, so this is safe.
        }
      },
    },
  });
}

/** Same as above for API clients that send `Authorization: Bearer <token>`. */
export function createBearerClient(accessToken: string): Db {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let system: Db | undefined;

/**
 * Privileged client (secret key, bypasses RLS). Only used by the service layer
 * after it has authorised the request, and by background AI jobs and seeding.
 * Clients have no write grants, so all mutations flow through here.
 */
export function systemDb(): Db {
  if (!system) {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
    system = createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return system;
}
