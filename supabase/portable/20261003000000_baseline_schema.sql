-- =====================================================================
-- Asset Management & Help Desk — clean baseline schema (no data)
-- =====================================================================
-- Run this ONCE in a brand-new Supabase project (SQL editor or
-- `supabase db push` after copying into supabase/migrations/).
-- It recreates enums, tables, relationships, functions, triggers,
-- RLS policies, RBAC, realtime and the storage bucket. No rows are seeded
-- except one empty settings row and the default priority SLA targets
-- (configuration, not business data — edit or delete freely).
--
-- REVIEW BEFORE RUNNING — differences from the original deployment:
--   * handle_new_user: ONLY THE FIRST account becomes admin; later
--     self-signups get 'requestor'. (Original promoted everyone to admin.)
--   * department_t: organisation-neutral list (no 'Tipp Con').
--   * helpdesk_settings.organisation_name default is 'My Organisation'.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Enums ----------
create type public.app_role as enum
  ('admin','technician','viewer','asset_manager','asset_viewer','helpdesk_agent','requestor');
create type public.department_t as enum ('CSS','Finance','IT','Facilities','Operations');
create type public.asset_condition_t as enum ('Good','Fair','Poor','Damaged');
create type public.ticket_priority_t as enum ('Low','Medium','High','Critical');
create type public.ticket_status_t as enum ('Open','In Progress','On Hold','Resolved','Closed');
create type public.ticket_category_t as enum ('Hardware','Software','Network','Access','Other');
create type public.verification_method_t as enum ('barcode','manual');

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  department text,
  manager_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.assets (
  asset_id text primary key,
  barcode text,
  serial_number text,
  asset_description text,
  assigned_to text,
  location text,
  department public.department_t,
  asset_condition public.asset_condition_t default 'Good',
  last_verified_date timestamptz,
  verified_by text,
  returned_date timestamptz,
  reallocated_to uuid references public.profiles(id) on delete set null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  registration_date timestamptz not null default now()
);
create index idx_assets_barcode on public.assets(barcode);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.assets(asset_id) on delete cascade,
  verified_by text not null,
  verified_at timestamptz not null default now(),
  method public.verification_method_t not null default 'manual',
  condition_at_verification public.asset_condition_t,
  notes text
);
create index idx_verifications_asset on public.verifications(asset_id);

create sequence public.tickets_number_seq start 1;
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint not null default nextval('public.tickets_number_seq') unique,
  title text not null,
  description text,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  department public.department_t,
  priority public.ticket_priority_t not null default 'Medium',
  status public.ticket_status_t not null default 'Open',
  category text not null default 'Other',
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter sequence public.tickets_number_seq owned by public.tickets.ticket_number;
create index idx_tickets_status on public.tickets(status);
create index idx_tickets_priority on public.tickets(priority);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  default_priority public.ticket_priority_t not null default 'Medium',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sla_policies (
  priority public.ticket_priority_t primary key,
  response_minutes integer not null,
  resolution_minutes integer not null,
  business_hours_only boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.sla_category_policies (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  priority public.ticket_priority_t not null,
  response_minutes integer not null,
  resolution_minutes integer not null,
  business_hours_only boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (category, priority)
);

create table public.ticket_sla_alerts (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, kind)
);

create table public.helpdesk_settings (
  id boolean primary key default true check (id),
  organisation_name text not null default 'My Organisation',
  support_email text,
  default_assignee uuid references public.profiles(id) on delete set null,
  auto_close_days integer not null default 5,
  business_start time not null default '08:00',
  business_end time not null default '17:00',
  working_days integer[] not null default array[1,2,3,4,5],
  timezone text not null default 'Africa/Johannesburg',
  allow_attachments boolean not null default true,
  require_category boolean not null default true,
  notify_requestor boolean not null default true,
  notify_agents boolean not null default true,
  agent_notify_emails text,
  ticket_footer text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  level text not null default 'info' check (level in ('info','warning','critical')),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null unique,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text,
  action text not null,
  actor_id uuid,
  actor_email text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log(created_at desc);

-- Private tables (no policies = no client access; only security-definer functions)
create table public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create table public.password_reset_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.password_setup_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  temp_password text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Grants ----------
grant select, insert, update, delete on
  public.profiles, public.user_roles, public.assets, public.verifications,
  public.tickets, public.ticket_comments, public.notifications,
  public.ticket_categories, public.sla_policies, public.sla_category_policies,
  public.ticket_sla_alerts, public.helpdesk_settings, public.announcements,
  public.holidays, public.activity_log
to authenticated;
grant usage, select on sequence public.tickets_number_seq to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------- Helper functions (RBAC) ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public."current_role"()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid()
  order by case role when 'admin' then 1 when 'technician' then 2 else 3 end limit 1;
$$;

create or replace function public.is_manager_of(_manager uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = _user and p.manager_id = _manager and _manager is not null);
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public."current_role"() to authenticated;
grant execute on function public.is_manager_of(uuid, uuid) to authenticated;

-- ---------- Trigger functions ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.set_sla_updated()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;

-- First account ever created becomes admin; everyone else starts as requestor.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id,
          case when exists (select 1 from public.user_roles where role = 'admin')
               then 'requestor'::public.app_role else 'admin'::public.app_role end)
  on conflict do nothing;
  return new;
