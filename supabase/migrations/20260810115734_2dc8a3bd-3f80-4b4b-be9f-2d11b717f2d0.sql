ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS registration_date timestamptz;

UPDATE public.assets SET registration_date = COALESCE(registration_date, created_at, now());

ALTER TABLE public.assets
  ALTER COLUMN registration_date SET DEFAULT now(),
  ALTER COLUMN registration_date SET NOT NULL;