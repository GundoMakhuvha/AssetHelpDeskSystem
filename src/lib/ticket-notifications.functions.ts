import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const schema = z.object({
  ticketId: z.string().uuid(),
  event: z.enum(['created', 'status', 'comment', 'assigned']),
  note: z.string().max(2000).optional().nullable(),
});

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function fromAddress() {
  const configured = (process.env['RESEND_FROM'] ?? '').trim();
  return configured || 'Tipp Focus Help Desk <helpdesk@capvtal.com>';
}

function serverSecret(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]|['"]$/g, '');
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

  // On Lovable Cloud the Resend connector injects a gateway connection key plus
  // LOVABLE_API_KEY, so route through the connector gateway there. On any other
  // host (e.g. Vercel) RESEND_API_KEY is the raw Resend API key — call Resend
  // directly with no Lovable dependency.
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

function layout(title: string, lines: string[]) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:24px;color:#111827">
    <h2 style="margin:0 0 12px;color:#12457a">${title}</h2>
    ${lines.map((l) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5">${l}</p>`).join('')}
    <p style="margin-top:20px;font-size:12px;color:#6b7280">Tipp Focus Help Desk</p>
  </div>`;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => {
    const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    return escaped ?? c;
  });

// Keep this function name unique from earlier deployments. Some external hosts
// can retain stale server-function manifests across incremental deployments.
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
      assignee_email: string | null;
      staff_emails: string[];
    } | null;
    if (!info?.ticket) throw new Error('Ticket not found');

    const ticket = info.ticket as {
      ticket_number?: number | null;
      title?: string;
      description?: string | null;
      priority?: string;
      category?: string;
      status?: string;
    };

    const ref = `#${String(ticket.ticket_number ?? '').padStart(5, '0')}`;

    const requestor = info.requestor_email;
    const assignee = info.assignee_email;
    const staffEmails = (info.staff_emails ?? []).filter(Boolean);


    const base = [
      `<strong>${esc(ref)} — ${esc(ticket.title)}</strong>`,
      `Priority: ${esc(ticket.priority)} · Category: ${esc(ticket.category)} · Status: ${esc(ticket.status)}`,
      ticket.description ? `${esc(ticket.description)}` : '',
    ].filter(Boolean);

    if (data.event === 'created') {
      if (requestor)
        await sendEmail(
          [requestor],
          `We received your ticket ${ref}`,
          layout('Your ticket has been logged', [
            'Thanks — our IT team has received your request and will be in touch shortly.',
            ...base,
          ]),
        );
      const alertList = staffEmails.filter((e) => e !== requestor);
      if (alertList.length)
        await sendEmail(
          alertList,
          `New ticket ${ref}: ${ticket.title}`,
          layout('New help desk ticket', ['A new ticket has been submitted.', ...base]),
        );
    }

    if (data.event === 'assigned' && assignee) {
      await sendEmail(
        [assignee],
        `Ticket ${ref} assigned to you`,
        layout('Ticket assigned to you', ['You have been assigned this ticket.', ...base]),
      );
    }

    if (data.event === 'status') {
      const resolved = ticket.status === 'Resolved' || ticket.status === 'Closed';
      const to = [requestor, assignee].filter(Boolean) as string[];
      if (to.length)
        await sendEmail(
          Array.from(new Set(to)),
          resolved ? `Ticket ${ref} resolved` : `Ticket ${ref} status: ${ticket.status}`,
          layout(resolved ? 'Your issue has been resolved' : 'Ticket status updated', [
            resolved
              ? 'Our team has marked your ticket as resolved. Reply in the app if the issue persists.'
              : `The status of your ticket is now <strong>${esc(ticket.status)}</strong>.`,
            ...base,
          ]),
        );
    }

    if (data.event === 'comment') {
      const to = [requestor, assignee].filter(Boolean) as string[];
      if (to.length)
        await sendEmail(
          Array.from(new Set(to)),
          `New reply on ticket ${ref}`,
          layout('New reply on your ticket', [
            data.note ? esc(data.note) : 'A new comment was added to your ticket.',
            ...base,
          ]),
        );
    }

    return { ok: true };
  });
