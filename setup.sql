create table public.shared_finds (
id uuid primary key default uuid_generate_v4(),
fossilmap_id text not null,
collector_name text not null,
taxon text not null,
element text,
period text,
location_name text,
latitude double precision not null,
longitude double precision not null,
date_collected timestamp with time zone not null,
photos text[] default '{}',
measurements jsonb default '{}'::jsonb,
notes text,
shared_at timestamp with time zone default now(),
is_verified boolean default false
);

alter table public.shared_finds enable row level security;

create policy "Anyone can read shared finds" 
on public.shared_finds for select 
using (true);

create policy "Anyone can share a find" 
on public.shared_finds for insert 
with check (true);
