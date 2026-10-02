-- ============================================================
-- O RESTO — INSTALLATION COMPLETE (fichier unique)
-- Collez TOUT ce fichier dans Supabase > SQL Editor > New query > Run.
-- Rejouable sans erreur : tables IF NOT EXISTS, colonnes IF NOT EXISTS,
-- politiques DROP+CREATE, seeds ON CONFLICT DO NOTHING.
-- Menus vierges : le DG compose et publie les 5 jours (Gestion du menu).
-- Généré le : 2026-10-01 01:29
-- ============================================================

-- ------------------------------------------------------------
-- FICHIER : supabase-setup.sql
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('caissier', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO users (username, password, role) VALUES
  ('caissier', 'caissier123', 'caissier'),
  ('manager', 'manager123', 'manager')
ON CONFLICT (username) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  items JSONB NOT NULL,
  extras JSONB,
  subtotal NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  type TEXT NOT NULL CHECK (type IN ('dine-in', 'takeaway')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_name TEXT,
  payment_method TEXT,
  amount_received NUMERIC,
  change NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT,
  image TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  extras JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique des utilisateurs" ON users;
DROP POLICY IF EXISTS "Lecture publique des utilisateurs" ON users;
CREATE POLICY "Lecture publique des utilisateurs" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Mise à jour publique des utilisateurs" ON users;
DROP POLICY IF EXISTS "Mise à jour publique des utilisateurs" ON users;
CREATE POLICY "Mise à jour publique des utilisateurs" ON users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Lecture publique des commandes" ON orders;
DROP POLICY IF EXISTS "Lecture publique des commandes" ON orders;
CREATE POLICY "Lecture publique des commandes" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Création publique des commandes" ON orders;
DROP POLICY IF EXISTS "Création publique des commandes" ON orders;
CREATE POLICY "Création publique des commandes" ON orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Mise à jour publique des commandes" ON orders;
DROP POLICY IF EXISTS "Mise à jour publique des commandes" ON orders;
CREATE POLICY "Mise à jour publique des commandes" ON orders FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Suppression publique des commandes" ON orders;
DROP POLICY IF EXISTS "Suppression publique des commandes" ON orders;
CREATE POLICY "Suppression publique des commandes" ON orders FOR DELETE USING (true);

DROP POLICY IF EXISTS "Lecture publique des produits" ON products;
DROP POLICY IF EXISTS "Lecture publique des produits" ON products;
CREATE POLICY "Lecture publique des produits" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Création publique des produits" ON products;
DROP POLICY IF EXISTS "Création publique des produits" ON products;
CREATE POLICY "Création publique des produits" ON products FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Mise à jour publique des produits" ON products;
DROP POLICY IF EXISTS "Mise à jour publique des produits" ON products;
CREATE POLICY "Mise à jour publique des produits" ON products FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Suppression publique des produits" ON products;
DROP POLICY IF EXISTS "Suppression publique des produits" ON products;
CREATE POLICY "Suppression publique des produits" ON products FOR DELETE USING (true);


-- ------------------------------------------------------------
-- FICHIER : supabase-oresto-migration.sql
-- ------------------------------------------------------------
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
  method TEXT NOT NULL CHECK (method IN ('cash', 'wave', 'mobile_money', 'card', 'balance')),
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


-- ------------------------------------------------------------
-- FICHIER : supabase-oresto-full.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FICHIER : supabase-ism-wallet.sql
-- ------------------------------------------------------------
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
  method TEXT NOT NULL CHECK (method IN ('cash', 'wave', 'intouch', 'mobile_money', 'card', 'balance')),
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


-- ------------------------------------------------------------
-- FICHIER : supabase-tarifs-2026.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FICHIER : supabase-depenses.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FICHIER : supabase-menus-semaine.sql
-- ------------------------------------------------------------
-- ============================================================
-- O RESTO — Menu de la semaine (informatif, renseigné par le gérant)
-- À exécuter dans le SQL Editor Supabase APRÈS supabase-ism-wallet.sql
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_menus (
  day TEXT PRIMARY KEY CHECK (day IN ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi')),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  -- Plats du jour (noms) + prix UNIQUE du ticket, saisis par le Personnel.
  items JSONB NOT NULL DEFAULT '[]',
  price NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menus VIERGES : rien ne s'affiche aux parents tant que le DG n'a pas
-- composé ET publié les 5 jours (règle : un jour n'existe que s'il a des plats).
INSERT INTO weekly_menus (day, name, description, items) VALUES
  ('Lundi', '', '', '[]'),
  ('Mardi', '', '', '[]'),
  ('Mercredi', '', '', '[]'),
  ('Jeudi', '', '', '[]'),
  ('Vendredi', '', '', '[]')
ON CONFLICT (day) DO NOTHING;

ALTER TABLE weekly_menus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_weekly_menus ON weekly_menus;
CREATE POLICY open_weekly_menus ON weekly_menus FOR ALL USING (true) WITH CHECK (true);


-- ------------------------------------------------------------
-- FICHIER : supabase-cycles-2026.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FICHIER : supabase-parents-2026.sql
-- ------------------------------------------------------------
-- ============================================================
-- O RESTO — Fiches parents (identité + contact)
-- À exécuter dans le SQL Editor Supabase (ordre indifférent).
-- Idempotent : ré-exécutable sans erreur.
-- Chaque parent renseigne nom, prénom et téléphone avant
-- d'inscrire ses enfants (QR généré automatiquement).
-- ============================================================

CREATE TABLE IF NOT EXISTS parent_profiles (
  parent_username TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'open_parent_profiles' AND tablename = 'parent_profiles'
  ) THEN
    CREATE POLICY open_parent_profiles ON parent_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ------------------------------------------------------------
-- FICHIER : supabase-site-ism-2026.sql
-- ------------------------------------------------------------
-- ============================================================
-- O RESTO — Site unique : ISM Thiès
-- Le logiciel ne couvre qu'un seul établissement pour le moment.
-- À exécuter dans le SQL Editor Supabase (idempotent).
-- - Crée le site ISM Thiès (E-ISM)
-- - Rattache l'historique des validations à ce site
-- - Retire les anciens sites démo E1/E2 (sans historique restant)
-- ============================================================

INSERT INTO establishments (id, name, address, manager) VALUES
  ('E-ISM', 'ISM Thiès', 'Thiès, Sénégal', 'Direction ISM')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, address = EXCLUDED.address, manager = EXCLUDED.manager;

UPDATE validations SET establishment_id = 'E-ISM'
WHERE establishment_id IS DISTINCT FROM 'E-ISM';

DELETE FROM establishments WHERE id IN ('E1', 'E2')
  AND NOT EXISTS (SELECT 1 FROM validations WHERE establishment_id = establishments.id);


-- ------------------------------------------------------------
-- FICHIER : supabase-solde-carte.sql
-- ------------------------------------------------------------
-- ── O RESTO — Carte prépayée : abonnements payés avec le solde ──────────
-- Moyen 'balance' : le montant de l'abonnement est débité du wallet de l'enfant
-- (wallet_transactions kind 'subscription', method 'card' — déjà autorisé),
-- le paiement est tracé soldé dans oresto_payments (method 'balance'),
-- et l'abonnement est activé aussitôt. Refusé si solde insuffisant.
--
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-oresto-migration.sql et supabase-ism-wallet.sql.
-- BASE NEUVE : supabase-oresto-migration.sql inclut déjà 'balance', rien à faire.

ALTER TABLE IF EXISTS oresto_payments DROP CONSTRAINT IF EXISTS oresto_payments_method_check;
ALTER TABLE IF EXISTS oresto_payments ADD CONSTRAINT oresto_payments_method_check
  CHECK (method IN ('cash', 'wave', 'mobile_money', 'card', 'balance'));


-- ------------------------------------------------------------
-- FICHIER : supabase-menus-items.sql
-- ------------------------------------------------------------
-- ── O RESTO — Menus du jour composés par le DG ────────────────────
-- Ajoute la colonne items (plats + prix) à weekly_menus.
-- BASE EXISTANTE : exécutez ce fichier UNE FOIS dans Supabase SQL Editor,
-- APRÈS supabase-menus-semaine.sql. Idempotent : ré-exécutable sans erreur.
-- BASE NEUVE : supabase-menus-semaine.sql inclut déjà la colonne, rien à faire.

ALTER TABLE IF EXISTS weekly_menus
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';

