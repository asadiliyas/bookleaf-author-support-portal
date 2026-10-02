// Dummy environment so server modules validate their config in unit tests.
// No test talks to Supabase or Gemini: external calls are mocked.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable_test_key_000000";
process.env.SUPABASE_SECRET_KEY ??= "sb_secret_test_key_000000000000";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GEMINI_CLASSIFY_MODELS = "model-primary,model-fallback";
process.env.GEMINI_DRAFT_MODELS = "model-primary,model-fallback";
