-- ============================================================
-- O RESTO — Enfants + Wallet QR + Finance + ISM
-- À exécuter dans le SQL Editor Supabase APRÈS :
--   1) supabase-setup.sql
--   2) supabase-oresto-migration.sql
--   3) supabase-oresto-full.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

-- 1. Rôles (espace ISM supprimé : plus de rôle 'ism')
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('client', 'personnel', 'gestionnaire', 'admin', 'caissier', 'manager'));
DELETE FROM users WHERE role = 'ism' OR username = 'ism';

-- 2. Enfants (comptes gérés par le parent, QR unique scanné au resto)
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  parent_username TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  qr_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_username);
CREATE INDEX IF NOT EXISTS idx_children_qr ON children(qr_token);
CREATE INDEX IF NOT EXISTS idx_children_class ON children(class_name);

-- 3. Abonnements / validations rattachés à un enfant (nullable = compatibilité existant)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS child_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_child_fk') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_child_fk
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_subscriptions_child ON subscriptions(child_id);

ALTER TABLE validations ADD COLUMN IF NOT EXISTS child_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validations_child_fk') THEN
    ALTER TABLE validations ADD CONSTRAINT validations_child_fk
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Wallet QR (carte prépayée par enfant, solde en FCFA)
CREATE TABLE IF NOT EXISTS wallets (
  child_id TEXT PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'debit', 'subscription', 'refund')),
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'wave', 'mobile_money', 'card')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  reference TEXT NOT NULL UNIQUE,
  payment_id TEXT REFERENCES oresto_payments(id) ON DELETE SET NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallettx_child ON wallet_transactions(child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallettx_status ON wallet_transactions(status);

-- 5. Paramètres comptables (parts ISM + frais PayDounya, éditables par le DG)
CREATE TABLE IF NOT EXISTS finance_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO finance_settings (key, value) VALUES
  ('ism_subscription_pct', '10'),
  ('ism_sales_pct', '5'),
  ('paydounya_pct', '3')
ON CONFLICT (key) DO NOTHING;

-- 6. RLS MVP (mêmes politiques ouvertes que le reste)
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['children', 'wallets', 'wallet_transactions', 'finance_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'open_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)', 'open_' || t, t);
  END LOOP;
END $$;

-- 7. (Espace ISM supprimé : aucun compte de supervision)