end $$;

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec_id text; diff jsonb; email text;
begin
  if tg_table_name = 'assets' then
    rec_id := coalesce(new.asset_id, old.asset_id);
  else
    rec_id := coalesce(new.id, old.id)::text;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) into diff
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value;
    if diff is null then return new; end if;
  elsif tg_op = 'INSERT' then diff := to_jsonb(new);
  else diff := to_jsonb(old);
  end if;

  select p.email into email from public.profiles p where p.id = auth.uid();
  insert into public.activity_log (table_name, record_id, action, actor_id, actor_email, changes)
  values (tg_table_name, rec_id, tg_op, auth.uid(), email, diff);
  return coalesce(new, old);
end $$;

create or replace function public.notify_ticket_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_to <> new.submitted_by then
      insert into public.notifications(user_id, title, body, link)
      values (new.assigned_to, 'New ticket assigned: #' || new.ticket_number, new.title, '/tickets');
    end if;
  elsif tg_op = 'UPDATE' then
    if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
      insert into public.notifications(user_id, title, body, link)
      values (new.assigned_to, 'Ticket assigned to you: #' || new.ticket_number, new.title, '/tickets');
    end if;
    if new.status is distinct from old.status then
      insert into public.notifications(user_id, title, body, link)
      values (new.submitted_by, 'Ticket #' || new.ticket_number || ' status: ' || new.status, new.title, '/tickets');
    end if;
  end if;
  return new;
end $$;

create or replace function public.notify_ticket_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if t.submitted_by is not null and t.submitted_by <> new.author_id and not new.is_internal then
    insert into public.notifications(user_id, title, body, link)
    values (t.submitted_by, 'New comment on ticket #' || t.ticket_number, left(new.body, 140), '/tickets');
  end if;
  if t.assigned_to is not null and t.assigned_to <> new.author_id and t.assigned_to <> t.submitted_by then
    insert into public.notifications(user_id, title, body, link)
    values (t.assigned_to, 'New comment on ticket #' || t.ticket_number, left(new.body, 140), '/tickets');
  end if;
  return new;
end $$;

-- ---------- Triggers ----------
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger trg_tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();
create trigger trg_cat_updated before update on public.ticket_categories
  for each row execute function public.set_updated_at();
create trigger trg_hds_updated before update on public.helpdesk_settings
  for each row execute function public.set_updated_at();
create trigger trg_ann_updated before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger trg_sla_updated before update on public.sla_policies
  for each row execute function public.set_sla_updated();
create trigger trg_slacat_updated before update on public.sla_category_policies
  for each row execute function public.set_sla_updated();

create trigger trg_log_assets after insert or update or delete on public.assets
  for each row execute function public.log_activity();
create trigger trg_log_tickets after insert or update or delete on public.tickets
  for each row execute function public.log_activity();

create trigger tickets_notify after insert or update on public.tickets
  for each row execute function public.notify_ticket_change();
create trigger ticket_comments_notify after insert on public.ticket_comments
  for each row execute function public.notify_ticket_comment();

-- ---------- Admin / account RPCs ----------
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
  order by p.full_name nulls last;
$$;

create or replace function public.admin_set_role(_user_id uuid, _role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role);
end $$;

