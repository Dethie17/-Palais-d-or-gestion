-- =============================================================================
-- O RESTO — RATTACHEMENT AUTOMATIQUE UNIVERSNEL DE TOUS LES PARENTS
-- =============================================================================
-- Identité canonique : 9 chiffres Sénégalais + connexion par <numero>@oresto-sn.com
-- Ce script ne doit plus afficher la liste des parents : il ne fait que les réparer.
-- À exécuter une fois après la migration ; l'application crée aussi les comptes
-- automatiquement lors des créations/imports futurs.
-- =============================================================================

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_id_key
  ON public.users(auth_id) WHERE auth_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.oresto_normalize_phone(value text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT right(regexp_replace(COALESCE(value, ''), '[^0-9]', '', 'g'), 9)
$$;

-- 1. Fiches dont l'identifiant utilisateur est déjà le numéro.
UPDATE public.users AS u
SET auth_id = a.id
FROM auth.users AS a
WHERE u.role = 'client'
  AND u.auth_id IS NULL
  AND lower(a.email) = lower(public.oresto_normalize_phone(u.username) || '@oresto-sn.com');

-- 2. Fiches héritées/importées : identifier le numéro dans parent_profiles.
UPDATE public.users AS u
SET auth_id = a.id
FROM public.parent_profiles AS pp
JOIN auth.users AS a
  ON lower(a.email) = lower(public.oresto_normalize_phone(pp.phone) || '@oresto-sn.com')
WHERE u.role = 'client'
  AND u.auth_id IS NULL
  AND u.username = pp.parent_username;

-- 3. Marquer tous les comptes Auth parents reliés.
UPDATE auth.users AS a
SET raw_app_meta_data = coalesce(a.raw_app_meta_data, '{}'::jsonb) || '{"oresto":"parent"}'::jsonb
FROM public.users AS u
WHERE u.role = 'client'
  AND u.auth_id = a.id;

-- 4. Résumé unique uniquement : aucun listing de tous les numéros.
DO $$
DECLARE
  v_total integer;
  v_linked integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.users WHERE role = 'client';
  SELECT count(*) INTO v_linked FROM public.users WHERE role = 'client' AND auth_id IS NOT NULL;
  RAISE NOTICE 'O RESTO parents: % total, % comptes reliés, % à compléter via l’import ou la création.',
    v_total, v_linked, GREATEST(v_total - v_linked, 0);
END
$$;

COMMIT;
