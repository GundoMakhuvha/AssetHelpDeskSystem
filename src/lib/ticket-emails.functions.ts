import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const schema = z.object({
  ticketId: z.string().uuid(),
  event: z.enum(['created', 'status', 'comment', 'assigned']),
  note: z.string().max(2000).optional().nullable(),
});

function fromAddress() {
  const configured = (process.env['RESEND_FROM'] ?? '').trim();
  return configured || 'Tipp Focus Help Desk <helpdesk@capvtal.com>';
}

function appUrl(path: string) {
  const base = (process.env['APP_URL'] ?? '').trim().replace(/\/$/, '');
  return base ? `${base}${path}` : '#';
}

async function sendEmail(to: string[], subject: string, html: string) {
  const resendKey = process.env['RESEND_API_KEY'];
  if (!resendKey) throw new Error('Email is not configured on the server.');
  if (to.length === 0) return;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({ from: fromAddress(), to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend request failed [${res.status}]: ${body}`);
    throw new Error(`Email send failed [${res.status}]: ${body}`);
  }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function initials(name: string | null | undefined) {
  const n = (name ?? '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || n[0]!.toUpperCase();
}

type Person = { name: string | null; email: string | null } | null;

function personRow(label: string, person: Person, avatarColor: string) {
  if (!person || (!person.name && !person.email)) {
    return `
      <div style="flex:1;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.8px;color:#9aa3af;">${esc(label)}</p>
        <p style="margin:0;font-size:13px;color:#9aa3af;">Unassigned</p>
      </div>`;
  }
  return `
    <div style="flex:1;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.8px;color:#9aa3af;">${esc(label)}</p>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;border-radius:50%;background:${avatarColor};color:#ffffff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${esc(initials(person.name))}</div>
        <div>
          <p style="margin:0;font-size:13px;font-weight:700;color:#111827;">${esc(person.name ?? 'Unknown')}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">${esc(person.email ?? '')}</p>
        </div>
      </div>
    </div>`;
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  Open: { bg: '#e6f1fb', fg: '#0c447c', label: 'OPEN' },
  'In Progress': { bg: '#faeeda', fg: '#854f0b', label: 'IN PROGRESS' },
  Resolved: { bg: '#e1f5ee', fg: '#085041', label: 'RESOLVED' },
  Closed: { bg: '#f1efe8', fg: '#444441', label: 'CLOSED' },
};

function layout(opts: {
  badgeLabel: string;
  badgeBg: string;
  badgeFg: string;
  title: string;
  intro: string;
  ticketRef: string;
  ticketTitle: string;
  priority: string;
  category: string;
  description?: string | null;
  requester: Person;
  assignee: Person;
  ctaHref: string;
}) {
  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#eef1f5;padding:40px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,0.08);border:1px solid #e5e7eb;">

    <div style="background:#0b2f52;padding:28px 36px;">
      <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:1px;">TIPP FOCUS</span>
      <div style="color:#9db8d1;font-size:11px;letter-spacing:2px;margin-top:2px;">HELP DESK</div>
    </div>

    <div style="padding:8px 36px 0;">
      <div style="border-bottom:3px solid #1d9e75;width:48px;margin-top:24px;"></div>
    </div>

    <div style="padding:20px 36px 0;">
      <span style="display:inline-block;background:${opts.badgeBg};color:${opts.badgeFg};font-size:11px;font-weight:700;letter-spacing:0.5px;padding:5px 12px;border-radius:20px;">${esc(opts.badgeLabel)}</span>
      <h2 style="margin:16px 0 6px;color:#0b2f52;font-size:21px;font-weight:700;">${esc(opts.title)}</h2>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5b6472;">${esc(opts.intro)}</p>
    </div>

    <div style="margin:0 36px;background:#f8fafc;border:1px solid #e9edf2;border-radius:10px;padding:20px 22px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#111827;">${esc(opts.ticketRef)} — ${esc(opts.ticketTitle)}</p>
      <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">Priority: ${esc(opts.priority)} &middot; Category: ${esc(opts.category)}</p>
      ${opts.description ? `<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#374151;">${esc(opts.description)}</p>` : ''}

      <div style="border-top:1px solid #e9edf2;padding-top:16px;display:flex;gap:16px;">
        ${personRow('REQUESTED BY', opts.requester, '#0b2f52')}
        ${personRow('ASSIGNED TO', opts.assignee, '#1d9e75')}
      </div>
    </div>

    <div style="padding:26px 36px 32px;">
      <a href="${opts.ctaHref}" style="display:inline-block;background:#0b2f52;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px;">View ticket</a>
    </div>

    <div style="background:#f8fafc;padding:18px 36px;border-top:1px solid #e9edf2;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9aa3af;">Tipp Focus Help Desk &middot; This is an automated message</p>
    </div>

  </div>
</div>`;
}

export const notifyTicketEvent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { createAdminClient } = await import('./admin-client.server');
    const admin = createAdminClient();

    const { data: ticket, error } = await admin
      .from('tickets')
      .select('*')
      .eq('id', data.ticketId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error('Ticket not found');

    const ref = `#${String(ticket.ticket_number ?? '').padStart(5, '0')}`;

    const ids = [ticket.submitted_by, ticket.assigned_to].filter(Boolean) as string[];
    const { data: people } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const personOf = (id: string | null): Person =>
      id ? (people?.find((p) => p.id === id) ?? null) && {
        name: people?.find((p) => p.id === id)?.full_name ?? null,
        email: people?.find((p) => p.id === id)?.email ?? null,
      } : null;

    const { data: staffRoles } = await admin
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'technician', 'helpdesk_agent']);
    const staffIds = (staffRoles ?? []).map((r) => r.user_id);
    const { data: staff } = await admin
      .from('profiles')
      .select('email')
      .in('id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000']);
    const staffEmails = (staff ?? []).map((s) => s.email).filter(Boolean) as string[];

    const requester = personOf(ticket.submitted_by);
    const assignee = personOf(ticket.assigned_to);
    const requestorEmail = requester?.email ?? null;
    const assigneeEmail = assignee?.email ?? null;

    const ctaHref = appUrl(`/tickets/${ticket.id}`);
    const commonFields = {
      ticketRef: ref,
      ticketTitle: ticket.title as string,
      priority: ticket.priority as string,
      category: ticket.category as string,
      description: ticket.description as string | null,
      requester,
      assignee,
      ctaHref,
    };

    if (data.event === 'created') {
      if (requestorEmail)
        await sendEmail(
          [requestorEmail],
          `We received your ticket ${ref}`,
          layout({
            ...commonFields,
            badgeLabel: 'RECEIVED',
            badgeBg: '#e6f1fb',
            badgeFg: '#0c447c',
            title: 'Your ticket has been logged',
            intro: 'Thanks — our IT team has received your request and will be in touch shortly.',
          }),
        );
      const alertList = staffEmails.filter((e) => e !== requestorEmail);
      if (alertList.length)
        await sendEmail(
          alertList,
          `New ticket ${ref}: ${ticket.title}`,
          layout({
            ...commonFields,
            badgeLabel: 'NEW TICKET',
            badgeBg: '#e6f1fb',
            badgeFg: '#0c447c',
            title: 'New help desk ticket',
            intro: 'A new ticket has been submitted.',
          }),
        );
    }

    if (data.event === 'assigned' && assigneeEmail) {
      await sendEmail(
        [assigneeEmail],
        `Ticket ${ref} assigned to you`,
        layout({
          ...commonFields,
          badgeLabel: 'ASSIGNED',
          badgeBg: '#faeeda',
          badgeFg: '#854f0b',
          title: 'Ticket assigned to you',
          intro: 'You have been assigned this ticket.',
        }),
      );
    }

    if (data.event === 'status') {
      const resolved = ticket.status === 'Resolved' || ticket.status === 'Closed';
      const to = [requestorEmail, assigneeEmail].filter(Boolean) as string[];
      const statusStyle = STATUS_STYLES[ticket.status as string] ?? STATUS_STYLES.Open!;
      if (to.length)
        await sendEmail(
          Array.from(new Set(to)),
          resolved ? `Ticket ${ref} resolved` : `Ticket ${ref} status: ${ticket.status}`,
          layout({
            ...commonFields,
            badgeLabel: statusStyle.label,
            badgeBg: statusStyle.bg,
            badgeFg: statusStyle.fg,
            title: resolved ? 'Your issue has been resolved' : 'Ticket status updated',
            intro: resolved
              ? 'Our team has marked your ticket as resolved. Reply in the app if the issue persists.'
              : `The status of your ticket is now ${ticket.status}.`,
          }),
        );
    }

    if (data.event === 'comment') {
      const to = [requestorEmail, assigneeEmail].filter(Boolean) as string[];
      if (to.length)
        await sendEmail(
          Array.from(new Set(to)),
          `New reply on ticket ${ref}`,
          layout({
            ...commonFields,
            badgeLabel: 'NEW REPLY',
            badgeBg: '#fbeaf0',
            badgeFg: '#72243e',
            title: 'New reply on your ticket',
            intro: data.note ?? 'A new comment was added to your ticket.',
          }),
        );
    }

    return { ok: true };
  });
