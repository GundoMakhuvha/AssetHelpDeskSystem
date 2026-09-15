import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { appLink } from '@/lib/app-url';

const schema = z.object({
  ticketId: z.string().uuid(),
  event: z.enum(['created', 'status', 'comment', 'assigned']),
  note: z.string().max(2000).optional().nullable(),
});

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function serverSecret(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function fromAddress() {
  const configured = serverSecret('RESEND_FROM');
  return configured || 'Tipp Focus Help Desk <helpdesk@capvtal.com>';
}

function appUrl(path: string) {
  return appLink(path);
}

async function sendEmail(to: string[], subject: string, html: string) {
  const lovableKey = serverSecret('LOVABLE_API_KEY');
  const resendKey = serverSecret('RESEND_API_KEY');
  if (!resendKey) {
    throw new Error(
      'RESEND_API_KEY is missing from this deployment. Add it to the Vercel Production environment and redeploy.',
    );
  }
  if (to.length === 0) return;

  let res: Response;
  if (lovableKey) {
    res = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': resendKey,
      },
      body: JSON.stringify({ from: fromAddress(), to, subject, html }),
    });
  } else {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from: fromAddress(), to, subject, html }),
    });
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend request failed [${res.status}]: ${body}`);
    throw new Error(`Email send failed [${res.status}]: ${body}`);
  }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return map[c] ?? c;
  });

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
      <td style="padding:0 8px 0 0;vertical-align:top;width:50%">
        <div style="font:600 10px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;color:#8a9099;margin-bottom:6px">${esc(label)}</div>
        <div style="font:400 13px/1.4 Arial,Helvetica,sans-serif;color:#9aa1aa">Unassigned</div>
      </td>`;
  }
  return `
    <td style="padding:0 8px 0 0;vertical-align:top;width:50%">
      <div style="font:600 10px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;color:#8a9099;margin-bottom:6px">${esc(label)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:34px;vertical-align:middle">
          <div style="width:32px;height:32px;border-radius:16px;background:${avatarColor};color:#ffffff;font:700 12px/32px Arial,Helvetica,sans-serif;text-align:center">${esc(initials(person.name ?? person.email))}</div>
        </td>
        <td style="vertical-align:middle;padding-left:8px">
          <div style="font:700 13px/1.3 Arial,Helvetica,sans-serif;color:#111827">${esc(person.name ?? person.email ?? 'Unknown')}</div>
          <div style="font:400 12px/1.3 Arial,Helvetica,sans-serif;color:#6b7280">${esc(person.email ?? '')}</div>
        </td>
      </tr></table>
    </td>`;
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  Open: { bg: '#e6f1fb', fg: '#0c447c', label: 'OPEN' },
  'In Progress': { bg: '#faeeda', fg: '#854f0b', label: 'IN PROGRESS' },
  'On Hold': { bg: '#f1efe8', fg: '#444441', label: 'ON HOLD' },
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
<div style="margin:0;padding:24px 12px;background:#f4f6f9">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <tr>
      <td style="background:#0b2f52;padding:20px 24px">
        <div style="font:700 18px/1.2 Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:.04em">TIPP FOCUS</div>
        <div style="font:600 11px/1.4 Arial,Helvetica,sans-serif;color:#9dc2e6;letter-spacing:.14em;margin-top:2px">HELP DESK</div>
      </td>
    </tr>
    <tr><td style="height:3px;background:#1d9e75;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr>
      <td style="padding:24px 24px 8px">
        <span style="display:inline-block;background:${opts.badgeBg};color:${opts.badgeFg};font:700 10px/1 Arial,Helvetica,sans-serif;letter-spacing:.1em;padding:7px 10px;border-radius:999px">${esc(opts.badgeLabel)}</span>
        <h1 style="margin:14px 0 6px;font:700 20px/1.3 Arial,Helvetica,sans-serif;color:#111827">${esc(opts.title)}</h1>
        <p style="margin:0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#4b5563">${esc(opts.intro)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px">
          <tr><td style="padding:16px 18px">
            <div style="font:700 15px/1.4 Arial,Helvetica,sans-serif;color:#0b2f52">${esc(opts.ticketRef)} — ${esc(opts.ticketTitle)}</div>
            <div style="margin-top:6px;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#6b7280">Priority: ${esc(opts.priority)} &middot; Category: ${esc(opts.category)}</div>
            ${opts.description ? `<p style="margin:12px 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#374151">${esc(opts.description)}</p>` : ''}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;border-top:1px solid #e5e7eb"><tr>
              ${personRow('REQUESTED BY', opts.requester, '#0b2f52')}
              ${personRow('ASSIGNED TO', opts.assignee, '#1d9e75')}
            </tr></table>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px 4px">
        <a href="${opts.ctaHref}" style="display:inline-block;background:#0b2f52;color:#ffffff;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;padding:13px 22px;border-radius:8px">View ticket</a>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px 24px">
        <p style="margin:0;font:400 11px/1.5 Arial,Helvetica,sans-serif;color:#9aa1aa">Tipp Focus Help Desk &middot; This is an automated message</p>
      </td>
    </tr>
  </table>
</div>`;
}

export const sendTicketNotificationEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: payload, error } = await context.supabase.rpc('ticket_email_payload' as never, {
      _ticket_id: data.ticketId,
    } as never);
    if (error) throw new Error(error.message);

    const info = payload as unknown as {
      ticket: Record<string, unknown>;
      requestor_email: string | null;
      requestor_name?: string | null;
      assignee_email: string | null;
      assignee_name?: string | null;
      manager_email?: string | null;
      manager_name?: string | null;
      staff_emails: string[];
    } | null;
    if (!info?.ticket) throw new Error('Ticket not found');

    const ticket = info.ticket as {
      id?: string;
      ticket_number?: number | null;
      title?: string;
      description?: string | null;
      priority?: string;
      category?: string;
      status?: string;
    };

    const ref = `#${String(ticket.ticket_number ?? '').padStart(5, '0')}`;
    const requestorEmail = info.requestor_email;
    const assigneeEmail = info.assignee_email;
    const staffEmails = (info.staff_emails ?? []).filter(Boolean);
    const managerEmail = info.manager_email ?? null;

    const requester: Person = requestorEmail
      ? { name: info.requestor_name ?? null, email: requestorEmail }
      : null;
    const assignee: Person = assigneeEmail
      ? { name: info.assignee_name ?? null, email: assigneeEmail }
      : null;

    const commonFields = {
      ticketRef: ref,
      ticketTitle: ticket.title ?? '',
      priority: ticket.priority ?? '',
      category: ticket.category ?? '',
      description: ticket.description ?? null,
      requester,
      assignee,
      ctaHref: appUrl('/tickets'),
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
      const alertList = [...staffEmails, managerEmail].filter(
        (e): e is string => !!e && e !== requestorEmail,
      );
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
      const to = [requestorEmail, assigneeEmail, managerEmail].filter(Boolean) as string[];
      const statusStyle = STATUS_STYLES[ticket.status ?? 'Open'] ?? STATUS_STYLES['Open']!;
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
      const to = [requestorEmail, assigneeEmail, managerEmail].filter(Boolean) as string[];
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
