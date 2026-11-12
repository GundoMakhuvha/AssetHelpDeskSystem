import { createFileRoute } from '@tanstack/react-router';
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

type ReceivedAttachment = {
  id: string;
  filename?: string;
  content_type?: string;
  size?: number;
  download_url?: string;
  content_disposition?: string;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_BUCKET = 'ticket-attachments';

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

        const { createAdminClient } = await import('@/lib/admin-client.server');
        const admin = createAdminClient();
        const emailId = event.data.email_id;

        // Record first. The unique id makes Resend's retries harmless.
        const { data: log, error: logError } = await admin
          .from('inbound_emails' as never)
          .insert({
            resend_email_id: emailId,
            from_address: event.data.from ?? null,
            to_addresses: event.data.to ?? [],
            subject: event.data.subject ?? null,
          } as never)
          .select('id')
          .single();
        if (logError) {
          if ((logError as { code?: string }).code === '23505') return json({ duplicate: true });
          console.error('inbound_emails insert failed', logError);
          return json({ error: logError.message }, 500);
        }
        const logId = (log as { id: string }).id;
        const finish = async (status: string, extra: Record<string, unknown> = {}) => {
          await admin.from('inbound_emails' as never).update({ status, ...extra } as never).eq('id', logId);
          return json({ status, ...extra });
        };

        try {
          const email = await resendGet<ReceivedEmail>(`/emails/receiving/${emailId}`);
          const subject = email.subject ?? event.data.subject ?? '';
          const fromRaw = email.from ?? event.data.from ?? '';
          const sender = bareAddress(fromRaw);
          const recipients = [...list(email.to ?? event.data.to), ...list(email.cc)];
          const fullText = (email.text && email.text.trim()) || htmlToText(email.html ?? '');
          const reply = stripQuotedReply(fullText);

          await admin
            .from('inbound_emails' as never)
            .update({ body_text: fullText.slice(0, 50000) } as never)
            .eq('id', logId);

          if (isAutoReply(email.headers, subject)) return finish('ignored', { reason: 'automatic reply' });

          const ownFrom = bareAddress(process.env['RESEND_FROM'] ?? '');
          if (ownFrom && sender === ownFrom) return finish('ignored', { reason: 'sent by the help desk itself' });

          // Who sent it? Staff and requesters have profiles; others are recorded by address.
          const { data: profile } = await admin
            .from('profiles')
            .select('id, full_name, email')
            .ilike('email', sender.replace(/[\\%_]/g, '\\$&'))
            .maybeSingle();

          // Which ticket? Prefer the Reply-To token; fall back to "#00065" in the
          // subject, but only for senders who have an account.
          const token = ticketFromAddresses(recipients);
          let ticket: { id: string; ticket_number: number; title: string; submitted_by: string | null; assigned_to: string | null } | null = null;
          if (token) {
            const { data } = await admin
              .from('tickets')
              .select('id, ticket_number, title, submitted_by, assigned_to')
              .eq('id', token.ticketId)
              .maybeSingle();
            ticket = data;
          } else if (profile) {
            const num = ticketNumberFromSubject(subject);
            if (num != null) {
              const { data } = await admin
                .from('tickets')
                .select('id, ticket_number, title, submitted_by, assigned_to')
                .eq('ticket_number', num)
                .maybeSingle();
              ticket = data;
            }
          }
          if (!ticket) {
            return finish('unmatched', {
              reason: token ? 'ticket in reply address no longer exists' : 'no ticket reference found',
            });
          }

          const { data: comment, error: commentError } = await admin
            .from('ticket_comments')
            .insert({
              ticket_id: ticket.id,
              author_id: profile?.id ?? null,
              body: reply || '(empty email)',
              is_internal: token?.internal ?? false,
              source: 'email',
              email_from: profile ? null : (displayName(fromRaw) ? `${displayName(fromRaw)} <${sender}>` : sender),
            } as never)
            .select('id')
            .single();
          if (commentError) throw new Error(commentError.message);
          const commentId = (comment as { id: string }).id;

          // Attachments (inline images such as signature logos are skipped).
          let saved = 0;
          try {
            const res = await resendGet<{ data?: ReceivedAttachment[] } | ReceivedAttachment[]>(
              `/emails/receiving/${emailId}/attachments`,
            );
            const files = Array.isArray(res) ? res : (res.data ?? []);
            for (const f of files) {
              if ((f.content_disposition ?? '').toLowerCase().startsWith('inline')) continue;
              if (!f.download_url || (f.size ?? 0) > MAX_ATTACHMENT_BYTES) continue;
              const dl = await fetch(f.download_url);
              if (!dl.ok) continue;
              const bytes = new Uint8Array(await dl.arrayBuffer());
              const name = (f.filename || 'attachment').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
              const path = `email/${ticket.id}/${Date.now()}-${name}`;
              const up = await admin.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
                contentType: f.content_type || undefined,
              });
              if (up.error) continue;
              await admin.from('ticket_attachments' as never).insert({
                ticket_id: ticket.id,
                comment_id: commentId,
                storage_path: path,
                file_name: f.filename || name,
                mime_type: f.content_type ?? null,
                size_bytes: bytes.byteLength,
                uploaded_by: profile?.id ?? null,
              } as never);
              saved++;
            }
          } catch (e) {
            console.error('Inbound attachments failed', e);
          }

          // Let the requester and assignee know by email (not the person who replied).
          try {
            await notifyByEmail(admin, ticket, {
              senderEmail: sender,
              senderName: profile?.full_name ?? displayName(fromRaw) ?? sender,
              text: reply,
              internal: token?.internal ?? false,
            });
          } catch (e) {
            console.error('Inbound reply notification failed', e);
          }

          return finish('linked', { ticket_id: ticket.id, comment_id: commentId, attachments: saved });
        } catch (e) {
          console.error('Inbound email processing failed', e);
          return finish('error', { reason: String((e as Error)?.message ?? e).slice(0, 500) });
        }
      },
    },
  },
});

