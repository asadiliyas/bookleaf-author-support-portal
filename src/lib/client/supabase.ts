"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser Supabase client, used ONLY for realtime change notifications.
 * It carries the user's session (from the cookie) so Postgres RLS filters
 * which row changes each user is told about. It has no write privileges.
 */
export function browserSupabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
