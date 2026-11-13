-- ============================================================
-- O RESTO — MODULE DANGOTE PRO
-- Restaurant d'entreprise : employés, menus, repas, budget,
-- paiements SycaPay, rapports et journal d'audit.
--
-- À exécuter dans Supabase > SQL Editor APRÈS supabase-dangote.sql.
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Paramètres du restaurant
-- ------------------------------------------------------------
ALTER TABLE public.dangote_parametres
  ADD COLUMN IF NOT EXISTS nom_restaurant TEXT NOT NULL DEFAULT 'MIAM''S Dangote',
  ADD COLUMN IF NOT EXISTS devise TEXT NOT NULL DEFAULT 'FCFA',
  ADD COLUMN IF NOT EXISTS heure_ouverture TIME NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS heure_fermeture TIME NOT NULL DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS quota_repas_jour INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quota_repas_mois INTEGER NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS budget_alerte_seuil NUMERIC NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS auto_subvention BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ------------------------------------------------------------
-- 2. Employés : identité professionnelle complète
-- ------------------------------------------------------------
ALTER TABLE public.dangote_employes
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS poste TEXT,
  ADD COLUMN IF NOT EXISTS date_embauche DATE,
  ADD COLUMN IF NOT EXISTS date_fin DATE,
  ADD COLUMN IF NOT EXISTS plafond_journalier NUMERIC,
  ADD COLUMN IF NOT EXISTS plafond_mensuel NUMERIC,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS qr_rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dangote_employes_entite_actif
  ON public.dangote_employes (entite_id, actif);
CREATE INDEX IF NOT EXISTS idx_dangote_employes_service
  ON public.dangote_employes (entite_id, service);

-- ------------------------------------------------------------
-- 3. Catalogue : catégories, plats, menus du jour
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dangote_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  ordre INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entite_id, nom)
);

CREATE TABLE IF NOT EXISTS public.dangote_plats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id) ON DELETE CASCADE,
  categorie_id UUID REFERENCES public.dangote_categories(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,
  description TEXT,
  prix NUMERIC NOT NULL CHECK (prix >= 0),
  cout NUMERIC CHECK (cout IS NULL OR cout >= 0),
  image_url TEXT,
  est_premium BOOLEAN NOT NULL DEFAULT false,
  disponible BOOLEAN NOT NULL DEFAULT true,
  stock_quantite INTEGER CHECK (stock_quantite IS NULL OR stock_quantite >= 0),
  stock_alerte INTEGER CHECK (stock_alerte IS NULL OR stock_alerte >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dangote_plats_entite
  ON public.dangote_plats (entite_id, disponible);
CREATE INDEX IF NOT EXISTS idx_dangote_plats_categorie
  ON public.dangote_plats (categorie_id);

CREATE TABLE IF NOT EXISTS public.dangote_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id) ON DELETE CASCADE,
  date_jour DATE NOT NULL,
  type_repas TEXT NOT NULL CHECK (type_repas IN ('standard', 'premium')),
  titre TEXT NOT NULL,
  description TEXT,
  prix NUMERIC NOT NULL CHECK (prix >= 0),
  actif BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entite_id, date_jour, type_repas)
);

CREATE INDEX IF NOT EXISTS idx_dangote_menus_date
  ON public.dangote_menus (entite_id, date_jour, actif);

CREATE TABLE IF NOT EXISTS public.dangote_menu_plats (
  menu_id UUID NOT NULL REFERENCES public.dangote_menus(id) ON DELETE CASCADE,
  plat_id UUID NOT NULL REFERENCES public.dangote_plats(id) ON DELETE CASCADE,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  PRIMARY KEY (menu_id, plat_id)
);

