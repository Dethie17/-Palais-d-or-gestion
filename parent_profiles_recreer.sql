-- URGENT : recréer parent_profiles
CREATE TABLE IF NOT EXISTS parent_profiles (
  parent_username TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_profiles TO anon, authenticated;
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_parent_profiles ON public.parent_profiles;
DROP POLICY IF EXISTS parent_profiles_access ON public.parent_profiles;
CREATE POLICY open_parent_profiles ON public.parent_profiles FOR ALL USING (true) WITH CHECK (true);
SELECT 'OK' AS etat;
