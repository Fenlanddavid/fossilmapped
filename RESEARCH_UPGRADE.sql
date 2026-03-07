-- FossilMapped: Research Grade Upgrade
-- Adds permanent identifiers, repository tracking, and data quality scoring

-- 1. Add unique research identifiers and repository fields
ALTER TABLE public.shared_finds 
ADD COLUMN IF NOT EXISTS hrid text,                      -- Human Readable ID: FM-2026-0001
ADD COLUMN IF NOT EXISTS repository text DEFAULT 'Private', -- 'Private', 'Museum', 'University'
ADD COLUMN IF NOT EXISTS accession_id text,             -- Museum accession number
ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 0; -- 0-100 data completeness score

-- 2. Add specific stratigraphic and measurement detail columns if missing
ALTER TABLE public.shared_finds 
ADD COLUMN IF NOT EXISTS formation text,
ADD COLUMN IF NOT EXISTS member text,
ADD COLUMN IF NOT EXISTS bed text,
ADD COLUMN IF NOT EXISTS weight_g numeric,
ADD COLUMN IF NOT EXISTS length_mm numeric,
ADD COLUMN IF NOT EXISTS width_mm numeric,
ADD COLUMN IF NOT EXISTS thickness_mm numeric;

-- 3. Create a unique index for the HRID (The Citation Anchor)
CREATE UNIQUE INDEX IF NOT EXISTS shared_finds_hrid_idx ON public.shared_finds (hrid);

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
