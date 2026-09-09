
-- ASSETS: restrict read to roles that should see assets
DROP POLICY IF EXISTS assets_read ON public.assets;
CREATE POLICY assets_read ON public.assets FOR SELECT
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'asset_manager')
  OR public.has_role(auth.uid(),'asset_viewer')
  OR public.has_role(auth.uid(),'viewer')
);

DROP POLICY IF EXISTS assets_write_techadmin ON public.assets;
CREATE POLICY assets_write ON public.assets FOR ALL
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'asset_manager')
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'asset_manager')
);

-- VERIFICATIONS
DROP POLICY IF EXISTS ver_read ON public.verifications;
CREATE POLICY ver_read ON public.verifications FOR SELECT
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'asset_manager')
  OR public.has_role(auth.uid(),'asset_viewer')
  OR public.has_role(auth.uid(),'viewer')
);

DROP POLICY IF EXISTS ver_insert ON public.verifications;
CREATE POLICY ver_insert ON public.verifications FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'asset_manager')
);

-- TICKETS
DROP POLICY IF EXISTS tickets_read ON public.tickets;
CREATE POLICY tickets_read ON public.tickets FOR SELECT
USING (
  submitted_by = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'helpdesk_agent')
);

DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets FOR UPDATE
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'helpdesk_agent')
  OR submitted_by = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'technician')
  OR public.has_role(auth.uid(),'helpdesk_agent')
  OR submitted_by = auth.uid()
);

-- COMMENTS read: include helpdesk_agent
DROP POLICY IF EXISTS comments_read ON public.ticket_comments;
CREATE POLICY comments_read ON public.ticket_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_comments.ticket_id
      AND (
        t.submitted_by = auth.uid()
        OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'technician')
        OR public.has_role(auth.uid(),'helpdesk_agent')
      )
  )
);
