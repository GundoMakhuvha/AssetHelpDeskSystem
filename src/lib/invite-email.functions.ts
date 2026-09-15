import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sendMail, brandLayout, escapeHtml } from '@/lib/mailer.server';

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  link: z.string().url(),
});

/** Sends the branded "set your password" invite through the company mailbox. */
export const sendInviteEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) throw new Error('Only admins can send invites.');

    const html = brandLayout({
      badgeLabel: 'ACCOUNT INVITE',
      badgeBg: '#e6f2ff',
      badgeFg: '#0b2f52',
      title: `Welcome, ${data.full_name}`,
      intro:
        'An account has been created for you on the Tipp Focus Asset Management & Help Desk system. Choose your own password to get started.',
      bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#4b5563">
        Sign-in email: <strong>${escapeHtml(data.email)}</strong><br/>
        This link can be used once and expires in 7 days.
      </p>`,
      ctaLabel: 'Create my password',
      ctaHref: data.link,
    });

    await sendMail([data.email], 'Create your Tipp Focus Help Desk password', html);
    return { sent: true };
  });
