
-- Add new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'asset_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'asset_viewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'helpdesk_agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'requestor';
