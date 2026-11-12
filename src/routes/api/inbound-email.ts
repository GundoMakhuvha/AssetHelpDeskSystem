import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import {
  bareAddress,
  displayName,
  htmlToText,
  isAutoReply,
  resendGet,
  stripQuotedReply,
  ticketFromAddresses,
  ticketNumberFromSubject,
  ticketReplyTo,
  verifyWebhook,
  webhookSecret,
} from '@/lib/inbound-email.server';

type ReceivedEmail = {
  id: string;
  from?: string;
  to?: string[] | string;
  cc?: string[] | string;
  subject?: string;
  text?: string | null;
  html?: string | null;
  headers?: unknown;
};


const list = (v: string[] | string | undefined | null) => (Array.isArray(v) ? v : v ? [v] : []);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Resend "email.received" webhook. Turns a reply to a ticket email into a
 * comment on that ticket. Always answers 200 once the email is recorded,
 * so Resend does not keep retrying emails we have decided to skip.
 */
export const Route = createFileRoute('/api/inbound-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text();
        const secret = webhookSecret();
        if (!secret) return json({ error: 'RESEND_WEBHOOK_SECRET is not configured' }, 500);
        if (!verifyWebhook(payload, request.headers, secret)) return json({ error: 'Invalid signature' }, 401);

        let event: { type?: string; data?: { email_id?: string; from?: string; to?: string[]; subject?: string } };
        try {
          event = JSON.parse(payload);
        } catch {
          return json({ error: 'Bad JSON' }, 400);
        }
        if (event.type !== 'email.received' || !event.data?.email_id) return json({ skipped: event.type ?? 'unknown' });

        const db = publicClient();
        if (!db) return json({ error: 'Supabase URL / publishable key not configured' }, 500);
        const emailId = event.data.email_id;

        try {
          const email = await resendGet<ReceivedEmail>(`/emails/receiving/${emailId}`);
          const subject = email.subject ?? event.data.subject ?? '';
          const fromRaw = email.from ?? event.data.from ?? '';
          const sender = bareAddress(fromRaw);
          const recipients = [...list(email.to ?? event.data.to), ...list(email.cc)];
          const fullText = (email.text && email.text.trim()) || htmlToText(email.html ?? '');
          let reply = stripQuotedReply(fullText);

          // Attachments can't be stored without the service role key (Lovable
          // Cloud), so their names are noted on the comment instead.
          const files = (event.data as { attachments?: { filename?: string; content_disposition?: string }[] })
            .attachments ?? [];
          const names = files
            .filter((f) => !(f.content_disposition ?? '').toLowerCase().startsWith('inline'))
            .map((f) => f.filename)
            .filter(Boolean);
          if (names.length) reply += `\n\n[Attachments sent by email, not saved here: ${names.join(', ')}]`;

          const ownFrom = bareAddress(process.env['RESEND_FROM'] ?? '');
          const ignoreReason = isAutoReply(email.headers, subject)
            ? 'automatic reply'
            : ownFrom && sender === ownFrom
              ? 'sent by the help desk itself'
              : null;
          const token = ticketFromAddresses(recipients);

          const { data, error } = await db.rpc('ingest_inbound_email' as never, {
            _secret: secret,
            _resend_email_id: emailId,
            _from: fromRaw,
            _sender: sender,
            _sender_name: displayName(fromRaw) ?? '',
            _to: recipients,
            _subject: subject,
            _body_text: fullText,
            _reply: reply,
            _token_ticket_id: token?.ticketId ?? null,
            _internal: token?.internal ?? false,
            _subject_ticket_number: ticketNumberFromSubject(subject),
            _ignore_reason: ignoreReason,
          } as never);
          if (error) throw new Error(`ingest_inbound_email: ${error.message}`);
          const result = data as unknown as IngestResult;

          if (result.status === 'linked') {
            try {
              await notifyByEmail(result, { senderEmail: sender, text: reply, internal: token?.internal ?? false });
            } catch (e) {
              console.error('Inbound reply notification failed', e);
            }
          }
          return json(result);
        } catch (e) {
          console.error('Inbound email processing failed', e);
          // 500 so Resend retries; the message shows in Resend's webhook log.
          return json({ error: String((e as Error)?.message ?? e).slice(0, 500) }, 500);
        }
      },
    },
  },
});

type IngestResult = {
  status: string;
  ticket_id?: string;
  ticket_number?: number;
  ticket_title?: string;
  comment_id?: string;
  sender_name?: string;
  requester_email?: string | null;
  assignee_email?: string | null;
};

/** Public (publishable-key) client; the database function checks the shared secret. */
function publicClient() {
  const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']|["']$/g, '');
  const url =
    clean(import.meta.env.VITE_SUPABASE_URL as string | undefined) || clean(process.env['SUPABASE_URL']);
  const key =
    clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    clean(process.env['SUPABASE_PUBLISHABLE_KEY']) ||
    clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function notifyByEmail(
  r: IngestResult,
  opts: { senderEmail: string; text: string; internal: boolean },
) {
  const { sendMail, brandLayout, escapeHtml } = await import('@/lib/mailer.server');
  const { appLink } = await import('@/lib/app-url');

  // Internal notes only go to the assignee, never the requester.
  const to = (opts.internal ? [r.assignee_email] : [r.requester_email, r.assignee_email])
    .map((e) => (e ?? '').toLowerCase())
    .filter((e) => e && e !== opts.senderEmail);
  if (!to.length || !r.ticket_id) return;

  const ref = `#${String(r.ticket_number ?? '').padStart(5, '0')}`;
  const html = brandLayout({
    badgeLabel: 'NEW REPLY',
    badgeBg: '#fbeaf0',
    badgeFg: '#72243e',
    title: `${r.sender_name ?? opts.senderEmail} replied on ${ref}`,
    intro: r.ticket_title ?? '',
    bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#374151;white-space:pre-wrap">${escapeHtml(
      opts.text.slice(0, 1500),
    )}</p>`,
    ctaLabel: 'View ticket',
    ctaHref: appLink(`/tickets?ticket=${r.ticket_id}`),
  });
  await sendMail(Array.from(new Set(to)), `New reply on ticket ${ref}`, html, {
    replyTo: ticketReplyTo(r.ticket_id, { internal: opts.internal }),
  });
}
