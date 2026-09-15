-- 1. Ticket categories (move tickets.category off the enum so categories are editable)
ALTER TABLE public.tickets ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.tickets ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE public.tickets ALTER COLUMN category SET DEFAULT 'Other';

CREATE TABLE public.ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  default_priority ticket_priority_t NOT NULL DEFAULT 'Medium',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ticket_categories TO authenticated;
GRANT ALL ON public.ticket_categories TO service_role;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY cat_read ON public.ticket_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY cat_admin ON public.ticket_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.ticket_categories TO authenticated;

INSERT INTO public.ticket_categories (name, description, default_priority, sort_order) VALUES
  ('Hardware','Laptops, desktops, printers and peripherals','Medium',1),
  ('Software','Applications, licences and installations','Medium',2),
  ('Network','Connectivity, Wi-Fi, VPN and internet','High',3),
  ('Access','Accounts, passwords and permissions','High',4),
  ('Other','Anything that does not fit another category','Low',5);

CREATE TRIGGER trg_cat_updated BEFORE UPDATE ON public.ticket_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Help desk settings (singleton)
CREATE TABLE public.helpdesk_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  organisation_name text NOT NULL DEFAULT 'Tipp Focus',
  support_email text,
  default_assignee uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  auto_close_days integer NOT NULL DEFAULT 5,
  business_start time NOT NULL DEFAULT '08:00',
  business_end time NOT NULL DEFAULT '17:00',
  working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  allow_attachments boolean NOT NULL DEFAULT true,
  require_category boolean NOT NULL DEFAULT true,
  notify_requestor boolean NOT NULL DEFAULT true,
  notify_agents boolean NOT NULL DEFAULT true,
  agent_notify_emails text,
  ticket_footer text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.helpdesk_settings TO authenticated;
GRANT INSERT, UPDATE ON public.helpdesk_settings TO authenticated;
GRANT ALL ON public.helpdesk_settings TO service_role;
ALTER TABLE public.helpdesk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY hds_read ON public.helpdesk_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY hds_admin ON public.helpdesk_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.helpdesk_settings (id) VALUES (true);
CREATE TRIGGER trg_hds_updated BEFORE UPDATE ON public.helpdesk_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Holidays
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holiday_date date NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY hol_read ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY hol_admin ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.holidays (name, holiday_date) VALUES
  ('New Year''s Day','2026-01-01'),
  ('Human Rights Day','2026-03-21'),
  ('Freedom Day','2026-04-27'),
  ('Workers'' Day','2026-05-01'),
  ('Youth Day','2026-06-16'),
  ('National Women''s Day','2026-08-09'),
  ('Heritage Day','2026-09-24'),
  ('Day of Reconciliation','2026-12-16'),
  ('Christmas Day','2026-12-25'),
  ('Day of Goodwill','2026-12-26')
ON CONFLICT (holiday_date) DO NOTHING;

-- 4. Announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','critical')),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ann_read ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY ann_admin ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ann_updated BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Activity / audit log
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_idx ON public.activity_log (created_at DESC);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY act_read ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'));

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id text;
  diff jsonb;
  email text;
BEGIN
  IF TG_TABLE_NAME = 'assets' THEN
    rec_id := COALESCE(NEW.asset_id, OLD.asset_id);
  ELSE
    rec_id := COALESCE(NEW.id, OLD.id)::text;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      INTO diff
      FROM jsonb_each(to_jsonb(NEW)) n
      JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value;
    IF diff IS NULL THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    diff := to_jsonb(NEW);
  ELSE
    diff := to_jsonb(OLD);
  END IF;

  SELECT p.email INTO email FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.activity_log (table_name, record_id, action, actor_id, actor_email, changes)
  VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), email, diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_tickets AFTER INSERT OR UPDATE OR DELETE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_log_assets AFTER INSERT OR UPDATE OR DELETE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();