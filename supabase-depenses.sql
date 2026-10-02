-- ============================================================
-- O RESTO — Dépenses manuelles (comptabilité complète)
-- À exécuter dans le SQL Editor Supabase APRÈS supabase-ism-wallet.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_expenses (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('loyer', 'salaires', 'fournisseurs', 'transport', 'equipement', 'divers')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  spent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_spent ON finance_expenses(spent_at DESC);

ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_finance_expenses ON finance_expenses;
CREATE POLICY open_finance_expenses ON finance_expenses FOR ALL USING (true) WITH CHECK (true);
