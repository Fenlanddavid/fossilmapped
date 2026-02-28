-- FossilMapped: Run this in the Supabase SQL Editor to update your live database

-- 1. Add the missing collector_email column
ALTER TABLE public.shared_finds 
ADD COLUMN IF NOT EXISTS collector_email text;

-- 2. Ensure 'period' column exists (it was missing in some older versions)
ALTER TABLE public.shared_finds 
ADD COLUMN IF NOT EXISTS period text;

-- 3. (Optional) Refresh PostgREST cache by reloading schema
-- This usually happens automatically, but you can force it by running:
-- NOTIFY pgrst, 'reload schema';
