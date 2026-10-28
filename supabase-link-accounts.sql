-- =============================================================================
-- O RESTO — RATTACHEMENT AUTOMATIQUE DE TOUS LES PARENTS
-- =============================================================================
-- Domaine Auth attendu : <numéro>@oresto-sn.com
-- Exemple : 776111463@oresto-sn.com
--
-- À exécuter dans Supabase SQL Editor APRÈS chaque import ou création de parents.
-- Ce script est idempotent : il peut être rejoué sans effet supplémentaire.
-- Il rattache les fiches existantes, mais ne crée pas les comptes Auth.
-- Les nouveaux parents doivent être créés via Import → Import Parent / API.
-- =============================================================================

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_id_key
  ON public.users(auth_id) WHERE auth_id IS NOT NULL;

-- 1. Cas standard : le nom métier du parent est déjà son numéro normalisé.
UPDATE public.users AS u
SET auth_id = a.id
FROM auth.users AS a
WHERE u.role = 'client'
  AND u.auth_id IS NULL
  AND lower(a.email) = lower(regexp_replace(u.username, '[^0-9]', '', 'g') || '@oresto-sn.com');

-- 2. Cas importé/ancien : parent_profiles porte le numéro canonique, users porte
--    un ancien identifiant. Le script répare le lien sans fusionner les données.
UPDATE public.users AS u
SET auth_id = a.id
FROM public.parent_profiles AS pp
JOIN auth.users AS a
  ON lower(a.email) = lower(regexp_replace(pp.phone, '[^0-9]', '', 'g') || '@oresto-sn.com')
WHERE u.role = 'client'
  AND u.username = pp.parent_username
  AND u.auth_id IS NULL;

-- 3. Marquer tous les comptes Auth parents avec le marqueur attendu par l'app.
UPDATE auth.users AS a
SET raw_app_meta_data = coalesce(a.raw_app_meta_data, '{}'::jsonb) || '{"oresto":"parent"}'::jsonb
FROM public.users AS u
WHERE u.role = 'client'
  AND a.id = u.auth_id;

COMMIT;

-- -----------------------------------------------------------------------------
-- Diagnostic complet
-- -----------------------------------------------------------------------------
SELECT
  u.username,
  u.role,
  u.auth_id IS NOT NULL AS rattache,
  a.email AS email_auth
FROM public.users AS u
LEFT JOIN auth.users AS a ON a.id = u.auth_id
WHERE u.role = 'client'
ORDER BY u.username;

-- Parents importés dont le numéro existe dans parent_profiles, mais dont aucun
-- compte Auth correspond à <numéro>@oresto-sn.com.
SELECT
  pp.parent_username,
  pp.first_name,
  pp.last_name,
  pp.phone,
  regexp_replace(pp.phone, '[^0-9]', '', 'g') || '@oresto-sn.com' AS compte_attendu,
  u.auth_id IS NOT NULL AS rattache
FROM public.parent_profiles AS pp
LEFT JOIN public.users AS u
  ON u.username = pp.parent_username AND u.role = 'client'
WHERE u.auth_id IS NULL
ORDER BY pp.phone;
