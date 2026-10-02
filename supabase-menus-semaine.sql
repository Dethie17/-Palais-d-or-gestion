-- ============================================================
-- O RESTO — Menu de la semaine (informatif, renseigné par le gérant)
-- À exécuter dans le SQL Editor Supabase APRÈS supabase-ism-wallet.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_menus (
  day TEXT PRIMARY KEY CHECK (day IN ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi')),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  -- Plats du jour composés par le DG : [{name, price}] — total calculé côté app.
  items JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menus VIERGES : rien ne s'affiche aux parents tant que le DG n'a pas
-- composé ET publié les 5 jours (règle : un jour n'existe que s'il a des plats).
INSERT INTO weekly_menus (day, name, description, items) VALUES
  ('Lundi', '', '', '[]'),
  ('Mardi', '', '', '[]'),
  ('Mercredi', '', '', '[]'),
  ('Jeudi', '', '', '[]'),
  ('Vendredi', '', '', '[]')
ON CONFLICT (day) DO NOTHING;

ALTER TABLE weekly_menus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_weekly_menus ON weekly_menus;
CREATE POLICY open_weekly_menus ON weekly_menus FOR ALL USING (true) WITH CHECK (true);
