-- ============================================================
-- O RESTO — migration depuis le schéma "Palais d'Or"
-- À exécuter dans le SQL Editor Supabase APRÈS supabase-setup.sql
-- ============================================================

-- 1. Rôles O RESTO : client / personnel / gestionnaire / admin
--    (+ conservation des anciens rôles caissier / manager)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('client', 'personnel', 'gestionnaire', 'admin', 'caissier', 'manager'));

-- 2. QR individuel + rattachement établissement
ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS establishment_id TEXT;

-- 3. Établissements (écoles / entreprises)
CREATE TABLE IF NOT EXISTS establishments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  manager TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Formules d'abonnement (offres)
CREATE TABLE IF NOT EXISTS formulas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  duration_days INTEGER NOT NULL,
  meals_included INTEGER NOT NULL,
  rules TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Abonnements clients
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  client_username TEXT NOT NULL,
  formula_id TEXT NOT NULL REFERENCES formulas(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  meals_remaining INTEGER NOT NULL DEFAULT 0,
  qr_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_client ON subscriptions(client_username);
CREATE INDEX IF NOT EXISTS idx_subscriptions_qr ON subscriptions(qr_token);

-- 6. Validations QR (consommations)
CREATE TABLE IF NOT EXISTS validations (
  id TEXT PRIMARY KEY,
  qr_token TEXT NOT NULL,
  client_username TEXT NOT NULL,
  establishment_id TEXT NOT NULL,
  validated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_validations_qr_day ON validations(qr_token, validated_at);
CREATE INDEX IF NOT EXISTS idx_validations_client ON validations(client_username);

-- 7. Paiements O RESTO (Wave / Espèces)
CREATE TABLE IF NOT EXISTS oresto_payments (
  id TEXT PRIMARY KEY,
  subscription_id TEXT REFERENCES subscriptions(id),
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'wave', 'mobile_money', 'card')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  reference TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Sécurité RLS (mêmes politiques ouvertes que le schéma d'origine)
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oresto_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['establishments', 'formulas', 'subscriptions', 'validations', 'oresto_payments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'open_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)', 'open_' || t, t);
  END LOOP;
END $$;

-- 9. Données de départ
INSERT INTO establishments (id, name, address, manager, phone) VALUES
  ('E1', 'École Les Lauriers', 'Thiès, Sénégal', 'Direction des études', '+221 33 000 00 01'),
  ('E2', 'Entreprise Sahel SARL', 'Dakar, Sénégal', 'Responsable RH', '+221 33 000 00 02')
ON CONFLICT (id) DO NOTHING;

INSERT INTO formulas (id, name, description, price, duration_days, meals_included, rules) VALUES
  ('F1', 'Midi Semaine', '1 repas le midi, du lundi au vendredi', 7500, 7, 5, '1 repas / jour, service du midi uniquement'),
  ('F2', 'Mensuel Complet', '2 repas par jour pendant 30 jours', 45000, 30, 60, '2 repas / jour maximum'),
  ('F3', 'Carnet 10 repas', '10 repas à consommer librement', 12000, 60, 10, 'Sans limite journalière, valable 60 jours'),
  ('T1', 'Ticket — Menu Élève (Lun)', 'Mini Fataya + Chandwitch Poulet + Jus Naturel', 900, 7, 1, 'Ticket valable 7 jours, 1 repas'),
  ('T2', 'Ticket — Menu Gourmand (Mar)', 'Tacos + Boisson Gazeuse + Cake', 2200, 7, 1, 'Ticket valable 7 jours, 1 repas'),
  ('T3', 'Ticket — Menu Petit Budget (Mer)', 'Mini Pizza + Eau + Mini Cake', 400, 7, 1, 'Ticket valable 7 jours, 1 repas'),
  ('T4', 'Ticket — Menu Goûter (Jeu)', 'Crépe Sucré + Lakh', 600, 7, 1, 'Ticket valable 7 jours, 1 repas'),
  ('T5', 'Ticket — Menu Burger (Ven)', 'Burger + Nems + Jus Naturel', 1650, 7, 1, 'Ticket valable 7 jours, 1 repas')
ON CONFLICT (id) DO NOTHING;

-- 10. Comptes démo O RESTO (mots de passe à changer en production !)
INSERT INTO users (username, password, role, qr_token) VALUES
  ('client', 'client123', 'client', 'ORESTO-CLIENT-001'),
  ('personnel', 'personnel123', 'personnel', NULL),
  ('gestionnaire', 'gestionnaire123', 'gestionnaire', NULL),
  ('admin', 'admin123', 'admin', NULL)
ON CONFLICT (username) DO NOTHING;

-- 11. Comptes créés depuis l'app (Paramètres DG) : écriture distante
--     (le schéma d'origine n'autorisait que lecture + mise à jour)
DROP POLICY IF EXISTS "Création publique des utilisateurs" ON users;
CREATE POLICY "Création publique des utilisateurs" ON users FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Suppression publique des utilisateurs" ON users;
CREATE POLICY "Suppression publique des utilisateurs" ON users FOR DELETE USING (true);
