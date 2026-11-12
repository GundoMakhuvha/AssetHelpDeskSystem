-- =====================================================================
-- 2026-11-12 (part 2): Save email replies without the service role key
-- Lovable Cloud does not expose the service role key, so the webhook
-- calls this function with the public key instead. The function only
-- works when it is given the same secret that Resend signs webhooks with.
--
-- BEFORE RUNNING: replace PASTE_YOUR_WHSEC_SECRET_HERE (bottom of file)
-- with the webhook's signing secret from Resend (starts with whsec_).
-- Safe to run more than once.
-- =====================================================================

-- ---------- 1. Where the shared secret is kept ----------
-- RLS on and no policies: nobody can read this table through the API.
create table if not exists public.inbound_email_config (
  id int primary key default 1 check (id = 1),
  secret text not null
);
alter table public.inbound_email_config enable row level security;
revoke all on public.inbound_email_config from anon, authenticated;

-- ---------- 2. The function the webhook calls ----------
create or replace function public.ingest_inbound_email(
  _secret text,
  _resend_email_id text,
  _from text,              -- full From header, e.g. "Name <a@b.com>"
  _sender text,            -- bare lower-case address
  _sender_name text,
  _to text[],
  _subject text,
  _body_text text,         -- full email text, kept for audit
  _reply text,             -- only the new part of the reply
  _token_ticket_id uuid,   -- from the ticket-<id>@ reply address (null if none)
  _internal boolean,
  _subject_ticket_number int, -- "#00065" in the subject (null if none)
  _ignore_reason text      -- set when the app decided to skip it (auto-reply etc.)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_profile public.profiles%rowtype;
  v_ticket public.tickets%rowtype;
  v_comment_id uuid;
  v_requester_email text;
  v_assignee_email text;
begin
  if _secret is null or _secret is distinct from (select secret from public.inbound_email_config where id = 1) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  insert into public.inbound_emails (resend_email_id, from_address, to_addresses, subject, body_text)
  values (_resend_email_id, _from, _to, _subject, left(_body_text, 50000))
  on conflict (resend_email_id) do nothing
  returning id into v_log_id;
  if v_log_id is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if _ignore_reason is not null then
    update public.inbound_emails set status = 'ignored', reason = _ignore_reason where id = v_log_id;
    return jsonb_build_object('status', 'ignored', 'reason', _ignore_reason);
  end if;

  select * into v_profile from public.profiles where lower(email) = lower(_sender) limit 1;

  -- Which ticket? The reply address first; the subject only for people with an account.
  if _token_ticket_id is not null then
    select * into v_ticket from public.tickets where id = _token_ticket_id;
  elsif v_profile.id is not null and _subject_ticket_number is not null then
    select * into v_ticket from public.tickets where ticket_number = _subject_ticket_number;
  end if;

  if v_ticket.id is null then
    update public.inbound_emails
       set status = 'unmatched',
           reason = case when _token_ticket_id is not null
                         then 'ticket in reply address no longer exists'
                         else 'no ticket reference found' end
     where id = v_log_id;
    return jsonb_build_object('status', 'unmatched');
  end if;

  insert into public.ticket_comments (ticket_id, author_id, body, is_internal, source, email_from)
  values (
    v_ticket.id,
    v_profile.id,
    coalesce(nullif(btrim(_reply), ''), '(empty email)'),
    coalesce(_internal, false),
    'email',
    case when v_profile.id is null
         then coalesce(nullif(_sender_name, '') || ' <' || _sender || '>', _sender)
    end
  )
  returning id into v_comment_id;

  update public.inbound_emails
     set status = 'linked', ticket_id = v_ticket.id, comment_id = v_comment_id
   where id = v_log_id;

  select email into v_requester_email from public.profiles where id = v_ticket.submitted_by;
  select email into v_assignee_email from public.profiles where id = v_ticket.assigned_to;

  return jsonb_build_object(
    'status', 'linked',
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'ticket_title', v_ticket.title,
    'comment_id', v_comment_id,
    'sender_name', coalesce(v_profile.full_name, nullif(_sender_name, ''), _sender),
    'requester_email', v_requester_email,
    'assignee_email', v_assignee_email
  );
end $$;

revoke all on function public.ingest_inbound_email(text, text, text, text, text, text[], text, text, text, uuid, boolean, int, text) from public;
grant execute on function public.ingest_inbound_email(text, text, text, text, text, text[], text, text, text, uuid, boolean, int, text) to anon, authenticated;

-- ---------- 3. Save the secret ----------
insert into public.inbound_email_config (id, secret)
values (1, 'PASTE_YOUR_WHSEC_SECRET_HERE')
on conflict (id) do update set secret = excluded.secret;
