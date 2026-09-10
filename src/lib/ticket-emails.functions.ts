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

function layout(title: string, lines: string[]) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#12457a;padding:20px 32px;text-align:center;">
      <img src="https://i.postimg.cc/prZt3kS1/tipp-focus-logo.png" alt="Tipp Focus" style="height:36px;display:inline-block;" />
    </div>

    <!-- Body -->
    <div style="padding:32px;color:#111827;">
      <h2 style="margin:0 0 16px;color:#12457a;font-size:20px;font-weight:700;">${title}</h2>
      ${lines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${l}</p>`).join('')}
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#6b7280;">Tipp Focus Help Desk</p>
    </div>

  </div>
</div>`;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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
    const { data: people } = await admin.from('profiles').select('id, email, full_name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const emailOf = (id: string | null) => people?.find((p) => p.id === id)?.email ?? null;

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

    const requestor = emailOf(ticket.submitted_by);
    const assignee = emailOf(ticket.assigned_to);

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
