-- 1) Line manager on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_manager_of(_manager uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user AND p.manager_id = _manager AND _manager IS NOT NULL);
$$;

-- tickets: managers can read and comment on their team's tickets
DROP POLICY IF EXISTS tickets_read ON public.tickets;
CREATE POLICY tickets_read ON public.tickets FOR SELECT
USING (
  submitted_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'technician'::app_role)
  OR has_role(auth.uid(), 'helpdesk_agent'::app_role)
  OR public.is_manager_of(auth.uid(), submitted_by)
);

DROP POLICY IF EXISTS comments_read ON public.ticket_comments;
CREATE POLICY comments_read ON public.ticket_comments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tickets t
  WHERE t.id = ticket_comments.ticket_id
    AND (
      t.submitted_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'technician'::app_role)
      OR has_role(auth.uid(), 'helpdesk_agent'::app_role)
      OR (public.is_manager_of(auth.uid(), t.submitted_by) AND ticket_comments.is_internal = false)
    )
));

-- 2) SLA targets per category + priority
CREATE TABLE IF NOT EXISTS public.sla_category_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  priority ticket_priority_t NOT NULL,
  response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  business_hours_only boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (category, priority)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_category_policies TO authenticated;
GRANT ALL ON public.sla_category_policies TO service_role;
ALTER TABLE public.sla_category_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS slacat_read ON public.sla_category_policies;
CREATE POLICY slacat_read ON public.sla_category_policies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS slacat_admin ON public.sla_category_policies;
CREATE POLICY slacat_admin ON public.sla_category_policies FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_slacat_updated ON public.sla_category_policies;
CREATE TRIGGER trg_slacat_updated BEFORE UPDATE ON public.sla_category_policies
FOR EACH ROW EXECUTE FUNCTION public.set_sla_updated();

INSERT INTO public.sla_category_policies (category, priority, response_minutes, resolution_minutes, business_hours_only)
SELECT c.name, s.priority, s.response_minutes, s.resolution_minutes, s.business_hours_only
FROM public.ticket_categories c CROSS JOIN public.sla_policies s
ON CONFLICT (category, priority) DO NOTHING;

-- 3) SLA warning alert log (one alert per ticket per kind)
CREATE TABLE IF NOT EXISTS public.ticket_sla_alerts (
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, kind)
);
GRANT SELECT, INSERT ON public.ticket_sla_alerts TO authenticated;
GRANT ALL ON public.ticket_sla_alerts TO service_role;
ALTER TABLE public.ticket_sla_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS slaalert_read ON public.ticket_sla_alerts;
CREATE POLICY slaalert_read ON public.ticket_sla_alerts FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role));
DROP POLICY IF EXISTS slaalert_insert ON public.ticket_sla_alerts;
CREATE POLICY slaalert_insert ON public.ticket_sla_alerts FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technician'::app_role));

-- 4) Admin user list includes manager
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, full_name text, department text, role app_role,
              manager_id uuid, manager_name text,
              last_sign_in_at timestamptz, user_created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT p.id, p.email, p.full_name, p.department,
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id
       ORDER BY CASE ur.role WHEN 'admin' THEN 1 WHEN 'technician' THEN 2 ELSE 3 END LIMIT 1) AS role,
    p.manager_id,
    (SELECT m.full_name FROM public.profiles m WHERE m.id = p.manager_id) AS manager_name,
    u.last_sign_in_at, u.created_at AS user_created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.full_name NULLS LAST;
$function$;

-- 5) Ticket email payload includes line manager + admin emails
CREATE OR REPLACE FUNCTION public.ticket_email_payload(_ticket_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object(
    'ticket', to_jsonb(t) - 'attachment_url',
    'requestor_email', (SELECT p.email FROM public.profiles p WHERE p.id = t.submitted_by),
    'requestor_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = t.submitted_by),
    'assignee_email', (SELECT p.email FROM public.profiles p WHERE p.id = t.assigned_to),
    'assignee_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = t.assigned_to),
    'manager_email', (SELECT m.email FROM public.profiles m
                      WHERE m.id = (SELECT p.manager_id FROM public.profiles p WHERE p.id = t.submitted_by)),
    'manager_name', (SELECT m.full_name FROM public.profiles m
                      WHERE m.id = (SELECT p.manager_id FROM public.profiles p WHERE p.id = t.submitted_by)),
    'admin_emails', COALESCE((
      SELECT jsonb_agg(DISTINCT p.email) FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'admin' AND p.email IS NOT NULL), '[]'::jsonb),
    'staff_emails', COALESCE((
      SELECT jsonb_agg(DISTINCT p.email)
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role IN ('admin','technician','helpdesk_agent') AND p.email IS NOT NULL
    ), '[]'::jsonb)
  )
  FROM public.tickets t
  WHERE t.id = _ticket_id
    AND (
      t.submitted_by = auth.uid()
      OR t.assigned_to = auth.uid()
      OR public.is_manager_of(auth.uid(), t.submitted_by)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = auth.uid()
          AND ur2.role IN ('admin','technician','helpdesk_agent')
      )
    );
$function$;
