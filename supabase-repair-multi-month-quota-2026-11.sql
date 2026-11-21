-- ============================================================
-- O RESTO — Abonnements multi-mois : quota complet + réparation (2026-11)
--
-- À exécuter dans Supabase → SQL Editor, après supabase-fix-mois-futurs.sql.
--
-- Corrections :
-- 1. Les fonctions de règlement SycaPay créditent désormais
--    meals_included × nombre de mois couverts par la période de
--    l'abonnement, au lieu d'un seul mois.
-- 2. Les abonnements ACTIFS déjà réglés dont la période couvre au moins
--    deux mois civils et dont le solde est trop bas sont re-crédités.
--    Le nombre de repas déjà consommés est déduit des validations
--    acceptées : on ne retire jamais de repas, on ne fait que combler le
--    manque.
-- 3. Les vues « mois payés par enfant » répartissent les paiements
--    groupés entre les enfants et n'accordent un mois qu'aux paiements
--    complets (27 000 / 32 000 = 1 mois, 54 000 / 64 000 = 2 mois).
-- 4. Le Superviseur (personnel) peut écrire les menus et les produits.
--
-- Idempotent : functions CREATE OR REPLACE, table de sauvegarde avec
-- ON CONFLICT DO NOTHING, UPDATE conditionné sur l'ancienne valeur.
-- ============================================================

-- Mois civils couverts par une période [start_date, end_date).
CREATE OR REPLACE FUNCTION public.oresto_subscription_months(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE sql
STABLE
STRICT
AS $$
  SELECT GREATEST(
    1,
    (EXTRACT(YEAR FROM p_end AT TIME ZONE 'UTC')::INTEGER
      - EXTRACT(YEAR FROM p_start AT TIME ZONE 'UTC')::INTEGER) * 12
    + (EXTRACT(MONTH FROM p_end AT TIME ZONE 'UTC')::INTEGER
      - EXTRACT(MONTH FROM p_start AT TIME ZONE 'UTC')::INTEGER)
  );
$$;

-- ------------------------------------------------------------
-- 1. Correctif des fonctions de règlement
--    On réécrit uniquement l'expression de quota, sans recopier tout le
--    corps des fonctions : si le motif n'est plus présent, on ne touche à
--    rien (message NOTICE).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT;
  v_old TEXT := 'GREATEST(meals_remaining, v_formula.meals_included)';
  v_new TEXT := 'GREATEST(meals_remaining, public.oresto_subscription_months(v_sub.start_date, v_sub.end_date) * v_formula.meals_included)';
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'oresto_settle_payment'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'oresto_settle_payment absente : correctif ignoré';
  ELSIF position(v_old IN v_def) = 0 THEN
    RAISE NOTICE 'oresto_settle_payment : motif de quota déjà corrigé ou forme inattendue';
  ELSE
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;

DO $$
DECLARE
  v_def TEXT;
  v_old TEXT := 'GREATEST(s.meals_remaining, f.meals_included)';
  v_new TEXT := 'GREATEST(s.meals_remaining, public.oresto_subscription_months(s.start_date, s.end_date) * f.meals_included)';
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'oresto_settle_payment_group'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'oresto_settle_payment_group absente : correctif ignoré';
  ELSIF position(v_old IN v_def) = 0 THEN
    RAISE NOTICE 'oresto_settle_payment_group : motif de quota déjà corrigé ou forme inattendue';
  ELSE
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Réparation des données existantes
-- ------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public._repair_multi_month_quota_backup (
  subscription_id TEXT PRIMARY KEY,
  formula_id TEXT NOT NULL,
  child_id TEXT,
  client_username TEXT NOT NULL,
  old_meals_remaining INTEGER NOT NULL,
  new_meals_remaining INTEGER NOT NULL,
  months INTEGER NOT NULL,
  meals_per_month INTEGER NOT NULL,
  quota_total INTEGER NOT NULL,
  consumed INTEGER NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH cible AS (
  SELECT
    s.id,
    s.formula_id,
    s.child_id,
    s.client_username,
    s.start_date,
    s.end_date,
    s.meals_remaining,
    f.meals_included,
    public.oresto_subscription_months(s.start_date, s.end_date) AS months,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.validations v
      WHERE v.status = 'accepted'
        AND v.validated_at >= s.start_date
        AND v.validated_at < s.end_date
        AND (
          (s.child_id IS NOT NULL AND (v.child_id = s.child_id OR v.qr_token = s.qr_token))
          OR (s.child_id IS NULL AND v.client_username = s.client_username AND v.child_id IS NULL)
        )
    ), 0) AS consumed
  FROM public.subscriptions s
  JOIN public.formulas f ON f.id = s.formula_id
  WHERE s.status = 'active'
    AND s.end_date > NOW()
    AND COALESCE(f.kind, 'subscription') = 'subscription'
    AND s.formula_id <> 'TICKET-JOUR'
), calcul AS (
  SELECT
    c.*,
    c.months * c.meals_included AS quota_total,
    GREATEST(0, c.months * c.meals_included - c.consumed) AS nouveau_solde
  FROM cible c
  WHERE c.months >= 2
)
INSERT INTO public._repair_multi_month_quota_backup
  (subscription_id, formula_id, child_id, client_username,
   old_meals_remaining, new_meals_remaining, months, meals_per_month,
   quota_total, consumed, start_date, end_date)
