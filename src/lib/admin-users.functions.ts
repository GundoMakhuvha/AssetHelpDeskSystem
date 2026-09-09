import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  department: z.string().trim().max(120).optional().nullable(),
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
      password: data.password,
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

    // Ensure profile row exists with the given details (trigger may or may not have run)
    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        { id: newId, email, full_name: data.full_name, department: data.department ?? null },
        { onConflict: 'id' },
      );
    if (pErr) throw new Error(pErr.message);

    // Replace role (trigger may have set admin by default)
    await supabaseAdmin.from('user_roles').delete().eq('user_id', newId);
    const { error: rErr } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newId, role: data.role });
    if (rErr) throw new Error(rErr.message);

    return { id: newId, email };
  });
