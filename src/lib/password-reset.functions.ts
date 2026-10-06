import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { sendMail, brandLayout, escapeHtml } from '@/lib/mailer.server';
import { appLink } from '@/lib/app-url';

const schema = z.object({ email: z.string().email() });

import { ORG } from '@/lib/org-config';

// Build-time public values (VITE_*) used when server variables are absent.
const FALLBACK_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const FALLBACK_KEY =
  ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)) ?? '';

function env(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Sends a branded "reset your password" email from the company mailbox.
 * Always reports success so the form never reveals whether an account exists.
 */
export const requestPasswordReset = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || FALLBACK_URL;
    const key =
      env('SUPABASE_PUBLISHABLE_KEY') ||
      env('VITE_SUPABASE_PUBLISHABLE_KEY') ||
      env('VITE_SUPABASE_ANON_KEY') ||
      FALLBACK_KEY;
    const mailSecret = env('APP_MAIL_SECRET');
    if (!mailSecret) {
      throw new Error(
        'Password reset is not configured: the APP_MAIL_SECRET environment variable is missing from this deployment.',
      );
    }

    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data: token, error } = await client.rpc('create_password_reset_token' as never, {
      _email: data.email,
      _secret: mailSecret,
    } as never);
    if (error) throw new Error(error.message);
    if (!token) return { sent: true };

    const link = appLink(`/reset-password?token=${token as unknown as string}`);
    const html = brandLayout({
      badgeLabel: 'PASSWORD RESET',
      badgeBg: '#faeeda',
      badgeFg: '#854f0b',
      title: 'Reset your password',
      intro:
        `We received a request to reset the password for your ${ORG.helpdeskName} account. If this was not you, simply ignore this email.`,
      bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#4b5563">
        Account: <strong>${escapeHtml(data.email)}</strong><br/>
        This link can be used once and expires in 10 minutes.
      </p>`,
      ctaLabel: 'Choose a new password',
      ctaHref: link,
    });

    await sendMail([data.email], `Reset your ${ORG.helpdeskName} password`, html);
    return { sent: true };
  });

/** Admin-triggered reset from Setup: link lasts 7 days. */
export const adminSendPasswordReset = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: token, error } = await context.supabase.rpc(
      'admin_create_password_reset_token' as never,
      { _email: data.email } as never,
    );
    if (error) throw new Error(error.message);
    const link = appLink(`/reset-password?token=${token as unknown as string}`);
    const html = brandLayout({
      badgeLabel: 'PASSWORD RESET',
      badgeBg: '#faeeda',
      badgeFg: '#854f0b',
      title: 'Create your new password',
      intro: `An administrator has reset the password for your ${ORG.helpdeskName} account. Use the button below to choose a new password.`,
      bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#4b5563">
        Account: <strong>${escapeHtml(data.email)}</strong><br/>
        This link can be used once and expires in 7 days.
      </p>`,
      ctaLabel: 'Choose a new password',
      ctaHref: link,
    });
    await sendMail([data.email], `Create your new ${ORG.helpdeskName} password`, html);
    return { sent: true };
  });