SELECT
  id, formula_id, child_id, client_username,
  meals_remaining, nouveau_solde, months, meals_included,
  quota_total, consumed, start_date, end_date
FROM calcul
WHERE nouveau_solde > meals_remaining
ON CONFLICT (subscription_id) DO NOTHING;

UPDATE public.subscriptions s
   SET meals_remaining = b.new_meals_remaining
  FROM public._repair_multi_month_quota_backup b
 WHERE s.id = b.subscription_id
   AND s.meals_remaining = b.old_meals_remaining
   AND b.new_meals_remaining > b.old_meals_remaining;

COMMIT;

-- Contrôle : lignes réparées (ou à réparer) et leur détail.
SELECT
  b.subscription_id,
  b.formula_id,
  b.client_username,
  b.months,
  b.meals_per_month,
  b.quota_total,
  b.consumed,
  b.old_meals_remaining,
  b.new_meals_remaining,
  s.meals_remaining AS solde_actuel
FROM public._repair_multi_month_quota_backup b
JOIN public.subscriptions s ON s.id = b.subscription_id
ORDER BY b.created_at DESC;

-- ------------------------------------------------------------
-- 3. Historique des paiements → mois payés par enfant
--    Règle métier : 27 000 / 32 000 = 1 mois ; 54 000 / 64 000 = 2 mois.
--    Un paiement partiel (ex. 9 500) ne compte pas comme un mois.
--    Paiement groupé : le montant est réparti entre les abonnements du
--    groupe, puis chaque enfant est compté séparément.
--    L'enfant vient de l'abonnement, du paiement, ou du groupe.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_detail_mois_payes_par_enfant AS
WITH paiements AS (
  SELECT
    p.id,
    p.reference,
    COALESCE(p.paid_at, p.settled_at, p.created_at) AS paid_at,
    p.client_username,
    p.amount,
    p.subscription_id,
    p.formula_id,
    p.child_id
  FROM public.oresto_payments p
  WHERE p.status = 'paid'
    AND p.amount > 0
), groupes AS (
  SELECT
    g.payment_reference,
    g.subscription_ids,
    COALESCE(SUM(f.price), 0) AS prix_groupe
  FROM public.oresto_payment_groups g
  LEFT JOIN LATERAL unnest(g.subscription_ids) AS u(sid) ON TRUE
  LEFT JOIN public.subscriptions s ON s.id = u.sid
  LEFT JOIN public.formulas f ON f.id = s.formula_id
  GROUP BY g.payment_reference, g.subscription_ids
), lignes_groupe AS (
  SELECT
    p.id AS payment_id,
    p.reference,
    p.paid_at,
    p.client_username,
    s.formula_id,
    CASE
      WHEN gr.prix_groupe > 0 THEN p.amount * f.price / gr.prix_groupe
      ELSE p.amount / GREATEST(array_length(gr.subscription_ids, 1), 1)
    END AS amount,
    COALESCE(s.child_id, p.child_id) AS child_id,
    s.id AS subscription_id,
    s.start_date,
    s.end_date
  FROM paiements p
  JOIN groupes gr ON gr.payment_reference = p.reference
  CROSS JOIN LATERAL unnest(gr.subscription_ids) AS u(sid)
  JOIN public.subscriptions s ON s.id = u.sid
  LEFT JOIN public.formulas f ON f.id = s.formula_id
), lignes_simples AS (
  SELECT
    p.id AS payment_id,
    p.reference,
    p.paid_at,
    p.client_username,
    COALESCE(p.formula_id, s.formula_id) AS formula_id,
    p.amount AS amount,
    COALESCE(p.child_id, s.child_id) AS child_id,
    s.id AS subscription_id,
    s.start_date,
    s.end_date
  FROM paiements p
  LEFT JOIN public.subscriptions s ON s.id = p.subscription_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.oresto_payment_groups g
    WHERE g.payment_reference = p.reference
  )
), base AS (
  SELECT * FROM lignes_groupe
  UNION ALL
  SELECT * FROM lignes_simples
)
SELECT
  b.payment_id,
  b.reference,
  b.paid_at,
  b.client_username,
  b.formula_id,
  b.amount,
  CASE
    WHEN NULLIF(f.price, 0) IS NOT NULL
      THEN GREATEST(0, FLOOR(b.amount / NULLIF(f.price, 0))::INTEGER)
    WHEN b.subscription_id IS NOT NULL
      THEN public.oresto_subscription_months(b.start_date, b.end_date)
    ELSE 0
  END AS mois_payes,
  b.child_id,
  c.first_name AS enfant_prenom,
  c.last_name AS enfant_nom,
  c.class_name AS classe,
  c.parent_username