async function notifyByEmail(
  admin: ReturnType<typeof import('@/lib/admin-client.server').createAdminClient>,
  ticket: { id: string; ticket_number: number; title: string; submitted_by: string | null; assigned_to: string | null },
  opts: { senderEmail: string; senderName: string; text: string; internal: boolean },
) {
  const { sendMail, brandLayout, escapeHtml } = await import('@/lib/mailer.server');
  const { appLink } = await import('@/lib/app-url');

  // Internal notes only go to the assignee, never the requester.
  const ids = (opts.internal ? [ticket.assigned_to] : [ticket.submitted_by, ticket.assigned_to]).filter(
    Boolean,
  ) as string[];
  if (!ids.length) return;
  const { data: people } = await admin.from('profiles').select('email').in('id', ids);
  const to = (people ?? [])
    .map((p) => (p.email ?? '').toLowerCase())
    .filter((e) => e && e !== opts.senderEmail);
  if (!to.length) return;

  const ref = `#${String(ticket.ticket_number).padStart(5, '0')}`;
  const html = brandLayout({
    badgeLabel: 'NEW REPLY',
    badgeBg: '#fbeaf0',
    badgeFg: '#72243e',
    title: `${opts.senderName} replied on ${ref}`,
    intro: ticket.title,
    bodyHtml: `<p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#374151;white-space:pre-wrap">${escapeHtml(
      opts.text.slice(0, 1500),
    )}</p>`,
    ctaLabel: 'View ticket',
    ctaHref: appLink(`/tickets?ticket=${ticket.id}`),
  });
  await sendMail(to, `New reply on ticket ${ref}`, html, {
    replyTo: ticketReplyTo(ticket.id, { internal: opts.internal }),
  });
}
