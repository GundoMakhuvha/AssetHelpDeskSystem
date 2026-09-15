import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function clean(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
}

function resolveUrl(): string {
  const raw =
    clean(process.env['SUPABASE_URL']) ||
    clean(process.env['VITE_SUPABASE_URL']) ||
    (clean(process.env['SUPABASE_PROJECT_ID']) || clean(process.env['VITE_SUPABASE_PROJECT_ID'])
      ? `https://${clean(process.env['SUPABASE_PROJECT_ID']) || clean(process.env['VITE_SUPABASE_PROJECT_ID'])}.supabase.co`
      : '');

  if (!raw) throw new Error('Backend URL is not configured on the server.');
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    new URL(url);
  } catch {
    throw new Error('Backend URL is not a valid HTTP(S) URL.');
  }
  return url;
}

export function createAdminClient() {
  const url = resolveUrl();
  const serviceKey = clean(process.env['SUPABASE_SERVICE_ROLE_KEY']);
  if (!serviceKey) throw new Error('Server credentials are not configured.');

  return createClient<Database>(url, serviceKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
