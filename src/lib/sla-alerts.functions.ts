import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { appLink } from '@/lib/app-url';

const FALLBACK: Record<string, number> = { Critical: 240, High: 480, Medium: 1440, Low: 4320 };
const WARN_WINDOW_MS = 12 * 60 * 60 * 1000;
const OPEN_STATUSES = ['Open', 'In Progress', 'On Hold'];

/**
 * Warns admins 12 hours before a ticket breaches its SLA resolution target.
 * Idempotent: each ticket is only warned once (ticket_sla_alerts).
 */
export const runSlaBreachWarnings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) return { checked: 0, warned: 0 };

    const [{ data: catSla }, { data: baseSla }, { data: tickets }, { data: alerted }] =
      await Promise.all([
        supabase.from('sla_category_policies' as never).select('*'),
        supabase.from('sla_policies' as never).select('*'),
        supabase
          .from('tickets')
          .select('*')
          .in('status', OPEN_STATUSES as never),
        supabase.from('ticket_sla_alerts' as never).select('ticket_id').eq('kind', 'warn_12h'),
      ]);

    const catRows = (catSla ?? []) as unknown as {
      category: string;
      priority: string;
      resolution_minutes: number;
    }[];
    const baseRows = (baseSla ?? []) as unknown as {
      priority: string;
      resolution_minutes: number;
    }[];
    const already = new Set(
      ((alerted ?? []) as unknown as { ticket_id: string }[]).map((r) => r.ticket_id),
    );

    const minutesFor = (category: string, priority: string) =>
      catRows.find((r) => r.category === category && r.priority === priority)?.resolution_minutes ??
      baseRows.find((r) => r.priority === priority)?.resolution_minutes ??
      FALLBACK[priority] ??
      1440;

    const rows = (tickets ?? []) as unknown as {
      id: string;
      ticket_number: number;
      title: string;
      priority: string;
      category: string;
      status: string;
      created_at: string;
    }[];

    const now = Date.now();
    const due = rows
      .map((t) => ({
        t,
        dueAt: new Date(t.created_at).getTime() + minutesFor(t.category, t.priority) * 60_000,
      }))
      .filter(({ t, dueAt }) => !already.has(t.id) && dueAt > now && dueAt - now <= WARN_WINDOW_MS);

    if (due.length === 0) return { checked: rows.length, warned: 0 };

    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const adminIds = ((adminRoles ?? []) as { user_id: string }[]).map((r) => r.user_id);

    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id,email')
      .in('id', adminIds.length ? adminIds : ['00000000-0000-0000-0000-000000000000']);
    const adminEmails = ((adminProfiles ?? []) as { email: string | null }[])
      .map((p) => p.email)
      .filter(Boolean) as string[];

    let warned = 0;
    for (const { t, dueAt } of due) {
      const ref = `#${String(t.ticket_number).padStart(5, '0')}`;
      const hours = Math.max(1, Math.round((dueAt - now) / 3_600_000));

      const { error: logErr } = await supabase
        .from('ticket_sla_alerts' as never)
        .insert({ ticket_id: t.id, kind: 'warn_12h' } as never);
      if (logErr) continue; // already warned by a concurrent run

      if (adminIds.length) {
        await supabase.from('notifications').insert(
          adminIds.map((uid) => ({
            user_id: uid,
            title: `SLA warning: ticket ${ref} due in ${hours}h`,
            body: t.title,
            link: '/tickets',
          })),
        );
      }

      if (adminEmails.length) {
        try {
          const { sendMail, brandLayout, escapeHtml } = await import('./mailer.server');
          await sendMail(
            adminEmails,
            `SLA warning: ticket ${ref} is due in ${hours} hours`,
            brandLayout({
              badgeLabel: 'SLA WARNING',
              badgeBg: '#faeeda',
              badgeFg: '#854f0b',
              title: `Ticket ${ref} breaches its SLA soon`,
              intro: `"${escapeHtml(t.title)}" (${escapeHtml(t.priority)} · ${escapeHtml(
                t.category,
              )}) must be resolved by ${new Date(dueAt).toUTCString()} — about ${hours} hours from now.`,
              ctaLabel: 'Open ticket',
              ctaHref: appLink('/tickets'),
            }),
          );
        } catch {
          // email failure must not block the in-app warning
        }
      }
      warned += 1;
    }

    return { checked: rows.length, warned };
  });
