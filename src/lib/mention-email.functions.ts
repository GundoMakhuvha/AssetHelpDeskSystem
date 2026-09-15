import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sendMail, brandLayout, escapeHtml } from '@/lib/mailer.server';
import { appLink } from '@/lib/app-url';

const schema = z.object({
  ticketId: z.string().uuid(),
  ticketRef: z.string().min(1),
  ticketTitle: z.string().default(''),
  userIds: z.array(z.string().uuid()).min(1).max(25),
  authorName: z.string().default('A colleague'),
  note: z.string().max(2000).default(''),
});

/** Emails everyone who was @mentioned in a ticket reply. */
export const sendMentionEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('email')
      .in('id', data.userIds);
    if (error) throw new Error(error.message);

    const emails = (rows ?? []).map((r) => r.email).filter(Boolean) as string[];
    if (emails.length === 0) return { sent: 0 };

    const html = brandLayout({
      badgeLabel: 'YOU WERE MENTIONED',
      badgeBg: '#fbeaf0',
      badgeFg: '#72243e',
      title: `${data.authorName} mentioned you on ${data.ticketRef}`,
      intro: data.ticketTitle || 'A colleague mentioned you in a help desk ticket.',
      bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#374151">${escapeHtml(
        data.note,
      )}</p>`,
      ctaLabel: 'View ticket',
      ctaHref: appLink('/tickets'),
    });

    await sendMail(emails, `You were mentioned on ticket ${data.ticketRef}`, html);
    return { sent: emails.length };
  });
