import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { sendMail, brandLayout, escapeHtml } from '@/lib/mailer.server';
import { appLink } from '@/lib/app-url';

const schema = z.object({ email: z.string().email() });

// Publishable (public) values — safe defaults so the flow works on any host.
const FALLBACK_URL = 'https://jsifsskhbyrgbmsdezqs.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzaWZzc2toYnlyZ2Jtc2RlenFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzAxOTIsImV4cCI6MjA5MzU0NjE5Mn0.ZHodmo_0A-VXO4H4uZxz6QOpnkTdAuyZSEZfPkrt-QI';

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
        'We received a request to reset the password for your Tipp Focus Help Desk account. If this was not you, simply ignore this email.',
      bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#4b5563">
        Account: <strong>${escapeHtml(data.email)}</strong><br/>
        This link can be used once and expires in 10 minutes.
      </p>`,
      ctaLabel: 'Choose a new password',
      ctaHref: link,
    });

    await sendMail([data.email], 'Reset your Tipp Focus Help Desk password', html);
    return { sent: true };
  });
