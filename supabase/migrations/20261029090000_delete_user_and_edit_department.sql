-- =====================================================================
-- 2026-10-29: Delete users (leavers) + edit department from Setup
-- Safe to run more than once. Run in the Supabase SQL editor BEFORE
-- deploying the matching frontend. Works on both the Tipp Focus database
-- and the portable (SITA) baseline.
--
-- How "Delete user" works
--   * The sign-in account (auth.users) is deleted, so the person can no
--     longer sign in, and their roles, notifications and tokens go with it.
--   * Their profile is KEPT but marked deleted (deleted_at), so the tickets
--     they logged, their comments and asset history still show their name.
--     (Previously, deleting a profile cascaded and erased their tickets.)
--   * Anyone who reported to them gets "No manager"; open tickets assigned
--     to them go back to the unassigned queue; if they were the default
--     help desk assignee, that setting is cleared.
-- =====================================================================

-- ---------- 1. Archive flag on profiles ----------
alter table public.profiles add column if not exists deleted_at timestamptz;
create index if not exists idx_profiles_active on public.profiles(id) where deleted_at is null;

-- ---------- 2. Keep the profile when the login is deleted ----------
-- profiles.id used to reference auth.users ON DELETE CASCADE, which would
-- wipe the profile and (through tickets/comments) the person's history.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

-- ---------- 3. Delete user (admin only) ----------
create or replace function public.admin_delete_user(_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;
  if not exists (select 1 from public.profiles where id = _user_id and deleted_at is null) then
    raise exception 'User not found or already deleted.';
  end if;

  -- Never leave the system without an admin.
  if public.has_role(_user_id, 'admin')
     and (select count(distinct ur.user_id) from public.user_roles ur
          join public.profiles p on p.id = ur.user_id and p.deleted_at is null
          where ur.role = 'admin') <= 1 then
    raise exception 'This is the last admin. Make someone else an admin first.';
  end if;

  -- Tidy up references to the leaver.
  update public.profiles set manager_id = null where manager_id = _user_id;
  update public.tickets set assigned_to = null
    where assigned_to = _user_id and status not in ('Resolved', 'Closed');
  update public.helpdesk_settings set default_assignee = null where default_assignee = _user_id;

  -- Older databases created these without ON DELETE SET NULL, which would
  -- block deleting anyone who ever posted an announcement or changed settings.
  update public.announcements set created_by = null where created_by = _user_id;
  update public.helpdesk_settings set updated_by = null where updated_by = _user_id;
  update public.sla_policies set updated_by = null where updated_by = _user_id;

  delete from public.user_roles where user_id = _user_id;

  -- Archive the profile (history stays readable).
  update public.profiles set deleted_at = now(), manager_id = null where id = _user_id;

  -- Remove the sign-in account (sessions/identities cascade inside auth).
  delete from auth.users where id = _user_id;
end $$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------- 4. Users list hides deleted users ----------
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table(id uuid, email text, full_name text, department text, role public.app_role,
              manager_id uuid, manager_name text,
              last_sign_in_at timestamptz, user_created_at timestamptz)
language sql security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.department,
    (select ur.role from public.user_roles ur where ur.user_id = p.id
       order by case ur.role when 'admin' then 1 when 'technician' then 2 else 3 end limit 1),
    p.manager_id,
    (select m.full_name from public.profiles m where m.id = p.manager_id),
    u.last_sign_in_at, u.created_at
  from public.profiles p left join auth.users u on u.id = p.id
  where public.has_role(auth.uid(), 'admin')
    and p.deleted_at is null
  order by p.full_name nulls last;
$$;
grant execute on function public.admin_list_users() to authenticated;

-- ---------- 5. A deleted person's email can be added again later ----------
create or replace function public.admin_email_exists(_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
     and exists (select 1 from public.profiles p
                 where lower(p.email) = lower(_email) and p.deleted_at is null);
$$;
grant execute on function public.admin_email_exists(text) to authenticated;

-- ---------- 6. Edit department (admin only) ----------
-- Admins could already update profiles directly; this function keeps the
-- change admin-only and trims blanks to "no department".
create or replace function public.admin_set_department(_user_id uuid, _department text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  update public.profiles
     set department = nullif(btrim(coalesce(_department, '')), '')
   where id = _user_id and deleted_at is null;
  if not found then raise exception 'User not found.'; end if;
end $$;
revoke all on function public.admin_set_department(uuid, text) from public, anon;
grant execute on function public.admin_set_department(uuid, text) to authenticated;
