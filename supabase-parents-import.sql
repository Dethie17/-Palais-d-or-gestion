-- O RESTO — parents-import-paiements
-- PHASE 1 — Base de données (idempotent, dans un bloc explicite)
-- Exécuter dans l'éditeur SQL Supabase. NE PAS exécuter automatiquement.
-- Règles : pas de DROP TABLE, pas de DELETE sur des paiements validés (status='paid').
-- Sauvegarde dans un schéma backup_... non exposé.

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup_parents_import;
COMMENT ON SCHEMA backup_parents_import IS 'Sauvegardes temporaires créées par supabase-parents-import.sql. Non exposé via API.';

-- 1) Sauvegarde des tables touchées
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS backup_parents_import.oresto_payments AS SELECT * FROM oresto_payments WHERE false';
    EXECUTE 'INSERT INTO backup_parents_import.oresto_payments SELECT * FROM oresto_payments';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS backup_parents_import.subscriptions AS SELECT * FROM subscriptions WHERE false';
    EXECUTE 'INSERT INTO backup_parents_import.subscriptions SELECT * FROM subscriptions';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS backup_parents_import.children AS SELECT * FROM children WHERE false';
    EXECUTE 'INSERT INTO backup_parents_import.children SELECT * FROM children';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS backup_parents_import.users AS SELECT * FROM users WHERE false';
    EXECUTE 'INSERT INTO backup_parents_import.users SELECT * FROM users';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS backup_parents_import.sycapay_events AS SELECT * FROM sycapay_events WHERE false';
    EXECUTE 'INSERT INTO backup_parents_import.sycapay_events SELECT * FROM sycapay_events';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

-- 2) Fonction pour générer un qr_token unique non devinable (128 bits URL-safe)
CREATE OR REPLACE FUNCTION public.generate_qr_token() RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_token text;
  v_exists boolean;
BEGIN
  LOOP
    -- generate 16 random bytes = 128 bits, encode as base64url (no padding)
    v_token := replace(replace(replace(encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '');
    SELECT EXISTS(SELECT 1 FROM public.children WHERE qr_token = v_token) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_token;
    END IF;
  END LOOP;
END;
$$;

-- 3) Assurer children.qr_token NOT NULL UNIQUE + générer pour ceux sans token
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS qr_token text;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.children WHERE qr_token IS NULL OR btrim(qr_token) = '' LOOP
    UPDATE public.children SET qr_token = public.generate_qr_token() WHERE id = r.id AND (qr_token IS NULL OR btrim(qr_token) = '');
  END LOOP;
END $$;

-- Résoudre d'éventuels doublons de qr_token sur children avant contrainte
DO $$
DECLARE
  r record;
  v_new text;
BEGIN
  FOR r IN 
    SELECT qr_token, array_agg(id ORDER BY created_at, id) as ids
    FROM public.children
    WHERE qr_token IS NOT NULL
    GROUP BY qr_token
    HAVING count(*) > 1
  LOOP
    -- garder le premier, régénérer les autres
    FOR i IN 2..array_length(r.ids, 1) LOOP
      v_new := public.generate_qr_token();
      UPDATE public.children SET qr_token = v_new WHERE id = r.ids[i];
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.children ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS children_qr_token_key ON public.children(qr_token);

-- 4) Unicité logique enfant (parent_username, prénom, nom normalisés)
CREATE UNIQUE INDEX IF NOT EXISTS children_parent_name_unique_idx
ON public.children (
  parent_username,
  lower(btrim(first_name)),
  lower(btrim(last_name))
);

-- 5) Durcir oresto_payments
ALTER TABLE public.oresto_payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.oresto_payments ADD COLUMN IF NOT EXISTS settled_at timestamptz;
ALTER TABLE public.oresto_payments ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Résoudre doublons de reference avant contrainte
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT reference, array_agg(id ORDER BY created_at, id) as ids
    FROM public.oresto_payments
    WHERE reference IS NOT NULL
    GROUP BY reference
    HAVING count(*) > 1
  LOOP
    FOR i IN 2..array_length(r.ids, 1) LOOP
      UPDATE public.oresto_payments 
      SET reference = reference || '-' || ids[i] 
      WHERE id = r.ids[i];
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS oresto_payments_reference_key ON public.oresto_payments(reference);
CREATE UNIQUE INDEX IF NOT EXISTS oresto_payments_idempotency_key_key ON public.oresto_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oresto_payments_provider_provider_tx_key ON public.oresto_payments(provider, provider_tx) WHERE provider_tx IS NOT NULL;

-- 6) Un seul abonnement actif par enfant
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_child_idx ON public.subscriptions(child_id) WHERE status = 'active';

-- 7) Table classes
CREATE TABLE IF NOT EXISTS public.classes (
  id text PRIMARY KEY,
  label text NOT NULL,
  cycle text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Alimenter depuis données connues si possible (idempotent)
INSERT INTO public.classes (id, label, cycle, sort_order) VALUES
  ('maternelle_tps','TPS','maternelle',1),
  ('maternelle_ps','PS','maternelle',2),
  ('maternelle_ms','MS','maternelle',3),
  ('maternelle_gs','GS','maternelle',4),
  ('primaire_cia','CIA','primaire',10),
  ('primaire_cib','CIB','primaire',11),
  ('primaire_cic','CIC','primaire',12),
  ('primaire_cid','CID','primaire',13),
  ('primaire_cp','CP','primaire',14),
  ('primaire_ce1','CE1','primaire',15),
  ('primaire_ce2','CE2','primaire',16),
  ('primaire_cm1','CM1','primaire',17),
  ('primaire_cm2','CM2','primaire',18),
  ('college_6e','6e','college',30),
  ('college_5e','5e','college',31),
  ('college_4e','4e','college',32),
  ('college_3e','3e','college',33),
  ('lycee_2nde','2nde','lycee',50),
  ('lycee_1ere','1ère','lycee',51),
  ('lycee_terminale','Terminale','lycee',52)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, cycle = EXCLUDED.cycle, sort_order = EXCLUDED.sort_order;

-- Politiques RLS pour classes (lecture pour authentifiés, gestion par admin/staff via fonctions existantes)
DROP POLICY IF EXISTS classes_read_authenticated ON public.classes;
CREATE POLICY classes_read_authenticated ON public.classes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS classes_manage_admin ON public.classes;
CREATE POLICY classes_manage_admin ON public.classes FOR ALL TO authenticated
USING (public.is_admin() OR public.is_staff())
WITH CHECK (public.is_admin() OR public.is_staff());

-- 8) Table import_batches
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  filename text,
  total_lines integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  credentials jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_batches_admin_only ON public.import_batches;
