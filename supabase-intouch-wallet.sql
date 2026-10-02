-- ── O RESTO — InTouch : autoriser 'intouch'/'balance' dans wallet_transactions ──
-- Contexte : les recharges carte via InTouch insèrent dans wallet_transactions
-- avec method = 'intouch'. Sans cette migration, PostgREST répond 400
-- (violation du CHECK hérité de l'époque Wave-only).
--
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-intouch.sql. Idempotent : ré-exécutable sans erreur.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_method_check'
  ) THEN
    ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_method_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_method_check'
  ) THEN
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_method_check
      CHECK (method IN ('cash', 'wave', 'intouch', 'mobile_money', 'card', 'balance'));
  END IF;
END $$;

-- Sécurité : aligne aussi oresto_payments (au cas où supabase-intouch.sql
-- n'aurait pas été exécuté sur cette base).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oresto_payments_method_check'
  ) THEN
    ALTER TABLE oresto_payments DROP CONSTRAINT oresto_payments_method_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oresto_payments_method_check'
  ) THEN
    ALTER TABLE oresto_payments ADD CONSTRAINT oresto_payments_method_check
      CHECK (method IN ('cash', 'wave', 'intouch', 'mobile_money', 'card', 'balance'));
  END IF;
END $$;
