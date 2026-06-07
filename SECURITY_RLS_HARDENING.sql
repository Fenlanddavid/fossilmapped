-- FossilMapped: remove direct client UPDATE access on shared_finds.
-- Run this in Supabase SQL Editor for existing deployments.
--
-- After this migration, the anon client can still read visible records and
-- insert newly shared finds under the existing policies, but it cannot promote,
-- delete, or edit existing rows directly. Admin writes need a trusted
-- server-side path such as Supabase Auth + RLS or an Edge Function using the
-- service-role key.

ALTER TABLE public.shared_finds ENABLE ROW LEVEL SECURITY;

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

NOTIFY pgrst, 'reload schema';