create or replace function public.admin_email_exists(_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
     and exists (select 1 from public.profiles p where lower(p.email) = lower(_email));
$$;

create or replace function public.admin_finalize_user(
  _user_id uuid, _email text, _full_name text, _department text, _manager_id uuid, _role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  insert into public.profiles (id, email, full_name, department, manager_id)
  values (_user_id, _email, _full_name, _department, _manager_id)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name,
    department = excluded.department, manager_id = excluded.manager_id;
  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role);
end $$;

create or replace function public.admin_create_setup_token(_user_id uuid, _email text, _temp_password text)
returns text language plpgsql security definer set search_path = public as $$
declare _token text;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Only admins can create invite links'; end if;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.password_setup_tokens (token, user_id, email, temp_password)
  values (_token, _user_id, lower(_email), _temp_password);
  return _token;
end $$;

create or replace function public.redeem_setup_token(_token text)
returns table(email text, temp_password text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.password_setup_tokens t set used_at = now()
   where t.token = _token and t.used_at is null and t.expires_at > now()
  returning t.email, t.temp_password;
end $$;

-- Password reset: caller must present the shared APP_MAIL_SECRET.
create or replace function public.create_password_reset_token(_email text, _secret text)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_token text;
begin
  if not exists (select 1 from public.app_secrets where key = 'mail_secret' and value = _secret) then
    raise exception 'unauthorized';
  end if;
  select id into v_user from auth.users where lower(email) = lower(_email) limit 1;
  if v_user is null then return null; end if;
  if (select count(*) from public.password_reset_tokens
      where user_id = v_user and created_at > now() - interval '1 hour') >= 5 then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.password_reset_tokens (token, user_id, email) values (v_token, v_user, lower(_email));
  return v_token;
end $$;

create or replace function public.redeem_password_reset(_token text, _new_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare r public.password_reset_tokens%rowtype;
begin
  if _new_password is null or length(_new_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  select * into r from public.password_reset_tokens
   where token = _token and used_at is null and expires_at > now();
  if r.token is null then raise exception 'This password reset link is invalid or has expired.'; end if;
  update auth.users set encrypted_password = extensions.crypt(_new_password, extensions.gen_salt('bf')),
                        updated_at = now()
   where id = r.user_id;
  update public.password_reset_tokens set used_at = now() where token = r.token;
  return r.email;
end $$;

create or replace function public.ticket_email_payload(_ticket_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ticket', to_jsonb(t) - 'attachment_url',
    'requestor_email', (select p.email from public.profiles p where p.id = t.submitted_by),
    'requestor_name', (select p.full_name from public.profiles p where p.id = t.submitted_by),
    'assignee_email', (select p.email from public.profiles p where p.id = t.assigned_to),
    'assignee_name', (select p.full_name from public.profiles p where p.id = t.assigned_to),
    'manager_email', (select m.email from public.profiles m
       where m.id = (select p.manager_id from public.profiles p where p.id = t.submitted_by)),
    'manager_name', (select m.full_name from public.profiles m
       where m.id = (select p.manager_id from public.profiles p where p.id = t.submitted_by)),
    'admin_emails', coalesce((select jsonb_agg(distinct p.email) from public.user_roles ur
       join public.profiles p on p.id = ur.user_id
       where ur.role = 'admin' and p.email is not null), '[]'::jsonb),
    'staff_emails', coalesce((select jsonb_agg(distinct p.email) from public.user_roles ur
       join public.profiles p on p.id = ur.user_id
       where ur.role in ('admin','technician','helpdesk_agent') and p.email is not null), '[]'::jsonb)
  )
  from public.tickets t
  where t.id = _ticket_id
    and (t.submitted_by = auth.uid() or t.assigned_to = auth.uid()
         or public.is_manager_of(auth.uid(), t.submitted_by)
         or exists (select 1 from public.user_roles ur2 where ur2.user_id = auth.uid()
                    and ur2.role in ('admin','technician','helpdesk_agent')));
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_activity() from public, anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_email_exists(text) to authenticated;
grant execute on function public.admin_finalize_user(uuid, text, text, text, uuid, public.app_role) to authenticated;
grant execute on function public.admin_create_setup_token(uuid, text, text) to authenticated;
grant execute on function public.redeem_setup_token(text) to anon, authenticated;
grant execute on function public.create_password_reset_token(text, text) to anon, authenticated;
grant execute on function public.redeem_password_reset(text, text) to anon, authenticated;
grant execute on function public.ticket_email_payload(uuid) to authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.assets enable row level security;
alter table public.verifications enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.ticket_categories enable row level security;
alter table public.sla_policies enable row level security;
alter table public.sla_category_policies enable row level security;
alter table public.ticket_sla_alerts enable row level security;
alter table public.helpdesk_settings enable row level security;
alter table public.announcements enable row level security;
alter table public.holidays enable row level security;
alter table public.activity_log enable row level security;
alter table public.app_secrets enable row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.password_setup_tokens enable row level security;

-- profiles
create policy profiles_self_read on public.profiles for select to authenticated using (true);
create policy profiles_self_update on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- user_roles
create policy roles_self_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy roles_admin_write on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- assets
create policy assets_read on public.assets for select to authenticated using (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
  or public.has_role(auth.uid(),'asset_manager') or public.has_role(auth.uid(),'asset_viewer')
  or public.has_role(auth.uid(),'viewer'));
create policy assets_write on public.assets for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
         or public.has_role(auth.uid(),'asset_manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
         or public.has_role(auth.uid(),'asset_manager'));

-- verifications
create policy ver_read on public.verifications for select to authenticated using (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
  or public.has_role(auth.uid(),'asset_manager') or public.has_role(auth.uid(),'asset_viewer')
  or public.has_role(auth.uid(),'viewer'));
create policy ver_insert on public.verifications for insert to authenticated with check (
  public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
  or public.has_role(auth.uid(),'asset_manager'));

-- tickets
create policy tickets_read on public.tickets for select to authenticated using (
  submitted_by = auth.uid() or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'technician') or public.has_role(auth.uid(),'helpdesk_agent')
  or public.is_manager_of(auth.uid(), submitted_by));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (submitted_by = auth.uid());
create policy tickets_update on public.tickets for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
         or public.has_role(auth.uid(),'helpdesk_agent') or submitted_by = auth.uid())
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')
         or public.has_role(auth.uid(),'helpdesk_agent') or submitted_by = auth.uid());
create policy tickets_delete_admin on public.tickets for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- ticket_comments
create policy comments_read on public.ticket_comments for select to authenticated using (
  exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id and (
    t.submitted_by = auth.uid() or public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'technician') or public.has_role(auth.uid(),'helpdesk_agent')
    or (public.is_manager_of(auth.uid(), t.submitted_by) and ticket_comments.is_internal = false))));
