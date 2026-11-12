-- =====================================================================
-- 2026-11-12: Email replies land on the ticket (Resend inbound)
-- Safe to run more than once. Run in the Supabase SQL editor BEFORE
-- deploying the matching code. Works on both the Tipp Focus database and
-- the portable (SITA) baseline.
-- =====================================================================

-- ---------- 1. Comments can come from email ----------
-- A reply may come from someone without a help desk account, so the
-- author becomes optional and the sender's address is kept instead.
alter table public.ticket_comments alter column author_id drop not null;
alter table public.ticket_comments add column if not exists source text not null default 'app';
alter table public.ticket_comments add column if not exists email_from text;

do $$ begin
  alter table public.ticket_comments
    add constraint ticket_comments_source_chk check (source in ('app', 'email'));
exception when duplicate_object then null; end $$;

-- ---------- 2. Audit log of every email received ----------
-- Every inbound email is recorded, including ones that could not be
-- matched to a ticket, so nothing sent to the help desk is lost.
create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null unique,
  received_at timestamptz not null default now(),
  from_address text,
  to_addresses text[],
  subject text,
  body_text text,
  ticket_id uuid references public.tickets(id) on delete set null,
  comment_id uuid references public.ticket_comments(id) on delete set null,
  status text not null default 'processing'
    check (status in ('processing', 'linked', 'unmatched', 'ignored', 'error')),
  reason text
);
create index if not exists idx_inbound_emails_ticket on public.inbound_emails(ticket_id);
create index if not exists idx_inbound_emails_status on public.inbound_emails(status);

alter table public.inbound_emails enable row level security;
grant select on public.inbound_emails to authenticated;
grant all on public.inbound_emails to service_role;

drop policy if exists inbound_emails_staff_read on public.inbound_emails;
create policy inbound_emails_staff_read on public.inbound_emails for select to authenticated
  using (public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'technician')
      or public.has_role(auth.uid(), 'helpdesk_agent'));

-- ---------- 3. In-app notifications also fire for email replies ----------
-- author_id can now be null; "<>" against null is never true, so use
-- "is distinct from" so the requester / assignee still get notified.
create or replace function public.notify_ticket_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if t.submitted_by is not null and t.submitted_by is distinct from new.author_id and not new.is_internal then
    insert into public.notifications(user_id, title, body, link)
    values (t.submitted_by, 'New comment on ticket #' || t.ticket_number, left(new.body, 140),
            '/tickets?ticket=' || t.id);
  end if;
  if t.assigned_to is not null and t.assigned_to is distinct from new.author_id
     and t.assigned_to is distinct from t.submitted_by then
    insert into public.notifications(user_id, title, body, link)
    values (t.assigned_to, 'New comment on ticket #' || t.ticket_number, left(new.body, 140),
            '/tickets?ticket=' || t.id);
  end if;
  return new;
end $$;
