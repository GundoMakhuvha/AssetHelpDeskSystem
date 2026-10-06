import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Backend connection comes only from environment variables (see .env.example).
const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "").trim();
const anonKey = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  ""
).trim();

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
