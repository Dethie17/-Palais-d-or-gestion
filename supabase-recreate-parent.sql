-- CONSTAT : parent_profiles n'existe pas (404) meme avec service_role.
-- On la recrée avec droits + RLS. SANS DELETE du personnel.
-- À coller tel quel dans SQL Editor.
CREATE TABLE IF NOT EXISTS parent_profiles (
  parent_username TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_profiles TO authenticated;
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_profiles_access ON public.parent_profiles;
DROP POLICY IF EXISTS open_parent_profiles ON public.parent_profiles;
CREATE POLICY open_parent_profiles ON public.parent_profiles FOR ALL USING (true) WITH CHECK (true);
DELETE FROM public.users WHERE role = 'client';
DELETE FROM auth.users WHERE email LIKE '%@oresto-sn.com' AND email NOT IN ('admin@oresto-sn.com','caissier@oresto-sn.com','gestionnaire@oresto-sn.com','manager@oresto-sn.com','personnel@oresto-sn.com');
SELECT 'parent_profiles' AS table, count(*) AS restant FROM public.parent_profiles;
SELECT grantee, string_agg(privilege_type, ', ') AS droits FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='parent_profiles' AND grantee IN ('anon','authenticated') GROUP BY grantee;
SELECT policyname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relname='parent_profiles';
