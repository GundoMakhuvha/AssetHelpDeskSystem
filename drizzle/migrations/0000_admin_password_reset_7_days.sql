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