
CREATE TABLE IF NOT EXISTS public.sla_policies (
  priority public.ticket_priority_t PRIMARY KEY,
  response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  business_hours_only boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.sla_policies TO authenticated;
GRANT ALL ON public.sla_policies TO service_role;

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_read" ON public.sla_policies;
CREATE POLICY "sla_read" ON public.sla_policies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sla_admin_write" ON public.sla_policies;
CREATE POLICY "sla_admin_write" ON public.sla_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

GRANT INSERT, UPDATE, DELETE ON public.sla_policies TO authenticated;

INSERT INTO public.sla_policies (priority, response_minutes, resolution_minutes, business_hours_only) VALUES
  ('Low',      480,  10080, true),
  ('Medium',   240,  2880,  true),
  ('High',     60,   480,   false),
  ('Critical', 15,   240,   false)
ON CONFLICT (priority) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_sla_updated()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sla_updated ON public.sla_policies;
CREATE TRIGGER trg_sla_updated BEFORE UPDATE ON public.sla_policies
FOR EACH ROW EXECUTE FUNCTION public.set_sla_updated();
