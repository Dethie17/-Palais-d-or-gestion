-- ── O RESTO — Menus : prix UNIQUE du ticket par jour ──
-- La composition passe aux plats sans prix unitaires + 1 prix total par jour
-- (colonne weekly_menus.price). Sans cette migration, la synchro distante
-- ignore le prix (l'appli reste correcte en local).
--
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-menus-semaine.sql et supabase-menus-items.sql.
-- Idempotent : ré-exécutable sans erreur.

ALTER TABLE IF EXISTS weekly_menus
  ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0;
