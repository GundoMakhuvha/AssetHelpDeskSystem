CREATE OR REPLACE FUNCTION public.admin_create_setup_token(_user_id uuid, _email text, _temp_password text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can create invite links';
  END IF;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.password_setup_tokens (token, user_id, email, temp_password)
  VALUES (_token, _user_id, lower(_email), _temp_password);
  RETURN _token;
END;
$function$;
