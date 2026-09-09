-- Fix function search_path (set_updated_at, handle_new_user already set; ensure set_updated_at)
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- Revoke execute on security definer helpers from public/anon/authenticated
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.current_role() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Make ticket-attachments bucket private and scope listing to authenticated only via owner-style policy
update storage.buckets set public = false where id = 'ticket-attachments';

drop policy if exists "ticket_att_read" on storage.objects;
create policy "ticket_att_read" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-attachments' and (owner = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'technician')));