FROM base b
LEFT JOIN public.formulas f ON f.id = b.formula_id
LEFT JOIN public.children c ON c.id = b.child_id
WHERE COALESCE(f.kind, 'subscription') = 'subscription'
  AND b.formula_id <> 'TICKET-JOUR'
  AND COALESCE(f.duration_days, 30) >= 28;

CREATE OR REPLACE VIEW public.v_mois_payes_par_enfant AS
SELECT
  enfant_id,
  enfant_prenom,
  enfant_nom,
  classe,
  parent_username,
  COUNT(*) AS nombre_paiements,
  SUM(mois_payes) AS mois_payes,
  SUM(amount) AS total_paye,
  MAX(paid_at) AS dernier_paiement
FROM (
  SELECT
    child_id AS enfant_id,
    enfant_prenom,
    enfant_nom,
    classe,
    parent_username,
    mois_payes,
    amount,
    paid_at
  FROM public.v_detail_mois_payes_par_enfant
  WHERE child_id IS NOT NULL
) t
GROUP BY enfant_id, enfant_prenom, enfant_nom, classe, parent_username;

-- Synthèse demandée : un enfant = nombre de mois payés.
SELECT * FROM public.v_mois_payes_par_enfant ORDER BY enfant_nom, enfant_prenom;

-- Paiements réglés mais sans enfant identifiable (à rattacher manuellement).
SELECT
  payment_id,
  reference,
  paid_at,
  client_username,
  formula_id,
  amount,
  mois_payes
FROM public.v_detail_mois_payes_par_enfant
WHERE child_id IS NULL
ORDER BY paid_at DESC;

-- ------------------------------------------------------------
-- 4. Ecriture des menus : le Superviseur (personnel) peut composer,
--    l'Espace ISM (admin) reste en lecture seule dans l'interface.
--    Remplace les policies menus_write/products_write posees par
--    supabase-o-resto-final-2026.sql (admin seul).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS menus_write ON public.weekly_menus;
DROP POLICY IF EXISTS menus_write_chk ON public.weekly_menus;
CREATE POLICY menus_write ON public.weekly_menus FOR ALL
  USING (public.is_admin() OR public.current_app_role() = 'personnel');
CREATE POLICY menus_write_chk ON public.weekly_menus FOR ALL
  WITH CHECK (public.is_admin() OR public.current_app_role() = 'personnel');

DROP POLICY IF EXISTS products_write ON public.products;
DROP POLICY IF EXISTS products_write_chk ON public.products;
CREATE POLICY products_write ON public.products FOR ALL
  USING (public.is_admin() OR public.current_app_role() = 'personnel');
CREATE POLICY products_write_chk ON public.products FOR ALL
  WITH CHECK (public.is_admin() OR public.current_app_role() = 'personnel');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_menus, public.products TO authenticated;
