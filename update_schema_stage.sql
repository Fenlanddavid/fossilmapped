-- FossilMapped: March 2026 Update
-- Run this in the Supabase SQL Editor to support the new Stage field

-- 1. Add the geological 'stage' column (e.g., Sinemurian, Toarcian)
ALTER TABLE public.shared_finds 
ADD COLUMN IF NOT EXISTS stage text;

-- 2. (Optional) Force PostgREST to refresh its schema cache
-- Usually happens automatically, but run if the field doesn't appear in the API
NOTIFY pgrst, 'reload schema';
