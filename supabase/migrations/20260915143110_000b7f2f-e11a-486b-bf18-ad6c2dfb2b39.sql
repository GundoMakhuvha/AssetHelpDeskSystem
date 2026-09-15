
CREATE TABLE IF NOT EXISTS public.password_setup_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL,
  temp_password text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.password_setup_tokens TO service_role;
ALTER TABLE public.password_setup_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_create_setup_token(_user_id uuid, _email text, _temp_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can create invite links';
  END IF;
  _token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.password_setup_tokens (token, user_id, email, temp_password)
  VALUES (_token, _user_id, lower(_email), _temp_password);
  RETURN _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_setup_token(_token text)
RETURNS TABLE (email text, temp_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.password_setup_tokens t
     SET used_at = now()
   WHERE t.token = _token
     AND t.used_at IS NULL
     AND t.expires_at > now()
  RETURNING t.email, t.temp_password;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_setup_token(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_setup_token(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_setup_token(text) TO anon, authenticated, service_role;
