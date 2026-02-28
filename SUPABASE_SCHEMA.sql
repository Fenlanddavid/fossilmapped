-- FossilMapped: PostgreSQL Schema for Supabase
-- Run this in the Supabase SQL Editor

-- 1. Create the Shared Finds Table
create table public.shared_finds (
    id uuid primary key default uuid_generate_v4(),
    fossilmap_id text not null, -- Original ID from user's local DB
    collector_name text not null,
    taxon text not null,
    element text,
    period text,
    location_name text,
    latitude double precision not null,
    longitude double precision not null,
    date_collected timestamp with time zone not null,
    photos text[] default '{}', -- Array of Cloud Storage URLs or Base64 (prefer URLs)
    measurements jsonb default '{}'::jsonb, -- {length, width, thickness, weight}
    notes text,
    shared_at timestamp with time zone default now(),
    is_verified boolean default false -- For researcher review
);

-- 2. Set up Storage Bucket for Photos (Optional but recommended)
-- insert into storage.buckets (id, name, public) values ('find-photos', 'find-photos', true);

-- 3. Enable Row Level Security (RLS)
alter table public.shared_finds enable row level security;

-- 4. Create Policies
-- Allow anyone to read public finds (Research Access)
create policy "Anyone can read shared finds" 
on public.shared_finds for select 
using (true);

-- Allow anyone to insert (simplified for now, ideally use Auth)
create policy "Anyone can share a find" 
on public.shared_finds for insert 
with check (true);