-- ------------------------------------------------------------
-- 4. Repas : commande / ticket de cantine
-- ------------------------------------------------------------
ALTER TABLE public.dangote_repas
  ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES public.dangote_menus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plat_id UUID REFERENCES public.dangote_plats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantite INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'qr',
  ADD COLUMN IF NOT EXISTS superviseur_id UUID,
  ADD COLUMN IF NOT EXISTS superviseur_username TEXT,
  ADD COLUMN IF NOT EXISTS annule_par UUID,
  ADD COLUMN IF NOT EXISTS annule_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_dangote_repas_reference
  ON public.dangote_repas (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dangote_repas_entite_date
  ON public.dangote_repas (entite_id, date_jour DESC);
CREATE INDEX IF NOT EXISTS idx_dangote_repas_employe_date
  ON public.dangote_repas (employe_id, date_jour DESC);

DROP INDEX IF EXISTS public.dangote_repas_subvention_unique;

-- ------------------------------------------------------------
-- 5. Ledger : dépôts, consommations, annulations, ajustements
-- ------------------------------------------------------------
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.dangote_credit_ledger'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.dangote_credit_ledger DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.dangote_credit_ledger
  ADD CONSTRAINT dangote_credit_ledger_type_check
  CHECK (type IN ('achat', 'depot', 'consommation', 'annulation', 'remboursement', 'ajustement', 'facture'));

ALTER TABLE public.dangote_credit_ledger
  ADD COLUMN IF NOT EXISTS employe_id UUID REFERENCES public.dangote_employes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repas_id UUID REFERENCES public.dangote_repas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS created_by_username TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_dangote_ledger_entite_date
  ON public.dangote_credit_ledger (entite_id, created_at DESC);

-- ------------------------------------------------------------
-- 6. Budget temps réel (une ligne par entité)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dangote_budget (
  entite_id UUID PRIMARY KEY REFERENCES public.entites(id) ON DELETE CASCADE,
  solde NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.dangote_budget (entite_id, solde)
SELECT entite_id, COALESCE(SUM(montant), 0)
FROM public.dangote_credit_ledger
GROUP BY entite_id
ON CONFLICT (entite_id) DO NOTHING;

-- ------------------------------------------------------------
-- 7. Paiements SycaPay (dépôts de budget)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dangote_paiements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  montant NUMERIC NOT NULL CHECK (montant > 0),
  methode TEXT NOT NULL CHECK (methode IN ('wave', 'mobile_money', 'card', 'cash', 'virement')),
  statut TEXT NOT NULL DEFAULT 'pending' CHECK (statut IN ('pending', 'paid', 'failed', 'cancelled')),
  beneficiaire_type TEXT NOT NULL DEFAULT 'budget_entreprise'
    CHECK (beneficiaire_type IN ('budget_entreprise', 'employe')),
  employe_id UUID REFERENCES public.dangote_employes(id) ON DELETE SET NULL,
  provider TEXT,
  provider_tx TEXT,
  provider_status TEXT,
  provider_url TEXT,
  provider_qr TEXT,
  provider_deep_links TEXT,
  provider_expires_at TIMESTAMPTZ,
  provider_error TEXT,
  provider_event_id TEXT,
  initie_par UUID,
  initie_par_username TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dangote_paiements_provider_event
  ON public.dangote_paiements (provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dangote_paiements_entite_date
  ON public.dangote_paiements (entite_id, created_at DESC);

-- ------------------------------------------------------------
-- 8. Factures / états mensuels
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dangote_factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  periode_debut DATE NOT NULL,
  periode_fin DATE NOT NULL,
  montant_total NUMERIC NOT NULL DEFAULT 0,
  montant_subvention NUMERIC NOT NULL DEFAULT 0,
  montant_retenues NUMERIC NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'emise', 'payee', 'annulee')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entite_id, numero)
);

-- ------------------------------------------------------------
-- 9. Journal d'audit
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dangote_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id) ON DELETE CASCADE,
  acteur_id UUID,
  acteur_username TEXT,
  action TEXT NOT NULL,
  cible_type TEXT,
  cible_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dangote_audit_entite_date
  ON public.dangote_audit_log (entite_id, created_at DESC);

-- ------------------------------------------------------------
-- 10. Seed catégories pour Dangote
-- ------------------------------------------------------------
INSERT INTO public.dangote_categories (entite_id, nom, ordre)
SELECT id, 'Plats principaux', 10 FROM public.entites WHERE slug = 'dangote'
ON CONFLICT (entite_id, nom) DO NOTHING;
INSERT INTO public.dangote_categories (entite_id, nom, ordre)
SELECT id, 'Accompagnements', 20 FROM public.entites WHERE slug = 'dangote'
ON CONFLICT (entite_id, nom) DO NOTHING;
INSERT INTO public.dangote_categories (entite_id, nom, ordre)
SELECT id, 'Boissons', 30 FROM public.entites WHERE slug = 'dangote'
ON CONFLICT (entite_id, nom) DO NOTHING;
INSERT INTO public.dangote_categories (entite_id, nom, ordre)
SELECT id, 'Desserts', 40 FROM public.entites WHERE slug = 'dangote'
ON CONFLICT (entite_id, nom) DO NOTHING;

