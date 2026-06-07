-- FossilMapped: Canonical PostgreSQL Schema for Supabase
-- Run this in the Supabase SQL Editor for a fresh install.
-- If upgrading an existing database, run RESEARCH_UPGRADE.sql instead.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create the Shared Finds Table
CREATE TABLE public.shared_finds (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    fossilmap_id      text NOT NULL,           -- Original ID from user's local DB
    hrid              text,                    -- Human Readable ID: FM-2026-0001
    collector_name    text NOT NULL,
    collector_email   text,                    -- Contact email for access requests
    taxon             text NOT NULL,
    element           text,
    period            text,
    stage             text,                    -- Stratigraphic stage (e.g. Toarcian)
    formation         text,
    member            text,
    bed               text,
    location_name     text,
    latitude          double precision NOT NULL,
    longitude         double precision NOT NULL,
    public_latitude   double precision,
    public_longitude  double precision,
    location_precision text NOT NULL DEFAULT 'exact',
    precision_locked  boolean NOT NULL DEFAULT true,
    date_collected    timestamp with time zone NOT NULL,
    photos            text[] DEFAULT '{}',     -- Array of Cloud Storage URLs
    measurements      jsonb DEFAULT '{}'::jsonb,
    weight_g          numeric,
    length_mm         numeric,
    width_mm          numeric,
    thickness_mm      numeric,
    notes             text,
    repository        text DEFAULT 'Private',  -- 'Private', 'Museum', 'University'
    accession_id      text,                    -- Museum accession number
    quality_score     integer NOT NULL DEFAULT 0, -- 0-100 data completeness score
    shared_at         timestamp with time zone NOT NULL DEFAULT now(),
    verification_status text NOT NULL DEFAULT 'community',
    is_deleted        boolean NOT NULL DEFAULT false,
    deleted_at        timestamp with time zone,
    CONSTRAINT shared_finds_fossilmap_id_key UNIQUE (fossilmap_id),
    CONSTRAINT shared_finds_latitude_range CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT shared_finds_longitude_range CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT shared_finds_location_precision_check CHECK (location_precision IN ('exact','100m','1km','locality')),
    CONSTRAINT shared_finds_quality_score_range CHECK (quality_score BETWEEN 0 AND 100),
    CONSTRAINT shared_finds_verification_status_check CHECK (verification_status IN ('community', 'verified', 'research_grade')),
    CONSTRAINT shared_finds_deleted_at_check CHECK (is_deleted = false OR deleted_at IS NOT NULL)
);

-- 2. Unique index for HRID (citation anchor)
CREATE UNIQUE INDEX IF NOT EXISTS shared_finds_hrid_idx ON public.shared_finds (hrid) WHERE hrid IS NOT NULL;

-- 3. Enable Row Level Security
ALTER TABLE public.shared_finds ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Anyone can read visible shared finds"
    ON public.shared_finds FOR SELECT USING (is_deleted = false);

CREATE POLICY "Anyone can share a find"
    ON public.shared_finds FOR INSERT WITH CHECK (is_deleted = false);

-- No public UPDATE policy is created. Admin writes must go through a trusted
-- server-side path such as Supabase Auth + RLS or an Edge Function using the
-- service-role key. The anon client can read visible rows and insert shares,
-- but it must not be able to promote, delete, or edit existing records.

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';
