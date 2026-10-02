import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at first use. `server-only` makes the
 * build fail if this module is ever imported from client code, which is how
 * the Gemini key and Supabase secret key are kept out of the browser bundle.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),

  // Optional: without it the app runs in "AI degraded" mode
  // (rule-based classification, manual replies).
  GEMINI_API_KEY: z.string().min(10).optional(),
  // Comma-separated model chains: the first is primary, the rest are fallbacks
  // tried when the primary is overloaded (503) or rate-limited (429).
  GEMINI_CLASSIFY_MODELS: z.string().default("gemini-3.5-flash-lite,gemini-3.1-flash-lite"),
  GEMINI_DRAFT_MODELS: z.string().default("gemini-2.5-flash,gemini-3.5-flash"),

  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse({
      ...process.env,
      // Treat empty strings (e.g. "GEMINI_API_KEY=") as unset.
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
      CRON_SECRET: process.env.CRON_SECRET || undefined,
    });
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment: ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function modelChain(value: string): string[] {
  return value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}
