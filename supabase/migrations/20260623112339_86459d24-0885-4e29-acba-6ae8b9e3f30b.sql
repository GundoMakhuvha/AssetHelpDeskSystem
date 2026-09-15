
-- 1. Ticket auto-number
CREATE SEQUENCE IF NOT EXISTS public.tickets_number_seq;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_number bigint;
UPDATE public.tickets SET ticket_number = nextval('public.tickets_number_seq') WHERE ticket_number IS NULL;
ALTER TABLE public.tickets ALTER COLUMN ticket_number SET DEFAULT nextval('public.tickets_number_seq');
ALTER TABLE public.tickets ALTER COLUMN ticket_number SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_number_unique') THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_number_unique UNIQUE (ticket_number);
  END IF;
END $$;

-- 2. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_delete_own" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);

-- 3. Admin user list (with last_sign_in_at from auth.users)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid, email text, full_name text, department text,
  role public.app_role, last_sign_in_at timestamptz, user_created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name, p.department,
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id
       ORDER BY CASE ur.role WHEN 'admin' THEN 1 WHEN 'technician' THEN 2 ELSE 3 END LIMIT 1) AS role,
    u.last_sign_in_at, u.created_at AS user_created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.full_name NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- 4. Admin set role
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) TO authenticated;

-- 5. Ticket notification trigger: notify on assignment + status change + new comment
CREATE OR REPLACE FUNCTION public.notify_ticket_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.submitted_by THEN
      INSERT INTO public.notifications(user_id, title, body, link)
      VALUES (NEW.assigned_to, 'New ticket assigned: #' || NEW.ticket_number,
              NEW.title, '/tickets');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, title, body, link)
      VALUES (NEW.assigned_to, 'Ticket assigned to you: #' || NEW.ticket_number, NEW.title, '/tickets');
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.notifications(user_id, title, body, link)
      VALUES (NEW.submitted_by, 'Ticket #' || NEW.ticket_number || ' status: ' || NEW.status,
              NEW.title, '/tickets');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tickets_notify ON public.tickets;
CREATE TRIGGER tickets_notify AFTER INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_change();

CREATE OR REPLACE FUNCTION public.notify_ticket_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  IF t.submitted_by IS NOT NULL AND t.submitted_by <> NEW.author_id AND NOT NEW.is_internal THEN
    INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (t.submitted_by, 'New comment on ticket #' || t.ticket_number, left(NEW.body, 140), '/tickets');
  END IF;
  IF t.assigned_to IS NOT NULL AND t.assigned_to <> NEW.author_id AND t.assigned_to <> t.submitted_by THEN
    INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (t.assigned_to, 'New comment on ticket #' || t.ticket_number, left(NEW.body, 140), '/tickets');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ticket_comments_notify ON public.ticket_comments;
CREATE TRIGGER ticket_comments_notify AFTER INSERT ON public.ticket_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_comment();
