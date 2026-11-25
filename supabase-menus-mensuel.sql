-- ============================================================
-- O RESTO — Menus mensuels (dates réelles 2026-11-02 … 2026-11-30)
--
-- La cantine publie désormais un menu par DATE (ex. « 2026-11-25 ») et non
-- plus par jour de semaine. L'ancienne contrainte `weekly_menus_day_check`
-- n'acceptait que Lundi → Vendredi : toutes les publications mensuelles
-- étaient donc refusées en base, et les parents ne voyaient rien.
--
-- À exécuter UNE FOIS dans le Supabase SQL Editor (projet orestos).
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

-- 1. Autorise les dates ISO (et tout autre libellé de jour).
ALTER TABLE IF EXISTS public.weekly_menus
  DROP CONSTRAINT IF EXISTS weekly_menus_day_check;

-- 2. Prix unique du ticket par jour (si la base n'est pas encore migrée).
ALTER TABLE IF EXISTS public.weekly_menus
  ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0;

-- 3. Vérification : aucune contrainte CHECK ne doit rester sur la table.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.weekly_menus'::regclass
  AND contype = 'c';
