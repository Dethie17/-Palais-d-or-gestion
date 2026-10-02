-- ── O RESTO — Menus du jour composés par le DG ────────────────────
-- Ajoute la colonne items (plats + prix) à weekly_menus.
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-menus-semaine.sql. Idempotent : ré-exécutable sans erreur.
-- BASE NEUVE : supabase-menus-semaine.sql inclut déjà la colonne, rien à faire.

ALTER TABLE IF EXISTS weekly_menus
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';
