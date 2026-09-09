import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Defaults for the Tipp Focus Supabase project (publishable keys — safe in client code).
const DEFAULT_URL = "https://jsifsskhbyrgbmsdezqs.supabase.co";
const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzaWZzc2toYnlyZ2Jtc2RlenFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzAxOTIsImV4cCI6MjA5MzU0NjE5Mn0.ZHodmo_0A-VXO4H4uZxz6QOpnkTdAuyZSEZfPkrt-QI";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let _client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });
}

export const supabase = _client as SupabaseClient;

export const SUPABASE_URL = url;
