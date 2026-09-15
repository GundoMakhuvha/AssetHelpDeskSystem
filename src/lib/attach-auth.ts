import { createMiddleware } from '@tanstack/react-start';
import { supabase as appSupabase } from '@/lib/supabase';
import { supabase as genSupabase } from '@/integrations/supabase/client';

// Attaches the signed-in user's bearer token to every server function call.
// The app uses its own Supabase client, so we check it first and fall back to
// the generated client to be safe.
export const attachAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  let token: string | undefined;
  try {
    token = (await appSupabase.auth.getSession()).data.session?.access_token;
  } catch {
    /* ignore */
  }
  if (!token) {
    try {
      token = (await genSupabase.auth.getSession()).data.session?.access_token;
    } catch {
      /* ignore */
    }
  }
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
