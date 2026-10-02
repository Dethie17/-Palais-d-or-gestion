-- ============================================================
-- O RESTO — Full Supabase (phase production)
-- À exécuter dans le SQL Editor Supabase APRÈS :
--   1) supabase-setup.sql
--   2) supabase-oresto-migration.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

-- 1. Formules : distinguer abonnement vs ticket (perdu sinon)
ALTER TABLE formulas ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'subscription';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'formulas_kind_check'
  ) THEN
    ALTER TABLE formulas ADD CONSTRAINT formulas_kind_check
      CHECK (kind IN ('subscription', 'ticket'));
  END IF;
END $$;
UPDATE formulas SET kind = 'ticket' WHERE id LIKE 'T%' AND (kind IS NULL OR kind = 'subscription');
UPDATE formulas SET kind = 'subscription' WHERE kind IS NULL;

-- 2. Paiements : intention ticket persistée (remplace le localStorage
--    o-resto-ticket-intents, perdu en multi-appareils).
--    Pour un ticket Wave en attente : subscription_id NULL + client_username/formula_id renseignés.
ALTER TABLE oresto_payments ADD COLUMN IF NOT EXISTS client_username TEXT;
ALTER TABLE oresto_payments ADD COLUMN IF NOT EXISTS formula_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oresto_payments_formula_fk'
  ) THEN
    ALTER TABLE oresto_payments ADD CONSTRAINT oresto_payments_formula_fk
      FOREIGN KEY (formula_id) REFERENCES formulas(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_payments_client ON oresto_payments(client_username);
CREATE INDEX IF NOT EXISTS idx_payments_status ON oresto_payments(status);

-- 3. RLS : mêmes politiques ouvertes que la migration (MVP multi-appareils).
--    Durcissement ultérieur recommandé (Supabase Auth + hash mdp).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['formulas', 'oresto_payments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'open_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)', 'open_' || t, t);
  END LOOP;
END $$;

-- 4. Backfill kind pour les formules créées depuis l'app sans kind
UPDATE formulas SET kind = 'subscription' WHERE kind IS NULL;
