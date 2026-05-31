-- FossilMapped: Canonical PostgreSQL Schema for Supabase
-- Run this in the Supabase SQL Editor for a fresh install.
-- If upgrading an existing database, run RESEARCH_UPGRADE.sql instead.

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
    quality_score     integer DEFAULT 0,       -- 0–100 data completeness score
    shared_at         timestamp with time zone DEFAULT now(),
    is_verified       boolean DEFAULT false
);

-- 2. Unique index for HRID (citation anchor)
CREATE UNIQUE INDEX IF NOT EXISTS shared_finds_hrid_idx ON public.shared_finds (hrid);

-- 3. Enable Row Level Security
ALTER TABLE public.shared_finds ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Anyone can read shared finds"
    ON public.shared_finds FOR SELECT USING (true);

CREATE POLICY "Anyone can share a find"
    ON public.shared_finds FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can remove a find"
    ON public.shared_finds FOR DELETE USING (true);

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';
