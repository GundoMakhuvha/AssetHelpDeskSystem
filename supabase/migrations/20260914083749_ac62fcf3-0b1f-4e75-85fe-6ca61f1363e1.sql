CREATE OR REPLACE FUNCTION public.ticket_email_payload(_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ticket', to_jsonb(t) - 'attachment_url',
    'requestor_email', (SELECT p.email FROM public.profiles p WHERE p.id = t.submitted_by),
    'requestor_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = t.submitted_by),
    'assignee_email', (SELECT p.email FROM public.profiles p WHERE p.id = t.assigned_to),
    'assignee_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = t.assigned_to),
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
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = auth.uid()
          AND ur2.role IN ('admin','technician','helpdesk_agent')
      )
    );
$function$;
