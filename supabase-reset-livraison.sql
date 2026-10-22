-- ============================================================
-- O RESTO — LIVRAISON : recréer parent_profiles + purge totale
--
-- À exécuter dans le SQL Editor Supabase (Dashboard > SQL Editor).
-- Idempotent : ré-exécutable autant de fois que voulu, que la table
-- existe ou non.
--
-- 1. Recrée la table parent_profiles (déjà supprimée) avec les droits
--    qui manquaient au navigateur (cause des échecs de création/suppression).
-- 2. Vide toutes les données de test restantes.
-- 3. Supprime les comptes Auth des parents de test (garde le personnel).
-- 4. Vérifie.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE parent_profiles (schéma d'origine, inchangé)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_profiles (
  parent_username TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Droits : le navigateur (anon) doit pouvoir lire, créer et supprimer.
-- C'est ce qui bloquait avant (REVOKE hérité de supabase-security.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_profiles TO authenticated;

-- RLS activé, politique permissive : identique au reste de l'application.
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_profiles_access ON public.parent_profiles;
DROP POLICY IF EXISTS open_parent_profiles ON public.parent_profiles;
CREATE POLICY open_parent_profiles ON public.parent_profiles
  FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 2. PURGE — tous les restes de test (ordre FK-safe)
-- ------------------------------------------------------------
DELETE FROM public.validations;
DELETE FROM public.wallet_transactions;
DELETE FROM public.oresto_payments;
DELETE FROM public.subscriptions;
DELETE FROM public.wallets;
DELETE FROM public.children;
DELETE FROM public.parent_profiles;
DELETE FROM public.kiosk_orders;
DELETE FROM public.reclamation_messages;
DELETE FROM public.reclamations;
DELETE FROM public.orders;
DELETE FROM public.sycapay_events;
DELETE FROM public.payment_callbacks;
DELETE FROM public.finance_expenses;

-- Comptes applicatifs des parents de test (garde le personnel)
DELETE FROM public.users WHERE role = 'client';

-- ------------------------------------------------------------
-- 3. COMPTES Auth DES PARENTS (garde le personnel)
-- ------------------------------------------------------------
DELETE FROM auth.users
WHERE email LIKE '%@oresto-sn.com'
  AND email NOT IN (
    'admin@oresto-sn.com',
    'caissier@oresto-sn.com',
    'gestionnaire@oresto-sn.com',
    'manager@oresto-sn.com',
    'personnel@oresto-sn.com'
  );

-- ------------------------------------------------------------
-- 4. VÉRIFICATION — 0 partout, sauf users = 5
-- ------------------------------------------------------------
SELECT 'parent_profiles' AS table, count(*) AS restant FROM public.parent_profiles
UNION ALL SELECT 'children',            count(*) FROM public.children
UNION ALL SELECT 'wallets',             count(*) FROM public.wallets
UNION ALL SELECT 'wallet_transactions', count(*) FROM public.wallet_transactions
UNION ALL SELECT 'subscriptions',       count(*) FROM public.subscriptions
UNION ALL SELECT 'oresto_payments',     count(*) FROM public.oresto_payments
UNION ALL SELECT 'validations',         count(*) FROM public.validations
UNION ALL SELECT 'orders',              count(*) FROM public.orders
UNION ALL SELECT 'kiosk_orders',        count(*) FROM public.kiosk_orders
UNION ALL SELECT 'reclamations',        count(*) FROM public.reclamations
UNION ALL SELECT 'users (attendu = 5)', count(*) FROM public.users
UNION ALL SELECT 'produits (contenu)',  count(*) FROM public.products
UNION ALL SELECT 'menus (contenu)',     count(*) FROM public.weekly_menus
UNION ALL SELECT 'formules (contenu)',  count(*) FROM public.formulas;

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS droits
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'parent_profiles'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee;

SELECT policyname AS politique FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'parent_profiles';
