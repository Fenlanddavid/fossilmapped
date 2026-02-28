-- Run this in your Supabase SQL Editor
-- This ensures the DELETE and UPDATE permissions are correctly set

drop policy if exists "Anyone can remove a find" on public.shared_finds;
drop policy if exists "Anyone can delete a find" on public.shared_finds;
drop policy if exists "Anyone can update a find" on public.shared_finds;

create policy "Anyone can delete a find" 
on public.shared_finds for delete 
using (true);

create policy "Anyone can update a find" 
on public.shared_finds for update 
using (true)
with check (true);
