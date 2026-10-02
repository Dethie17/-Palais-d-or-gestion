-- ============================================================
-- O RESTO — Cycles scolaires (2 catégories tarifaires flyer 2026)
-- À exécuter dans le SQL Editor Supabase APRÈS supabase-tarifs-2026.sql.
-- Idempotent : ré-exécutable sans erreur.
-- - children.cycle : 'primaire' (Préscolaire & Élémentaire, F2 27 000)
--                    'lycee'    (Lycée 6ème→Terminale, F3 30 000)
-- - Les enfants existants sont classés depuis leur classe.
-- ============================================================

-- 1. Colonne cycle (nullable d'abord pour backfill, puis défaut)
ALTER TABLE children ADD COLUMN IF NOT EXISTS cycle TEXT;
CREATE INDEX IF NOT EXISTS idx_children_cycle ON children(cycle);

-- 2. Backfill depuis les libellés de classe
UPDATE children SET cycle = 'lycee'
WHERE cycle IS NULL AND (
  lower(class_name) LIKE '%6ème%' OR lower(class_name) LIKE '%6eme%'
  OR lower(class_name) LIKE '%5ème%' OR lower(class_name) LIKE '%5eme%'
  OR lower(class_name) LIKE '%4ème%' OR lower(class_name) LIKE '%4eme%'
  OR lower(class_name) LIKE '%3ème%' OR lower(class_name) LIKE '%3eme%'
  OR lower(class_name) LIKE '%seconde%' OR lower(class_name) LIKE '%premier%'
  OR lower(class_name) LIKE '%première%' OR lower(class_name) LIKE '%1ère%'
  OR lower(class_name) LIKE '%terminale%'
  OR lower(class_name) LIKE '%collège%' OR lower(class_name) LIKE '%college%'
  OR lower(class_name) LIKE '%lycée%' OR lower(class_name) LIKE '%lycee%'
);
UPDATE children SET cycle = 'primaire' WHERE cycle IS NULL;

-- 3. Contrainte + défaut pour les prochaines inscriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'children_cycle_check') THEN
    ALTER TABLE children ADD CONSTRAINT children_cycle_check
      CHECK (cycle IN ('primaire', 'lycee'));
  END IF;
END $$;
ALTER TABLE children ALTER COLUMN cycle SET DEFAULT 'primaire';
UPDATE children SET cycle = 'primaire' WHERE cycle IS NULL;
ALTER TABLE children ALTER COLUMN cycle SET NOT NULL;

-- 5. Suppression directe de l'ancienne « Midi Semaine 7 500 » (remplacée
--    par l'Hebdo officiel F1 à 9 500) : ses abonnements sont rattachés à F1,
--    repas restants, dates et historique conservés.
UPDATE subscriptions SET formula_id = 'F1'
WHERE formula_id IN (
  SELECT id FROM formulas
  WHERE id NOT IN ('F1', 'F2', 'F3', 'T1', 'C10')
    AND name ILIKE '%midi%semaine%'
);
DELETE FROM formulas
WHERE id NOT IN ('F1', 'F2', 'F3', 'T1', 'C10')
  AND name ILIKE '%midi%semaine%'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE formula_id = formulas.id)
  AND NOT EXISTS (SELECT 1 FROM oresto_payments WHERE formula_id = formulas.id);

-- 6. Tarifs flyer 2026 (si supabase-tarifs-2026.sql ancien déjà exécuté)
UPDATE formulas SET
  name = 'Abonnement Mensuel — Préscolaire & Élémentaire',
  price = 27000, old_price = 30000,
  duration_days = 30, meals_included = 20,
  rules = '1 repas / jour, service du midi uniquement',
  kind = 'subscription'
WHERE id = 'F2';

UPDATE formulas SET
  name = 'Abonnement Mensuel — Lycée',
  price = 32000, old_price = 35000,
  duration_days = 30, meals_included = 20,
  rules = '1 repas / jour, service du midi uniquement',
  kind = 'subscription'
WHERE id = 'F3';
