-- FossilMapped location precision privacy upgrade.
-- Run this in the Supabase SQL Editor before deploying the app changes.

ALTER TABLE public.shared_finds
  ADD COLUMN IF NOT EXISTS location_precision text NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS public_latitude double precision,
  ADD COLUMN IF NOT EXISTS public_longitude double precision,
  ADD COLUMN IF NOT EXISTS precision_locked boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shared_finds_location_precision_check'
      AND conrelid = 'public.shared_finds'::regclass
  ) THEN
    ALTER TABLE public.shared_finds
      ADD CONSTRAINT shared_finds_location_precision_check
      CHECK (location_precision IN ('exact','100m','1km','locality')) NOT VALID;
  END IF;
END $$;

UPDATE public.shared_finds
SET location_precision = 'exact'
WHERE location_precision IS NULL
   OR location_precision NOT IN ('exact','100m','1km','locality');

UPDATE public.shared_finds
SET precision_locked = true
WHERE precision_locked IS NULL;

UPDATE public.shared_finds
SET public_latitude = latitude,
    public_longitude = longitude,
    location_precision = 'exact',
    precision_locked = false
WHERE public_latitude IS NULL
   OR public_longitude IS NULL;

ALTER TABLE public.shared_finds
  ALTER COLUMN location_precision SET DEFAULT 'exact',
  ALTER COLUMN location_precision SET NOT NULL,
  ALTER COLUMN precision_locked SET DEFAULT true,
  ALTER COLUMN precision_locked SET NOT NULL;

ALTER TABLE public.shared_finds
  VALIDATE CONSTRAINT shared_finds_location_precision_check;

NOTIFY pgrst, 'reload schema';