-- ------------------------------------------------------------
-- 11. Helpers d'autorisation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_is_staff(p_entite_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND u.role IN ('admin', 'rh', 'superviseur-dangote')
      AND (p_entite_id IS NULL OR u.entite_id = p_entite_id OR u.role = 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.dangote_is_rh(p_entite_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND u.role IN ('admin', 'rh')
      AND (p_entite_id IS NULL OR u.entite_id = p_entite_id OR u.role = 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.dangote_current_employee()
RETURNS public.dangote_employes
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.dangote_employes
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Vérifie l'acteur transmis par l'API (appel service_role) ou la session.
CREATE OR REPLACE FUNCTION public.dangote_actor_allowed(
  p_acteur_id UUID,
  p_entite_id UUID,
  p_roles TEXT[]
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.uid() IS NULL OR auth.uid() = p_acteur_id)
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_id = p_acteur_id
        AND u.role = ANY (p_roles)
        AND (u.entite_id = p_entite_id OR u.role = 'admin')
    );
$$;

-- ------------------------------------------------------------
-- 12. RPC : validation d'un repas (atomique)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_valider_repas(
  p_entite_id UUID,
  p_employe_id UUID,
  p_type_repas TEXT,
  p_menu_id UUID DEFAULT NULL,
  p_quantite INTEGER DEFAULT 1,
  p_source TEXT DEFAULT 'qr',
  p_acteur_id UUID DEFAULT NULL,
  p_acteur_username TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employe public.dangote_employes%ROWTYPE;
  v_params public.dangote_parametres%ROWTYPE;
  v_menu public.dangote_menus%ROWTYPE;
  v_repas public.dangote_repas%ROWTYPE;
  v_prix NUMERIC;
  v_total NUMERIC;
  v_subvention NUMERIC := 0;
  v_retenue NUMERIC := 0;
  v_quantite INTEGER;
  v_solde NUMERIC := 0;
  v_repas_jour INTEGER := 0;
  v_subventionnes_jour INTEGER := 0;
  v_repas_mois INTEGER := 0;
  v_subventionnes_mois INTEGER := 0;
  v_depense_jour NUMERIC := 0;
  v_depense_mois NUMERIC := 0;
  v_reference TEXT;
  v_details JSONB;
BEGIN
  IF NOT public.dangote_actor_allowed(
    p_acteur_id, p_entite_id, ARRAY['admin', 'rh', 'superviseur-dangote']
  ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden', 'message', 'Droits insuffisants.');
  END IF;

  IF p_type_repas NOT IN ('standard', 'premium') THEN
    RETURN jsonb_build_object('outcome', 'error', 'message', 'Type de repas invalide.');
  END IF;

  SELECT * INTO v_employe
  FROM public.dangote_employes
  WHERE id = p_employe_id AND entite_id = p_entite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'message', 'Employé introuvable.');
  END IF;
  IF NOT v_employe.actif THEN
    RETURN jsonb_build_object('outcome', 'inactive', 'message', 'Compte employé désactivé.');
  END IF;

  SELECT * INTO v_params
  FROM public.dangote_parametres
  WHERE entite_id = p_entite_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'error', 'message', 'Paramètres du restaurant manquants.');
  END IF;

  v_quantite := GREATEST(1, LEAST(COALESCE(p_quantite, 1), 20));

  IF p_menu_id IS NOT NULL THEN
    SELECT * INTO v_menu
    FROM public.dangote_menus
    WHERE id = p_menu_id AND entite_id = p_entite_id AND actif
      AND date_jour = CURRENT_DATE
    FOR SHARE;
    IF FOUND THEN
      v_prix := v_menu.prix;
    END IF;
  END IF;

  IF v_prix IS NULL THEN
    v_prix := CASE WHEN p_type_repas = 'premium'
      THEN v_params.prix_premium ELSE v_params.prix_standard END;
  END IF;

  IF v_prix IS NULL OR v_prix <= 0 THEN
    RETURN jsonb_build_object('outcome', 'error', 'message', 'Prix du repas non configuré.');
  END IF;

  v_total := v_prix * v_quantite;

  -- Sérialise les validations d'un même employé pour la journée.
  PERFORM pg_advisory_xact_lock(hashtext(p_employe_id::TEXT || CURRENT_DATE::TEXT));

  SELECT COUNT(*) INTO v_repas_jour
  FROM public.dangote_repas
  WHERE employe_id = p_employe_id
    AND date_jour = CURRENT_DATE
    AND statut = 'valide';

  SELECT COUNT(*) INTO v_subventionnes_jour
  FROM public.dangote_repas
  WHERE employe_id = p_employe_id
    AND date_jour = CURRENT_DATE
    AND statut = 'valide'
    AND subvention_appliquee > 0;

  SELECT COUNT(*) INTO v_repas_mois
  FROM public.dangote_repas
  WHERE employe_id = p_employe_id
    AND date_jour >= date_trunc('month', CURRENT_DATE)::DATE
    AND statut = 'valide';

  SELECT COUNT(*) INTO v_subventionnes_mois
  FROM public.dangote_repas
  WHERE employe_id = p_employe_id
    AND date_jour >= date_trunc('month', CURRENT_DATE)::DATE
    AND statut = 'valide'
    AND subvention_appliquee > 0;

  SELECT COALESCE(SUM(retenue_salaire), 0) INTO v_depense_jour
  FROM public.dangote_repas
  WHERE employe_id = p_employe_id
    AND date_jour = CURRENT_DATE
    AND statut = 'valide';

  SELECT COALESCE(SUM(retenue_salaire), 0) INTO v_depense_mois
  FROM public.dangote_repas
  WHERE employe_id = p_employe_id
    AND date_jour >= date_trunc('month', CURRENT_DATE)::DATE
    AND statut = 'valide';

  -- Subvention : premier repas du jour, dans la limite du quota mensuel.
  IF v_params.auto_subvention
     AND v_subventionnes_jour < v_params.quota_repas_jour
     AND v_subventionnes_mois < v_params.quota_repas_mois THEN
    v_subvention := LEAST(v_params.subvention_jour, v_total);
  END IF;

  v_retenue := GREATEST(0, v_total - v_subvention);

  IF v_employe.plafond_journalier IS NOT NULL
     AND v_depense_jour + v_retenue > v_employe.plafond_journalier THEN
    RETURN jsonb_build_object(
      'outcome', 'plafond_journalier',
      'message', 'Plafond journalier atteint pour cet employé.',
      'plafond', v_employe.plafond_journalier,
      'depense', v_depense_jour
    );
  END IF;

  IF v_employe.plafond_mensuel IS NOT NULL
     AND v_depense_mois + v_retenue > v_employe.plafond_mensuel THEN
    RETURN jsonb_build_object(
      'outcome', 'plafond_mensuel',
      'message', 'Plafond mensuel atteint pour cet employé.',
      'plafond', v_employe.plafond_mensuel,
      'depense', v_depense_mois
    );
  END IF;

  INSERT INTO public.dangote_budget (entite_id, solde)
  VALUES (p_entite_id, 0)
  ON CONFLICT (entite_id) DO NOTHING;

  SELECT solde INTO v_solde
  FROM public.dangote_budget
  WHERE entite_id = p_entite_id
  FOR UPDATE;

  IF v_retenue > v_solde THEN
    RETURN jsonb_build_object(
      'outcome', 'budget_insuffisant',
      'message', 'Budget insuffisant. Demandez un nouveau dépôt à la RH.',
      'solde', v_solde,
      'retenue', v_retenue
    );
  END IF;

  v_reference := 'REP-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    || '-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.dangote_repas (
    entite_id, employe_id, menu_id, type_repas, prix,
    subvention_appliquee, retenue_salaire, date_jour,
    est_premier_repas_du_jour, statut, quantite, reference, source,
    superviseur_id, superviseur_username
  ) VALUES (
    p_entite_id, p_employe_id, p_menu_id, p_type_repas, v_total,
    v_subvention, v_retenue, CURRENT_DATE,
    (v_subvention > 0), 'valide', v_quantite, v_reference,
    COALESCE(NULLIF(p_source, ''), 'qr'), p_acteur_id, p_acteur_username
  ) RETURNING * INTO v_repas;

  UPDATE public.dangote_budget
  SET solde = solde - v_retenue, updated_at = NOW()
  WHERE entite_id = p_entite_id;

  INSERT INTO public.dangote_credit_ledger (
    entite_id, type, montant, solde_apres, reference,
    employe_id, repas_id, created_by, created_by_username, metadata
  ) VALUES (
    p_entite_id, 'consommation', -v_retenue, v_solde - v_retenue,
    v_reference, p_employe_id, v_repas.id, p_acteur_id, p_acteur_username,
    jsonb_build_object(
      'type_repas', p_type_repas,
      'prix', v_total,
      'subvention', v_subvention,
      'quantite', v_quantite,
      'employe_matricule', v_employe.matricule
    )
  );

  INSERT INTO public.dangote_audit_log (
    entite_id, acteur_id, acteur_username, action,
    cible_type, cible_id, details
  ) VALUES (
    p_entite_id, p_acteur_id, p_acteur_username, 'repas.valide',
    'dangote_repas', v_repas.id::TEXT,
    jsonb_build_object(
      'employe_id', p_employe_id,
      'matricule', v_employe.matricule,
      'type_repas', p_type_repas,
      'prix', v_total,
      'subvention', v_subvention,
      'retenue', v_retenue,
      'solde_apres', v_solde - v_retenue
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'valide',
    'repas_id', v_repas.id,
    'reference', v_reference,
    'employe_id', p_employe_id,
    'matricule', v_employe.matricule,
    'nom', v_employe.nom,
    'prenom', v_employe.prenom,
    'type_repas', p_type_repas,
    'prix', v_total,
    'subvention', v_subvention,
    'retenue', v_retenue,
    'solde_apres', v_solde - v_retenue,
    'repas_jour', v_repas_jour + 1,
    'subventionnes_jour', v_subventionnes_jour + (CASE WHEN v_subvention > 0 THEN 1 ELSE 0 END),
    'repas_mois', v_repas_mois + 1,
    'subventionnes_mois', v_subventionnes_mois + (CASE WHEN v_subvention > 0 THEN 1 ELSE 0 END)
  );
END $$;

-- ------------------------------------------------------------
-- 13. RPC : annulation d'un repas (remboursement budget)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_annuler_repas(
  p_entite_id UUID,
  p_repas_id UUID,
  p_motif TEXT DEFAULT NULL,
  p_acteur_id UUID DEFAULT NULL,
  p_acteur_username TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_repas public.dangote_repas%ROWTYPE;
  v_solde NUMERIC := 0;
  v_reference TEXT;
BEGIN
  IF NOT public.dangote_actor_allowed(
    p_acteur_id, p_entite_id, ARRAY['admin', 'rh', 'superviseur-dangote']
  ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden', 'message', 'Droits insuffisants.');
  END IF;

  SELECT * INTO v_repas
  FROM public.dangote_repas
  WHERE id = p_repas_id AND entite_id = p_entite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'message', 'Repas introuvable.');
  END IF;
  IF v_repas.statut <> 'valide' THEN
    RETURN jsonb_build_object('outcome', 'already', 'message', 'Ce repas est déjà annulé.');
  END IF;

  UPDATE public.dangote_repas
  SET statut = 'annule',
      annule_par = p_acteur_id,
      annule_le = NOW(),
      motif_annulation = NULLIF(p_motif, ''),
      updated_at = NOW()
  WHERE id = v_repas.id;

  INSERT INTO public.dangote_budget (entite_id, solde)
  VALUES (p_entite_id, 0)
  ON CONFLICT (entite_id) DO NOTHING;

  SELECT solde INTO v_solde
  FROM public.dangote_budget
  WHERE entite_id = p_entite_id
  FOR UPDATE;

  IF v_repas.retenue_salaire > 0 THEN
    UPDATE public.dangote_budget
    SET solde = solde + v_repas.retenue_salaire, updated_at = NOW()
    WHERE entite_id = p_entite_id;

    v_reference := 'ANN-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
      || '-' || substr(md5(random()::text), 1, 6);

    INSERT INTO public.dangote_credit_ledger (
      entite_id, type, montant, solde_apres, reference,
      employe_id, repas_id, created_by, created_by_username, metadata
    ) VALUES (
      p_entite_id, 'annulation', v_repas.retenue_salaire,
      v_solde + v_repas.retenue_salaire, v_reference,
      v_repas.employe_id, v_repas.id, p_acteur_id, p_acteur_username,
      jsonb_build_object('motif', p_motif, 'repas_reference', v_repas.reference)
    );
  END IF;

  INSERT INTO public.dangote_audit_log (
    entite_id, acteur_id, acteur_username, action,
    cible_type, cible_id, details
  ) VALUES (
    p_entite_id, p_acteur_id, p_acteur_username, 'repas.annule',
    'dangote_repas', v_repas.id::TEXT,
    jsonb_build_object(
      'employe_id', v_repas.employe_id,
      'montant_rembourse', v_repas.retenue_salaire,
      'motif', p_motif
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'annule',
    'repas_id', v_repas.id,
    'montant_rembourse', v_repas.retenue_salaire,
    'solde_apres', v_solde + v_repas.retenue_salaire
  );
END $$;

-- ------------------------------------------------------------
-- 14. RPC : dépôt manuel (espèces / virement)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_deposer_budget(
  p_entite_id UUID,
  p_montant NUMERIC,
  p_methode TEXT DEFAULT 'cash',
  p_reference TEXT DEFAULT NULL,
  p_acteur_id UUID DEFAULT NULL,
  p_acteur_username TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solde NUMERIC := 0;
  v_ref TEXT;
BEGIN
  IF NOT public.dangote_actor_allowed(
    p_acteur_id, p_entite_id, ARRAY['admin', 'rh']
  ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden', 'message', 'Droits insuffisants.');
  END IF;

  IF p_montant IS NULL OR p_montant <= 0 THEN
    RETURN jsonb_build_object('outcome', 'error', 'message', 'Montant invalide.');
  END IF;

  INSERT INTO public.dangote_budget (entite_id, solde)
  VALUES (p_entite_id, 0)
  ON CONFLICT (entite_id) DO NOTHING;

  SELECT solde INTO v_solde
  FROM public.dangote_budget
  WHERE entite_id = p_entite_id
  FOR UPDATE;

  v_ref := COALESCE(NULLIF(p_reference, ''),
    'DEP-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    || '-' || substr(md5(random()::text), 1, 6));

  UPDATE public.dangote_budget
  SET solde = solde + p_montant, updated_at = NOW()
  WHERE entite_id = p_entite_id;

  INSERT INTO public.dangote_credit_ledger (
    entite_id, type, montant, solde_apres, reference,
    created_by, created_by_username, metadata
  ) VALUES (
    p_entite_id, 'depot', p_montant, v_solde + p_montant, v_ref,
    p_acteur_id, p_acteur_username,
    COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('methode', p_methode)
  );

  INSERT INTO public.dangote_audit_log (
    entite_id, acteur_id, acteur_username, action,
    cible_type, cible_id, details
  ) VALUES (
    p_entite_id, p_acteur_id, p_acteur_username, 'budget.depot',
    'dangote_budget', p_entite_id::TEXT,
    jsonb_build_object('montant', p_montant, 'methode', p_methode, 'reference', v_ref)
  );

  RETURN jsonb_build_object(
    'outcome', 'depose',
    'reference', v_ref,
    'montant', p_montant,
    'solde_apres', v_solde + p_montant
  );
END $$;

-- ------------------------------------------------------------
-- 15. RPC : règlement d'un paiement SycaPay (idempotent)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_settle_payment(
  p_reference TEXT,
  p_tag TEXT,
  p_provider_tx TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_event_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.dangote_paiements%ROWTYPE;
  v_solde NUMERIC := 0;
BEGIN
  SELECT * INTO v_pay
  FROM public.dangote_paiements
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown', 'reference', p_reference);
  END IF;

  IF v_pay.statut <> 'pending' THEN
    RETURN jsonb_build_object(
      'outcome', 'already', 'reference', p_reference, 'status', v_pay.statut
    );
  END IF;

  UPDATE public.dangote_paiements
  SET provider = COALESCE(provider, 'sycapay'),
      provider_tx = COALESCE(p_provider_tx, provider_tx),
      provider_status = COALESCE(p_status, p_tag),
      provider_event_id = COALESCE(p_event_id, provider_event_id),
      provider_error = CASE
        WHEN p_error_code IS NULL THEN provider_error
        ELSE p_error_code || CASE
          WHEN p_error_message IS NULL THEN ''
          ELSE ' — ' || p_error_message
        END
      END
  WHERE id = v_pay.id;

  IF p_tag IS NULL OR p_tag = 'PENDING' THEN
    RETURN jsonb_build_object(
      'outcome', 'pending', 'reference', p_reference, 'status', v_pay.statut
    );
  END IF;

  IF p_tag <> 'SUCCESS' THEN
    UPDATE public.dangote_paiements
    SET statut = CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
        settled_at = NOW()
    WHERE id = v_pay.id AND statut = 'pending';

    RETURN jsonb_build_object(
      'outcome', 'ignored',
      'reference', p_reference,
      'status', CASE WHEN p_tag = 'CANCELED' THEN 'cancelled' ELSE 'failed' END,
      'errorCode', p_error_code,
      'errorMessage', p_error_message
    );
  END IF;

  INSERT INTO public.dangote_budget (entite_id, solde)
  VALUES (v_pay.entite_id, 0)
  ON CONFLICT (entite_id) DO NOTHING;

  SELECT solde INTO v_solde
  FROM public.dangote_budget
  WHERE entite_id = v_pay.entite_id
  FOR UPDATE;

  UPDATE public.dangote_budget
  SET solde = solde + v_pay.montant, updated_at = NOW()
  WHERE entite_id = v_pay.entite_id;

  INSERT INTO public.dangote_credit_ledger (
    entite_id, type, montant, solde_apres, reference,
    created_by, created_by_username, metadata
  ) VALUES (
    v_pay.entite_id, 'depot', v_pay.montant, v_solde + v_pay.montant,
    v_pay.reference, v_pay.initie_par, v_pay.initie_par_username,
    jsonb_build_object(
      'methode', v_pay.methode,
      'provider', 'sycapay',
      'provider_tx', p_provider_tx
    )
  );

  UPDATE public.dangote_paiements
  SET statut = 'paid', settled_at = NOW()
  WHERE id = v_pay.id AND statut = 'pending';

  INSERT INTO public.dangote_audit_log (
    entite_id, acteur_id, acteur_username, action,
    cible_type, cible_id, details
  ) VALUES (
    v_pay.entite_id, v_pay.initie_par, v_pay.initie_par_username,
    'budget.paiement_recu', 'dangote_paiement', v_pay.id::TEXT,
    jsonb_build_object(
      'montant', v_pay.montant,
      'reference', v_pay.reference,
      'methode', v_pay.methode,
      'provider_tx', p_provider_tx,
      'solde_apres', v_solde + v_pay.montant
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'settled',
    'reference', p_reference,
    'status', 'paid',
    'amount', v_pay.montant,
    'balance', v_solde + v_pay.montant
  );
END $$;

-- ------------------------------------------------------------
-- 16. RPC : rotation du QR employé
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_rotate_qr(
  p_entite_id UUID,
  p_employe_id UUID,
  p_acteur_id UUID DEFAULT NULL,
  p_acteur_username TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_employe public.dangote_employes%ROWTYPE;
BEGIN
  IF NOT public.dangote_actor_allowed(
    p_acteur_id, p_entite_id, ARRAY['admin', 'rh']
  ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden', 'message', 'Droits insuffisants.');
  END IF;

  SELECT * INTO v_employe
  FROM public.dangote_employes
  WHERE id = p_employe_id AND entite_id = p_entite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'message', 'Employé introuvable.');
  END IF;

  v_token := 'DGT-' || UPPER(substr(md5(random()::text || clock_timestamp()::text), 1, 16));

  UPDATE public.dangote_employes
  SET qr_token = v_token, qr_rotated_at = NOW(), updated_at = NOW()
  WHERE id = v_employe.id;

  INSERT INTO public.dangote_audit_log (
    entite_id, acteur_id, acteur_username, action,
    cible_type, cible_id, details
  ) VALUES (
    p_entite_id, p_acteur_id, p_acteur_username, 'employe.qr_rotate',
    'dangote_employe', v_employe.id::TEXT,
    jsonb_build_object('matricule', v_employe.matricule)
  );

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'employe_id', v_employe.id,
    'qr_token', v_token
  );
END $$;

-- ------------------------------------------------------------
-- 17. RPC : statistiques de pilotage
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dangote_stats(
  p_entite_id UUID,
  p_debut DATE DEFAULT CURRENT_DATE,
  p_fin DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.dangote_is_staff(p_entite_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Droits insuffisants.');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'debut', p_debut,
    'fin', p_fin,
    'solde', COALESCE((SELECT solde FROM public.dangote_budget WHERE entite_id = p_entite_id), 0),
    'employes_actifs', (
      SELECT COUNT(*) FROM public.dangote_employes
      WHERE entite_id = p_entite_id AND actif
    ),
    'repas', COALESCE((
      SELECT COUNT(*) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide'
    ), 0),
    'repas_standard', COALESCE((
      SELECT COUNT(*) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide' AND type_repas = 'standard'
    ), 0),
    'repas_premium', COALESCE((
      SELECT COUNT(*) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide' AND type_repas = 'premium'
    ), 0),
    'chiffre_affaires', COALESCE((
      SELECT SUM(prix) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide'
    ), 0),
    'subventions', COALESCE((
      SELECT SUM(subvention_appliquee) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide'
    ), 0),
    'retenues', COALESCE((
      SELECT SUM(retenue_salaire) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide'
    ), 0),
    'participants', COALESCE((
      SELECT COUNT(DISTINCT employe_id) FROM public.dangote_repas
      WHERE entite_id = p_entite_id
        AND date_jour BETWEEN p_debut AND p_fin
        AND statut = 'valide'
    ), 0),
    'par_service', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(e.service, 'Non affecté') AS service,
               COUNT(*) AS repas,
               COALESCE(SUM(r.retenue_salaire), 0) AS retenues
        FROM public.dangote_repas r
        JOIN public.dangote_employes e ON e.id = r.employe_id
        WHERE r.entite_id = p_entite_id
          AND r.date_jour BETWEEN p_debut AND p_fin
          AND r.statut = 'valide'
        GROUP BY COALESCE(e.service, 'Non affecté')
        ORDER BY repas DESC
      ) t
    ), '[]'::JSONB),
    'par_jour', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT date_jour,
               COUNT(*) AS repas,
               COALESCE(SUM(prix), 0) AS chiffre_affaires,
               COALESCE(SUM(retenue_salaire), 0) AS retenues
        FROM public.dangote_repas
        WHERE entite_id = p_entite_id
          AND date_jour BETWEEN p_debut AND p_fin
          AND statut = 'valide'
        GROUP BY date_jour
        ORDER BY date_jour
      ) t
    ), '[]'::JSONB)
  ) INTO v_result;

  RETURN v_result;
END $$;

-- ------------------------------------------------------------
-- 18. RLS : isolation par entité et par rôle
-- ------------------------------------------------------------
ALTER TABLE public.dangote_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_achats_talons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_repas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_plats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_menu_plats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_audit_log ENABLE ROW LEVEL SECURITY;

-- Supprime l'ancienne politique trop permissive (FOR ALL entite_id).
DROP POLICY IF EXISTS entite_iso ON public.dangote_parametres;
DROP POLICY IF EXISTS entite_iso ON public.dangote_employes;
DROP POLICY IF EXISTS entite_iso ON public.dangote_achats_talons;
DROP POLICY IF EXISTS entite_iso ON public.dangote_documents;
DROP POLICY IF EXISTS entite_iso ON public.dangote_credit_ledger;
DROP POLICY IF EXISTS entite_iso ON public.dangote_repas;

-- Paramètres : lecture par tous les membres de l'entité, écriture RH/admin.
DROP POLICY IF EXISTS dangote_params_select ON public.dangote_parametres;
CREATE POLICY dangote_params_select ON public.dangote_parametres
  FOR SELECT USING (
    entite_id = public.current_entite_id() OR public.dangote_is_staff(entite_id)
  );
DROP POLICY IF EXISTS dangote_params_write ON public.dangote_parametres;
CREATE POLICY dangote_params_write ON public.dangote_parametres
  FOR ALL USING (public.dangote_is_rh(entite_id))
  WITH CHECK (public.dangote_is_rh(entite_id));

-- Employés : chacun voit sa fiche, le staff voit tout.
DROP POLICY IF EXISTS dangote_employe_self ON public.dangote_employes;
CREATE POLICY dangote_employe_self ON public.dangote_employes
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS dangote_employe_superviseur ON public.dangote_employes;
DROP POLICY IF EXISTS dangote_employe_rh ON public.dangote_employes;
DROP POLICY IF EXISTS dangote_employes_staff_select ON public.dangote_employes;
CREATE POLICY dangote_employes_staff_select ON public.dangote_employes
  FOR SELECT USING (public.dangote_is_staff(entite_id));
DROP POLICY IF EXISTS dangote_employes_staff_write ON public.dangote_employes;
DROP POLICY IF EXISTS dangote_employes_rh_write ON public.dangote_employes;
CREATE POLICY dangote_employes_rh_write ON public.dangote_employes
  FOR ALL USING (public.dangote_is_rh(entite_id))
  WITH CHECK (public.dangote_is_rh(entite_id));

-- Repas : l'employé lit les siens, le staff lit tout. Écriture via RPC.
DROP POLICY IF EXISTS dangote_repas_employe ON public.dangote_repas;
CREATE POLICY dangote_repas_employe ON public.dangote_repas
  FOR SELECT USING (
    employe_id IN (
      SELECT id FROM public.dangote_employes WHERE user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS dangote_repas_staff ON public.dangote_repas;
CREATE POLICY dangote_repas_staff ON public.dangote_repas
  FOR SELECT USING (public.dangote_is_staff(entite_id));

-- Ledger, budget, paiements, audit : staff uniquement.
DROP POLICY IF EXISTS dangote_ledger_staff ON public.dangote_credit_ledger;
CREATE POLICY dangote_ledger_staff ON public.dangote_credit_ledger
  FOR SELECT USING (public.dangote_is_staff(entite_id));

DROP POLICY IF EXISTS dangote_budget_staff ON public.dangote_budget;
CREATE POLICY dangote_budget_staff ON public.dangote_budget
  FOR SELECT USING (public.dangote_is_staff(entite_id));

DROP POLICY IF EXISTS dangote_paiements_staff ON public.dangote_paiements;
CREATE POLICY dangote_paiements_staff ON public.dangote_paiements
  FOR SELECT USING (public.dangote_is_staff(entite_id));

DROP POLICY IF EXISTS dangote_audit_rh ON public.dangote_audit_log;
CREATE POLICY dangote_audit_rh ON public.dangote_audit_log
  FOR SELECT USING (public.dangote_is_rh(entite_id));

-- Catalogue : lecture par tous, écriture staff.
DROP POLICY IF EXISTS dangote_categories_select ON public.dangote_categories;
CREATE POLICY dangote_categories_select ON public.dangote_categories
  FOR SELECT USING (
    entite_id = public.current_entite_id() OR public.dangote_is_staff(entite_id)
  );
DROP POLICY IF EXISTS dangote_categories_write ON public.dangote_categories;
CREATE POLICY dangote_categories_write ON public.dangote_categories
  FOR ALL USING (public.dangote_is_rh(entite_id))
  WITH CHECK (public.dangote_is_rh(entite_id));

DROP POLICY IF EXISTS dangote_plats_select ON public.dangote_plats;
CREATE POLICY dangote_plats_select ON public.dangote_plats
  FOR SELECT USING (
    entite_id = public.current_entite_id() OR public.dangote_is_staff(entite_id)
  );
DROP POLICY IF EXISTS dangote_plats_write ON public.dangote_plats;
CREATE POLICY dangote_plats_write ON public.dangote_plats
  FOR ALL USING (public.dangote_is_rh(entite_id))
  WITH CHECK (public.dangote_is_rh(entite_id));

DROP POLICY IF EXISTS dangote_menus_select ON public.dangote_menus;
CREATE POLICY dangote_menus_select ON public.dangote_menus
  FOR SELECT USING (
    entite_id = public.current_entite_id() OR public.dangote_is_staff(entite_id)
  );
DROP POLICY IF EXISTS dangote_menus_write ON public.dangote_menus;
CREATE POLICY dangote_menus_write ON public.dangote_menus
  FOR ALL USING (public.dangote_is_rh(entite_id))
  WITH CHECK (public.dangote_is_rh(entite_id));

DROP POLICY IF EXISTS dangote_menu_plats_select ON public.dangote_menu_plats;
CREATE POLICY dangote_menu_plats_select ON public.dangote_menu_plats
  FOR SELECT USING (
    menu_id IN (
      SELECT id FROM public.dangote_menus
      WHERE entite_id = public.current_entite_id() OR public.dangote_is_staff(entite_id)
    )
  );
DROP POLICY IF EXISTS dangote_menu_plats_write ON public.dangote_menu_plats;
CREATE POLICY dangote_menu_plats_write ON public.dangote_menu_plats
  FOR ALL USING (
    menu_id IN (
      SELECT id FROM public.dangote_menus WHERE public.dangote_is_rh(entite_id)
    )
  )
  WITH CHECK (
    menu_id IN (
      SELECT id FROM public.dangote_menus WHERE public.dangote_is_rh(entite_id)
    )
  );

-- Factures : RH/admin.
DROP POLICY IF EXISTS dangote_factures_rh ON public.dangote_factures;
CREATE POLICY dangote_factures_rh ON public.dangote_factures
  FOR ALL USING (public.dangote_is_rh(entite_id))
  WITH CHECK (public.dangote_is_rh(entite_id));

-- Anciens achats de talons / documents : staff.
DROP POLICY IF EXISTS dangote_talons_staff ON public.dangote_achats_talons;
CREATE POLICY dangote_talons_staff ON public.dangote_achats_talons
  FOR ALL USING (public.dangote_is_staff(entite_id))
  WITH CHECK (public.dangote_is_staff(entite_id));
DROP POLICY IF EXISTS dangote_documents_staff ON public.dangote_documents;
CREATE POLICY dangote_documents_staff ON public.dangote_documents
  FOR ALL USING (public.dangote_is_staff(entite_id))
  WITH CHECK (public.dangote_is_staff(entite_id));

-- ------------------------------------------------------------
-- 19. Droits d'exécution
-- ------------------------------------------------------------
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut : on le retire d'abord,
-- sinon n'importe quel client anon/authenticated pourrait appeler les RPC
-- SECURITY DEFINER, notamment dangote_settle_payment.
REVOKE ALL ON FUNCTION public.dangote_is_staff(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_is_rh(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_current_employee() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_actor_allowed(UUID, UUID, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_valider_repas(UUID, UUID, TEXT, UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_annuler_repas(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_deposer_budget(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_settle_payment(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dangote_rotate_qr(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dangote_stats(UUID, DATE, DATE) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dangote_is_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dangote_is_rh(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dangote_current_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dangote_actor_allowed(UUID, UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dangote_valider_repas(UUID, UUID, TEXT, UUID, INTEGER, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dangote_annuler_repas(UUID, UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dangote_deposer_budget(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dangote_settle_payment(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dangote_rotate_qr(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dangote_stats(UUID, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 20. Rechargement du cache de schéma PostgREST
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
