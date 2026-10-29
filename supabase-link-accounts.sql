-- =============================================================================
-- O RESTO — RATTACHEMENT UNIVERSAL DES PARENTS
-- Compatible comptes créés et parents importés, formats 77..., 22177..., +221...
-- À exécuter APRÈS chaque import dans Supabase SQL Editor.
-- Idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_id_key
  ON public.users(auth_id) WHERE auth_id IS NOT NULL;

CREATE TEMP TABLE oresto_parent_phone_map ON COMMIT DROP AS
SELECT
  pp.parent_username,
  right(
    CASE
      WHEN regexp_replace(coalesce(pp.phone::text, ''), '[^0-9]', '', 'g') LIKE '221%' 
      THEN substring(regexp_replace(coalesce(pp.phone::text, ''), '[^0-9]', '', 'g') from 4)
      ELSE regexp_replace(coalesce(pp.phone::text, ''), '[^0-9]', '', 'g')
    END,
    9
  ) AS phone
FROM public.parent_profiles pp;

-- Rattache les fiches legacy via parent_profiles.
UPDATE public.users u
SET auth_id = a.id
FROM oresto_parent_phone_map m
JOIN auth.users a
  ON lower(a.email) = lower(m.phone || '@oresto-sn.com')
WHERE u.role = 'client'
  AND u.username = m.parent_username
  AND u.auth_id IS NULL;

-- Rattache les fiches dont le username est déjà le numéro normalisé.
UPDATE public.users u
SET auth_id = a.id
FROM auth.users a
WHERE u.role = 'client'
  AND u.auth_id IS NULL
  AND lower(a.email) = lower(right(regexp_replace(coalesce(u.username::text, ''), '[^0-9]', '', 'g'), 9) || '@oresto-sn.com');

-- Marque tous les comptes Auth liés comme parents.
UPDATE auth.users a
SET raw_app_meta_data = coalesce(a.raw_app_meta_data, '{}'::jsonb) || '{"oresto":"parent"}'::jsonb
FROM public.users u
WHERE u.role = 'client'
  AND u.auth_id = a.id;

COMMIT;

-- Diagnostic : comptes parents liés ou non liés.
SELECT u.username, u.role, u.auth_id IS NOT NULL AS rattache,
       a.email AS email_auth
FROM public.users u
LEFT JOIN auth.users a ON a.id = u.auth_id
WHERE u.role = 'client'
ORDER BY u.username;

SELECT pp.parent_username, pp.first_name, pp.last_name, pp.phone,
       right(CASE WHEN regexp_replace(coalesce(pp.phone::text, ''), '[^0-9]', '', 'g') LIKE '221%' THEN substring(regexp_replace(coalesce(pp.phone::text, ''), '[^0-9]', '', 'g') from 4) ELSE regexp_replace(coalesce(pp.phone::text, ''), '[^0-9]', '', 'g') END, 9) || '@oresto-sn.com' AS compte_attendu,
       u.auth_id IS NOT NULL AS rattache
FROM public.parent_profiles pp
LEFT JOIN public.users u ON u.username = pp.parent_username AND u.role = 'client'
WHERE u.auth_id IS NULL
ORDER BY pp.phone;
