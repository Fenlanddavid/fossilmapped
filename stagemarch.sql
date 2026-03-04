-- FossilMapped: COMPLETE FIX (Column + Constraint + Cleanup)
-- Run this in the Supabase SQL Editor

-- 1. Ensure the 'stage' column exists (just in case)
ALTER TABLE public.shared_finds ADD COLUMN IF NOT EXISTS stage text;

-- 2. Delete all duplicate records, keeping only the newest version of each find
WITH DeDupeCTE AS (
    SELECT id, 
           ROW_NUMBER() OVER (
               PARTITION BY fossilmap_id 
               ORDER BY shared_at DESC
           ) as row_num
    FROM public.shared_finds
)
DELETE FROM public.shared_finds
WHERE id IN (SELECT id FROM DeDupeCTE WHERE row_num > 1);

-- 3. Add the unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_fossilmap_id') THEN
        ALTER TABLE public.shared_finds ADD CONSTRAINT unique_fossilmap_id UNIQUE (fossilmap_id);
    END IF;
END $$;

-- 4. Reload the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
