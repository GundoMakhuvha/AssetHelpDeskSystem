-- =====================================================================
-- 2026-10-22: New departments + multi-file ticket attachments
-- Safe to run more than once. Run in the Supabase SQL editor BEFORE
-- deploying the matching frontend. Works on both the Tipp Focus database
-- and the portable (SITA) baseline.
-- =====================================================================

-- ---------- 1. New departments ----------
alter type public.department_t add value if not exists 'Tipp Academy';
alter type public.department_t add value if not exists 'Resourcing';

-- ---------- 2. Attachments table ----------
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  comment_id uuid references public.ticket_comments(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ticket_attachments_ticket on public.ticket_attachments(ticket_id);
create index if not exists idx_ticket_attachments_comment on public.ticket_attachments(comment_id);

grant select, insert, delete on public.ticket_attachments to authenticated;
grant all on public.ticket_attachments to service_role;

-- Who may see a ticket (mirrors tickets_read).
create or replace function public.can_view_ticket(_ticket_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t
    where t.id = _ticket_id and (
      t.submitted_by = auth.uid()
      or public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'technician')
      or public.has_role(auth.uid(), 'helpdesk_agent')
      or public.is_manager_of(auth.uid(), t.submitted_by)));
$$;
grant execute on function public.can_view_ticket(uuid) to authenticated;

-- Who may see an attachment: anyone who can see the ticket, except that
-- files on internal notes are only visible to service desk staff.
create or replace function public.can_view_ticket_attachment(_ticket_id uuid, _comment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_ticket(_ticket_id) and (
    _comment_id is null
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'technician')
    or public.has_role(auth.uid(), 'helpdesk_agent')
    or exists (select 1 from public.ticket_comments c
               where c.id = _comment_id and c.is_internal = false));
$$;
grant execute on function public.can_view_ticket_attachment(uuid, uuid) to authenticated;

alter table public.ticket_attachments enable row level security;

drop policy if exists ticket_attachments_read on public.ticket_attachments;
create policy ticket_attachments_read on public.ticket_attachments for select to authenticated
  using (public.can_view_ticket_attachment(ticket_id, comment_id));

drop policy if exists ticket_attachments_insert on public.ticket_attachments;
create policy ticket_attachments_insert on public.ticket_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_view_ticket(ticket_id));

drop policy if exists ticket_attachments_delete on public.ticket_attachments;
create policy ticket_attachments_delete on public.ticket_attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- ---------- 3. Storage: let everyone on a ticket open its files ----------
-- Previously only the uploader, admins and technicians could read a file,
-- so a requester could not open a file an admin attached (and vice versa
-- for help desk agents / line managers).
drop policy if exists "ticket_att_read" on storage.objects;
drop policy if exists ticket_att_read on storage.objects;
create policy ticket_att_read on storage.objects for select to authenticated using (
  bucket_id = 'ticket-attachments' and (
    owner = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'technician')
    or public.has_role(auth.uid(), 'helpdesk_agent')
    or exists (select 1 from public.ticket_attachments a
               where a.storage_path = storage.objects.name
                 and public.can_view_ticket_attachment(a.ticket_id, a.comment_id))));

-- ---------- 4. Backfill existing single attachments ----------
-- Older tickets stored a (public) URL in tickets.attachment_url; record the
-- underlying file so it shows in the new attachment list.
insert into public.ticket_attachments (ticket_id, storage_path, file_name, uploaded_by, created_at)
select t.id,
       p.path,
       regexp_replace(regexp_replace(p.path, '^.*/', ''), '^[0-9]+-', ''),
       t.submitted_by,
       t.created_at
from public.tickets t
cross join lateral (
  select replace(split_part(regexp_replace(t.attachment_url, '^.*/ticket-attachments/', ''), '?', 1),
                 '%20', ' ') as path
) p
where t.attachment_url is not null and t.attachment_url <> '' and p.path <> ''
on conflict (storage_path) do nothing;
