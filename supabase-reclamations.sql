-- ============================================================
-- O RESTO — Réclamations & canal de discussion
-- ⚠ À exécuter dans le SQL Editor Supabase APRÈS supabase-setup.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS reclamations (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  client_username TEXT NOT NULL,
  child_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('meal_quality', 'service', 'payment', 'hygiene', 'card', 'other')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
  is_announcement BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reclamations_status ON reclamations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reclamations_client ON reclamations(client_username, created_at DESC);

CREATE TABLE IF NOT EXISTS reclamation_messages (
  id TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES reclamations(id) ON DELETE CASCADE,
  author_username TEXT NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('client', 'staff')),
  body TEXT NOT NULL,
  photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reclamation_messages_complaint
  ON reclamation_messages(complaint_id, created_at ASC);

ALTER TABLE reclamations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_reclamations ON reclamations;
CREATE POLICY open_reclamations ON reclamations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE reclamation_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_reclamation_messages ON reclamation_messages;
CREATE POLICY open_reclamation_messages ON reclamation_messages FOR ALL USING (true) WITH CHECK (true);

-- ---------- Pièces jointes (bucket privé : accès uniquement via URL signée) ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('reclamation-photos', 'reclamation-photos', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS upload_reclamation_photos ON storage.objects;
CREATE POLICY upload_reclamation_photos ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'reclamation-photos');

DROP POLICY IF EXISTS read_reclamation_photos ON storage.objects;
CREATE POLICY read_reclamation_photos ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'reclamation-photos');