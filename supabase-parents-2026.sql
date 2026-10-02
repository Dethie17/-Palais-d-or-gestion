-- ============================================================
-- O RESTO — Fiches parents (identité + contact)
-- À exécuter dans le SQL Editor Supabase (ordre indifférent).
-- Idempotent : ré-exécutable sans erreur.
-- Chaque parent renseigne nom, prénom et téléphone avant
-- d'inscrire ses enfants (QR généré automatiquement).
-- ============================================================

CREATE TABLE IF NOT EXISTS parent_profiles (
  parent_username TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'open_parent_profiles' AND tablename = 'parent_profiles'
  ) THEN
    CREATE POLICY open_parent_profiles ON parent_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