create policy comments_insert on public.ticket_comments for insert to authenticated
  with check (author_id = auth.uid());

-- notifications
create policy notif_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update_own on public.notifications for update to authenticated using (user_id = auth.uid());
create policy notif_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy notif_insert on public.notifications for insert to authenticated with check (
  user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'));

-- configuration tables: everyone signed in reads, admins write
create policy cat_read on public.ticket_categories for select to authenticated using (true);
create policy cat_admin on public.ticket_categories for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy sla_read on public.sla_policies for select to authenticated using (true);
create policy sla_admin_write on public.sla_policies for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy slacat_read on public.sla_category_policies for select to authenticated using (true);
create policy slacat_admin on public.sla_category_policies for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy hds_read on public.helpdesk_settings for select to authenticated using (true);
create policy hds_admin on public.helpdesk_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy ann_read on public.announcements for select to authenticated using (true);
create policy ann_admin on public.announcements for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy hol_read on public.holidays for select to authenticated using (true);
create policy hol_admin on public.holidays for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- SLA alerts & audit log
create policy slaalert_read on public.ticket_sla_alerts for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'));
create policy slaalert_insert on public.ticket_sla_alerts for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'));
create policy act_read on public.activity_log for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'));
-- app_secrets / password_*_tokens: RLS on, no policies (server functions only).

-- ---------- Realtime (in-app notification bell) ----------
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.notifications;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy ticket_att_read on storage.objects for select to authenticated using (
  bucket_id = 'ticket-attachments' and (owner = auth.uid()
    or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')));
create policy ticket_att_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-attachments');

-- ---------- Configuration rows (not business data) ----------
insert into public.helpdesk_settings (id) values (true) on conflict do nothing;
insert into public.sla_policies (priority, response_minutes, resolution_minutes) values
  ('Low', 480, 4320), ('Medium', 240, 1440), ('High', 60, 480), ('Critical', 15, 240)
on conflict do nothing;

-- ---------- Password-reset shared secret ----------
-- Replace the placeholder with the SAME value you set as APP_MAIL_SECRET
-- in your hosting environment, then run this line:
-- insert into public.app_secrets (key, value) values ('mail_secret', '<your APP_MAIL_SECRET>');

-- Admin-triggered password reset (Setup > Users & Roles): link lasts 7 days.
create or replace function public.admin_create_password_reset_token(_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_token text;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Only admins can reset passwords.'; end if;
  select id into v_user from auth.users where lower(email) = lower(_email) limit 1;
  if v_user is null then raise exception 'No account exists for %', _email; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.password_reset_tokens (token, user_id, email, expires_at)
  values (v_token, v_user, lower(_email), now() + interval '7 days');
  return v_token;
end $$;
revoke all on function public.admin_create_password_reset_token(text) from public, anon;
grant execute on function public.admin_create_password_reset_token(text) to authenticated;