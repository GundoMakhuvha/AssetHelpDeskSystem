-- =====================================================================
-- Tipp Focus — Asset Management & Help Desk
-- Run this in your Supabase project's SQL editor (one shot).
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type public.app_role as enum ('admin','technician','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.department_t as enum ('CSS','Finance','IT','Facilities','Tipp Con');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.asset_condition_t as enum ('Good','Fair','Poor','Damaged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_priority_t as enum ('Low','Medium','High','Critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status_t as enum ('Open','In Progress','On Hold','Resolved','Closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_category_t as enum ('Hardware','Software','Network','Access','Other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_method_t as enum ('barcode','manual');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  department text,
  created_at timestamptz not null default now()
);

-- ---------- user_roles (separate table, never on profiles) ----------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------- assets (transparent — direct JSON inserts work) ----------
create table if not exists public.assets (
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
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_dept on public.assets(department);
create index if not exists idx_assets_condition on public.assets(asset_condition);
create index if not exists idx_assets_barcode on public.assets(barcode);

-- ---------- verifications ----------
create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.assets(asset_id) on delete cascade,
  verified_by text not null,
  verified_at timestamptz not null default now(),
  method public.verification_method_t not null default 'manual',
  condition_at_verification public.asset_condition_t,
  notes text
);
create index if not exists idx_verifications_asset on public.verifications(asset_id);
create index if not exists idx_verifications_at on public.verifications(verified_at desc);

-- ---------- tickets ----------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  department public.department_t,
  priority public.ticket_priority_t not null default 'Medium',
  status public.ticket_status_t not null default 'Open',
  category public.ticket_category_t not null default 'Other',
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_tickets_status on public.tickets(status);
create index if not exists idx_tickets_priority on public.tickets(priority);

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- updated_at trigger for tickets ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

-- ---------- has_role security-definer (avoids RLS recursion) ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid()
  order by case role when 'admin' then 1 when 'technician' then 2 else 3 end
  limit 1;
$$;

-- ---------- New user trigger: profile + auto-promote first user to admin ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  -- TEMP: every new signup is promoted to admin
  insert into public.user_roles (user_id, role)
  values (new.id, 'admin'::public.app_role)
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- RLS ----------
alter table public.profiles       enable row level security;
alter table public.user_roles     enable row level security;
alter table public.assets         enable row level security;
alter table public.verifications  enable row level security;
alter table public.tickets        enable row level security;
alter table public.ticket_comments enable row level security;

-- profiles
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- user_roles (read own; admins manage)
drop policy if exists "roles_self_read" on public.user_roles;
create policy "roles_self_read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

drop policy if exists "roles_admin_write" on public.user_roles;
create policy "roles_admin_write" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- assets — everyone authenticated reads; technicians/admins write
drop policy if exists "assets_read" on public.assets;
create policy "assets_read" on public.assets for select to authenticated using (true);

drop policy if exists "assets_write_techadmin" on public.assets;
create policy "assets_write_techadmin" on public.assets for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'));

-- verifications — read all auth; insert by tech/admin
drop policy if exists "ver_read" on public.verifications;
create policy "ver_read" on public.verifications for select to authenticated using (true);

drop policy if exists "ver_insert" on public.verifications;
create policy "ver_insert" on public.verifications for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician'));

-- tickets — submitters see own; tech/admin see all
drop policy if exists "tickets_read" on public.tickets;
create policy "tickets_read" on public.tickets for select to authenticated
  using (
    submitted_by = auth.uid()
    or public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'technician')
  );

drop policy if exists "tickets_insert" on public.tickets;
create policy "tickets_insert" on public.tickets for insert to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists "tickets_update" on public.tickets;
create policy "tickets_update" on public.tickets for update to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'technician')
    or submitted_by = auth.uid()
  )
  with check (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'technician')
    or submitted_by = auth.uid()
  );

drop policy if exists "tickets_delete_admin" on public.tickets;
create policy "tickets_delete_admin" on public.tickets for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- ticket_comments
drop policy if exists "comments_read" on public.ticket_comments;
create policy "comments_read" on public.ticket_comments for select to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (
          t.submitted_by = auth.uid()
          or public.has_role(auth.uid(),'admin')
          or public.has_role(auth.uid(),'technician')
        )
    )
  );

drop policy if exists "comments_insert" on public.ticket_comments;
create policy "comments_insert" on public.ticket_comments for insert to authenticated
  with check (author_id = auth.uid());

-- ---------- Storage bucket for ticket attachments ----------
insert into storage.buckets (id, name, public)
values ('ticket-attachments','ticket-attachments', true)
on conflict (id) do nothing;

drop policy if exists "ticket_att_read" on storage.objects;
create policy "ticket_att_read" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-attachments');

drop policy if exists "ticket_att_insert" on storage.objects;
create policy "ticket_att_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-attachments');
