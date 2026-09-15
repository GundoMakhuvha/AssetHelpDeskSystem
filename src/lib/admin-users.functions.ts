import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  full_name: z.string().trim().min(1).max(120),
  department: z.string().trim().max(120).optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  origin: z.string().url(),
  role: z.enum([
    'admin',
    'technician',
    'asset_manager',
    'asset_viewer',
    'helpdesk_agent',
    'requestor',
    'viewer',
  ]),
});

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1!';
}

export const adminCreateUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error('Forbidden: admin role required');

    const email = data.email.toLowerCase();

    const { createAdminClient } = await import('./admin-client.server');
    const supabaseAdmin = createAdminClient();

    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) throw new Error(`A user with the email ${email} already exists.`);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) {
      const msg = error.message || 'Could not create the user';
      if (/already/i.test(msg)) throw new Error(`A user with the email ${email} already exists.`);
      throw new Error(msg);
    }
    const newId = created.user?.id;
    if (!newId) throw new Error('User created but no id returned');

    const { error: pErr } = await supabaseAdmin.from('profiles').upsert(
      {
        id: newId,
        email,
        full_name: data.full_name,
        department: data.department ?? null,
        manager_id: data.manager_id ?? null,
      },
      { onConflict: 'id' },
    );
    if (pErr) throw new Error(pErr.message);

    await supabaseAdmin.from('user_roles').delete().eq('user_id', newId);
    const { error: rErr } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newId, role: data.role });
    if (rErr) throw new Error(rErr.message);

    // Invite: the new user sets their own password via a secure link.
    const origin = data.origin.replace(/\/$/, '');
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    if (linkErr) throw new Error(`User created, but the invite link failed: ${linkErr.message}`);

    const actionLink = link?.properties?.action_link;
    if (!actionLink) throw new Error('User created, but no invite link was returned.');

    try {
      const { sendMail, brandLayout, escapeHtml } = await import('./mailer.server');
      await sendMail(
        [email],
        'Set your Tipp Focus Help Desk password',
        brandLayout({
          badgeLabel: 'WELCOME',
          badgeBg: '#e1f5ee',
          badgeFg: '#085041',
          title: `Welcome, ${escapeHtml(data.full_name)}`,
          intro:
            'An account has been created for you on the Tipp Focus Asset & Help Desk system. Choose your own password to get started. This link expires in 24 hours.',
          ctaLabel: 'Create my password',
          ctaHref: actionLink,
        }),
      );
    } catch (e) {
      return {
        id: newId,
        email,
        invited: false,
        inviteLink: actionLink,
        message: e instanceof Error ? e.message : 'Invite email could not be sent.',
      };
    }

    return { id: newId, email, invited: true, inviteLink: actionLink, message: '' };
  });
