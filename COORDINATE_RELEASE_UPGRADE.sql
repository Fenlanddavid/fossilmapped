-- FossilMapped: decouple exact coordinate release from verification status.
-- Run this in the Supabase SQL Editor before deploying the matching app change.

ALTER TABLE public.shared_finds
  ADD COLUMN IF NOT EXISTS coordinates_released boolean NOT NULL DEFAULT false;

UPDATE public.shared_finds
SET coordinates_released = false
WHERE coordinates_released IS NULL;

ALTER TABLE public.shared_finds
  ALTER COLUMN coordinates_released SET DEFAULT false,
  ALTER COLUMN coordinates_released SET NOT NULL;

NOTIFY pgrst, 'reload schema';
