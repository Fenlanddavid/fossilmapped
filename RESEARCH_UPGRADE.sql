-- FossilMapped: Migration for existing databases
-- Run ONLY if upgrading from a schema created before July 2026.
-- For fresh installs, use schema.sql instead.

-- 1. Add research identifier and repository fields
ALTER TABLE public.shared_finds
    ADD COLUMN IF NOT EXISTS hrid text,
    ADD COLUMN IF NOT EXISTS repository text DEFAULT 'Private',
    ADD COLUMN IF NOT EXISTS accession_id text,
    ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 0;

-- 2. Add stratigraphic detail columns
ALTER TABLE public.shared_finds
    ADD COLUMN IF NOT EXISTS stage text,
    ADD COLUMN IF NOT EXISTS formation text,
    ADD COLUMN IF NOT EXISTS member text,
    ADD COLUMN IF NOT EXISTS bed text;

-- 3. Add measurement columns
ALTER TABLE public.shared_finds
    ADD COLUMN IF NOT EXISTS weight_g numeric,
    ADD COLUMN IF NOT EXISTS length_mm numeric,
    ADD COLUMN IF NOT EXISTS width_mm numeric,
    ADD COLUMN IF NOT EXISTS thickness_mm numeric;

-- 4. Add collector email if missing (added after initial setup.sql)
ALTER TABLE public.shared_finds
    ADD COLUMN IF NOT EXISTS collector_email text;

-- 5. Unique index for HRID
CREATE UNIQUE INDEX IF NOT EXISTS shared_finds_hrid_idx ON public.shared_finds (hrid);

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';
