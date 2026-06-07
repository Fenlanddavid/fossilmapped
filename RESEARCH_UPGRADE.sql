-- FossilMapped: Migration for existing databases
-- Run ONLY if upgrading from a schema created before July 2026.
-- For fresh installs, use schema.sql instead.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Add research identifier and repository fields
ALTER TABLE public.shared_finds
    ADD COLUMN IF NOT EXISTS hrid text,
    ADD COLUMN IF NOT EXISTS repository text DEFAULT 'Private',
    ADD COLUMN IF NOT EXISTS accession_id text,
    ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 0;

UPDATE public.shared_finds
SET quality_score = 0
WHERE quality_score IS NULL;

ALTER TABLE public.shared_finds
    ALTER COLUMN quality_score SET DEFAULT 0,
    ALTER COLUMN quality_score SET NOT NULL;

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

-- 5. Add lifecycle and verification columns used by the apps
ALTER TABLE public.shared_finds
    ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'community',
    ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shared_finds'
          AND column_name = 'is_verified'
    ) THEN
        EXECUTE $sql$
            UPDATE public.shared_finds
            SET verification_status = CASE
                WHEN verification_status IN ('community', 'verified', 'research_grade') THEN verification_status
                WHEN is_verified IS TRUE THEN 'verified'
                ELSE 'community'
            END
            WHERE verification_status IS NULL
               OR verification_status NOT IN ('community', 'verified', 'research_grade')
        $sql$;
    ELSE
        UPDATE public.shared_finds
        SET verification_status = 'community'
        WHERE verification_status IS NULL
           OR verification_status NOT IN ('community', 'verified', 'research_grade');
    END IF;
END $$;

ALTER TABLE public.shared_finds
    ALTER COLUMN verification_status SET DEFAULT 'community',
    ALTER COLUMN verification_status SET NOT NULL;

UPDATE public.shared_finds
SET is_deleted = false
WHERE is_deleted IS NULL;

ALTER TABLE public.shared_finds
    ALTER COLUMN is_deleted SET DEFAULT false,
    ALTER COLUMN is_deleted SET NOT NULL;

UPDATE public.shared_finds
SET deleted_at = now()
WHERE is_deleted = true AND deleted_at IS NULL;

-- 6. De-duplicate before adding unique indexes
WITH dedupe AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY fossilmap_id
               ORDER BY shared_at DESC NULLS LAST, id DESC
           ) AS row_num
    FROM public.shared_finds
    WHERE fossilmap_id IS NOT NULL
)
DELETE FROM public.shared_finds
WHERE id IN (SELECT id FROM dedupe WHERE row_num > 1);

-- 7. Unique indexes for app upserts and citation anchors
CREATE UNIQUE INDEX IF NOT EXISTS shared_finds_fossilmap_id_idx
    ON public.shared_finds (fossilmap_id);

CREATE UNIQUE INDEX IF NOT EXISTS shared_finds_hrid_idx
    ON public.shared_finds (hrid)
    WHERE hrid IS NOT NULL;

-- 8. Add data-quality constraints idempotently. NOT VALID avoids blocking the
-- migration on historic rows, while still enforcing new writes.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_finds_latitude_range') THEN
        ALTER TABLE public.shared_finds
            ADD CONSTRAINT shared_finds_latitude_range CHECK (latitude BETWEEN -90 AND 90) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_finds_longitude_range') THEN
        ALTER TABLE public.shared_finds
            ADD CONSTRAINT shared_finds_longitude_range CHECK (longitude BETWEEN -180 AND 180) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_finds_quality_score_range') THEN
        ALTER TABLE public.shared_finds
            ADD CONSTRAINT shared_finds_quality_score_range CHECK (quality_score BETWEEN 0 AND 100) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_finds_verification_status_check') THEN
        ALTER TABLE public.shared_finds
            ADD CONSTRAINT shared_finds_verification_status_check CHECK (verification_status IN ('community', 'verified', 'research_grade')) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_finds_deleted_at_check') THEN
        ALTER TABLE public.shared_finds
            ADD CONSTRAINT shared_finds_deleted_at_check CHECK (is_deleted = false OR deleted_at IS NOT NULL) NOT VALID;
    END IF;
END $$;

-- 9. Keep the read policy aligned with soft deletes when the old public read
-- policy exists. This does not replace the separate auth/RLS hardening work.
DROP POLICY IF EXISTS "Anyone can read shared finds" ON public.shared_finds;
DROP POLICY IF EXISTS "Anyone can read visible shared finds" ON public.shared_finds;
CREATE POLICY "Anyone can read visible shared finds"
    ON public.shared_finds FOR SELECT USING (is_deleted = false);

-- 10. Remove direct client UPDATE policies. Promotion/deletion/editing should
-- be performed only by a trusted server-side path such as Supabase Auth + RLS
-- or an Edge Function using the service-role key.
DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT pol.polname
        FROM pg_policy pol
        WHERE pol.polrelid = 'public.shared_finds'::regclass
          AND pol.polcmd IN ('w', '*')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.shared_finds', policy_name);
    END LOOP;
END $$;

-- 11. Reload schema cache
NOTIFY pgrst, 'reload schema';