CREATE POLICY import_batches_admin_only ON public.import_batches FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 9) Vues : paiements validés uniquement, abonnés actifs visibles
CREATE OR REPLACE VIEW public.v_paiements_valides AS
SELECT *
FROM public.oresto_payments
WHERE status = 'paid'
  AND settled_at IS NOT NULL;

CREATE OR REPLACE VIEW public.v_abonnes_actifs AS
SELECT s.*
FROM public.subscriptions s
WHERE s.status = 'active'
  AND s.end_date >= CURRENT_DATE;

-- 10) RPC pour tableaux de bord (somme uniquement paiements validés)
CREATE OR REPLACE FUNCTION public.rpc_ca_periode(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total
  FROM public.v_paiements_valides
  WHERE (p_start IS NULL OR COALESCE(paid_at, settled_at, created_at)::date >= p_start)
    AND (p_end IS NULL OR COALESCE(paid_at, settled_at, created_at)::date <= p_end);
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_dashboard_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca_jour numeric := 0;
  v_ca_mois numeric := 0;
  v_paiements_count integer := 0;
  v_abonnes integer := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_ca_jour
  FROM public.v_paiements_valides
  WHERE COALESCE(paid_at, settled_at, created_at)::date = CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_ca_mois
  FROM public.v_paiements_valides
  WHERE date_trunc('month', COALESCE(paid_at, settled_at, created_at)) = date_trunc('month', CURRENT_DATE);

  SELECT COUNT(*)
  INTO v_paiements_count
  FROM public.v_paiements_valides;

  SELECT COUNT(*)
  INTO v_abonnes
  FROM public.v_abonnes_actifs;

  RETURN jsonb_build_object(
    'ca_jour', v_ca_jour,
    'ca_mois', v_ca_mois,
    'paiements_valides_count', v_paiements_count,
    'abonnes_actifs', v_abonnes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ca_periode(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_dashboard_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_ca_periode(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_kpis() TO authenticated;

-- 10 bis) Règlement d'un encaissement au comptoir (idempotent)
--
-- SEULE la clé de service (service_role) a le droit d'appeler cette
-- fonction : c'est elle qui pose `settled_at`, la colonne qui fait foi en
-- comptabilité. Un navigateur ne doit jamais pouvoir l'écrire : sinon un
-- parent pourrait s'attribuer un encaissement. Le personnel passe par
-- /api/finance/settle-payment, qui vérifie le rôle avant d'appeler.
--
-- Idempotence : un paiement déjà soldé est renvoyé tel quel (SELECT ... FOR
-- UPDATE verrouille la ligne, l'opération est atomique).
CREATE OR REPLACE FUNCTION public.settle_payment(p_payment_id text)
RETURNS public.oresto_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.oresto_payments;
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION 'identifiant de paiement manquant' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.oresto_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'paiement introuvable: %', p_payment_id USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'paid' AND v_row.settled_at IS NOT NULL THEN
    RETURN v_row;  -- déjà réglé : rien à refaire
  END IF;

  UPDATE public.oresto_payments
     SET status = 'paid',
         paid_at = COALESCE(paid_at, now()),
         settled_at = now()
   WHERE id = p_payment_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_payment(text) TO service_role;

-- 11) Nettoyage commenté des doublons non validés (NE JAMAIS toucher paiements paid)
-- Décommenter uniquement après validation du rapport A1-A6.
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN (
--     select id from oresto_payments 
--     where status <> 'paid' 
--       and reference in (select reference from oresto_payments group by reference having count(*) > 1)
--       and id not in (select min(id) from oresto_payments group by reference)
--   ) LOOP
--     UPDATE oresto_payments SET status = 'expired' WHERE id = r.id AND status <> 'paid';
--   END LOOP;
-- END $$;

-- 12) Bilan unique des contrôles
SELECT 
  'children_sans_qr' as controle, COUNT(*) as nb FROM public.children WHERE qr_token IS NULL OR btrim(qr_token) = ''
UNION ALL
SELECT 'children_qr_dupliques', COUNT(*) FROM (SELECT qr_token FROM public.children GROUP BY qr_token HAVING COUNT(*) > 1) t
UNION ALL
SELECT 'paiements_ref_dupliques', COUNT(*) FROM (SELECT reference FROM public.oresto_payments WHERE reference IS NOT NULL GROUP BY reference HAVING COUNT(*) > 1) t
UNION ALL
SELECT 'subs_actifs_par_enfant_dupliques', COUNT(*) FROM (SELECT child_id FROM public.subscriptions WHERE status='active' GROUP BY child_id HAVING COUNT(*) > 1) t
UNION ALL
SELECT 'paiements_valides', COUNT(*) FROM public.v_paiements_valides
UNION ALL
SELECT 'abonnes_actifs_vue', COUNT(*) FROM public.v_abonnes_actifs;

COMMIT;
