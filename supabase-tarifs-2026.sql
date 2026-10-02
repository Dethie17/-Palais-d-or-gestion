-- ============================================================
-- O RESTO — Tarifs 2026 (nouveau catalogue + comptabilité)
-- À exécuter dans le SQL Editor Supabase APRÈS :
--   1) supabase-setup.sql
--   2) supabase-oresto-migration.sql
--   3) supabase-oresto-full.sql
--   4) supabase-ism-wallet.sql
-- Idempotent : ré-exécutable sans erreur.
-- IDs réutilisés (F1/F2/F3/T1) : l'historique abonnements/paiements est préservé.
-- ============================================================

-- 1. Prix barré commercial
ALTER TABLE formulas ADD COLUMN IF NOT EXISTS old_price NUMERIC;

-- 2. Nouveau catalogue (UPDATE = historique préservé)
UPDATE formulas SET
  name = 'Abonnement Hebdomadaire — Plat du jour',
  description = 'Plat du jour, 5 repas du lundi au vendredi',
  price = 9500, old_price = NULL,
  duration_days = 7, meals_included = 5,
  rules = '1 repas / jour, service du midi uniquement',
  kind = 'subscription'
WHERE id = 'F1';

UPDATE formulas SET
  name = 'Abonnement Mensuel — Préscolaire & Élémentaire',
  description = '1 repas le midi, jours d’école, pendant 30 jours',
  price = 27000, old_price = 30000,
  duration_days = 30, meals_included = 20,
  rules = '1 repas / jour, service du midi uniquement',
  kind = 'subscription'
WHERE id = 'F2';

UPDATE formulas SET
  name = 'Abonnement Mensuel — Lycée',
  description = '1 repas le midi, jours d’école, pendant 30 jours',
  price = 32000, old_price = 35000,
  duration_days = 30, meals_included = 20,
  rules = '1 repas / jour, service du midi uniquement',
  kind = 'subscription'
WHERE id = 'F3';

UPDATE formulas SET
  name = 'Ticket — 1 repas',
  description = '1 repas à consommer librement',
  price = 1900, old_price = NULL,
  duration_days = 7, meals_included = 1,
  rules = 'Ticket valable 7 jours, 1 repas',
  kind = 'ticket'
WHERE id = 'T1';

-- 3. Anciens tickets journaliers : suppression si non référencés,
--    sinon renommage (historique) — l'app ne les affiche plus (voir point 4).
DELETE FROM formulas WHERE id IN ('T2', 'T3', 'T4', 'T5')
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions WHERE formula_id IN ('T2', 'T3', 'T4', 'T5')
  )
  AND NOT EXISTS (
    SELECT 1 FROM oresto_payments WHERE formula_id IN ('T2', 'T3', 'T4', 'T5')
  );
UPDATE formulas SET name = '[Ancien] ' || name WHERE id IN ('T2', 'T3', 'T4', 'T5');

-- 3b. Carnet 10 repas (nouveau)
INSERT INTO formulas (id, name, description, price, old_price, duration_days, meals_included, rules, kind) VALUES
  ('C10', 'Carnet — 10 repas', '10 repas à consommer librement', 18000, NULL, 60, 10, 'Carnet valable 60 jours, 10 repas', 'ticket')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price,
  duration_days = EXCLUDED.duration_days, meals_included = EXCLUDED.meals_included,
  rules = EXCLUDED.rules, kind = EXCLUDED.kind;

-- 4. Comptabilité 2026 : 2000 FCFA / abonnement pour l'ISM (lycée comme
--    préscolaire-élémentaire), 5% des ventes pour l'ISM,
--    2000 FCFA / abonnement pour l'école, 0,5% TouchPoint, 1,5% PayDounya.
INSERT INTO finance_settings (key, value) VALUES
  ('ism_subscription_pct', '10'),
  ('ism_per_subscription', '2000'),
  ('ism_sales_pct', '5'),
  ('school_per_subscription', '2000'),
  ('other_sales_pct', '5'),
  ('touchpoint_pct', '0.5'),
  ('paydounya_pct', '1.5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
DELETE FROM finance_settings WHERE key = 'ism_sales_pct';
