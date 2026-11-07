-- Migration module REPAS DANGOTE (réversible)

-- 1. Étendre le rôle users pour inclure 'dch'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('client','personnel','gestionnaire','admin','dch'));

-- 2. Paramètres par entité
CREATE TABLE IF NOT EXISTS public.dangote_parametres (
  entite_id UUID PRIMARY KEY REFERENCES public.entites(id),
  prix_standard NUMERIC NOT NULL DEFAULT 1400,
  prix_premium NUMERIC NOT NULL DEFAULT 2300,
  subvention_jour NUMERIC NOT NULL DEFAULT 750,
  valeur_ticket NUMERIC NOT NULL DEFAULT 1400,
  tickets_par_talon INTEGER NOT NULL DEFAULT 10
);

-- 3. Employés
CREATE TABLE IF NOT EXISTS public.dangote_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id),
  matricule TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  service TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  qr_token TEXT UNIQUE NOT NULL,
  qr_revoque_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entite_id, matricule)
);

-- 4. Achats de talons
CREATE TABLE IF NOT EXISTS public.dangote_achats_talons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id),
  numero TEXT NOT NULL,
  nb_talons INTEGER NOT NULL,
  nb_tickets INTEGER NOT NULL,
  montant_total NUMERIC NOT NULL,
  statut TEXT NOT NULL DEFAULT 'proforma'
    CHECK (statut IN ('proforma','commande','facture','livre','annule')),
  cree_par TEXT,
  date_proforma TIMESTAMPTZ,
  date_commande TIMESTAMPTZ,
  date_facture TIMESTAMPTZ,
  date_livraison TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Documents
CREATE TABLE IF NOT EXISTS public.dangote_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id),
  achat_id UUID NOT NULL REFERENCES public.dangote_achats_talons(id),
  type TEXT NOT NULL CHECK (type IN ('proforma','bon_commande','facture_definitive','bon_livraison')),
  numero TEXT NOT NULL,
  chemin_pdf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entite_id, type, numero)
);

-- 6. Ledger crédit (append-only)
CREATE TABLE IF NOT EXISTS public.dangote_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id),
  type TEXT NOT NULL CHECK (type IN ('achat','consommation','annulation')),
  montant NUMERIC NOT NULL,
  solde_apres NUMERIC NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Repas
CREATE TABLE IF NOT EXISTS public.dangote_repas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entite_id UUID NOT NULL REFERENCES public.entites(id),
  employe_id UUID NOT NULL REFERENCES public.dangote_employes(id),
  caisse_id TEXT,
  type_repas TEXT NOT NULL CHECK (type_repas IN ('standard','premium')),
  prix NUMERIC NOT NULL,
  subvention_appliquee NUMERIC NOT NULL DEFAULT 0,
  retenue_salaire NUMERIC NOT NULL,
  date_jour DATE NOT NULL,
  est_premier_repas_du_jour BOOLEAN NOT NULL DEFAULT false,
  statut TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('valide','annule')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contrainte d'unicité partielle : un seul repas subventionné par jour/employé
CREATE UNIQUE INDEX IF NOT EXISTS dangote_repas_subvention_unique
  ON public.dangote_repas (employe_id, date_jour)
  WHERE subvention_appliquee > 0 AND statut = 'valide';

-- Seed params pour Dangote
INSERT INTO public.dangote_parametres (entite_id)
SELECT id FROM public.entites WHERE slug = 'dangote'
ON CONFLICT (entite_id) DO NOTHING;

-- RLS
ALTER TABLE public.dangote_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_achats_talons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dangote_repas ENABLE ROW LEVEL SECURITY;

-- Policies : isolation par entité
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['dangote_parametres','dangote_employes','dangote_achats_talons','dangote_documents','dangote_credit_ledger','dangote_repas'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'entite_iso', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (entite_id = public.current_entite_id()) WITH CHECK (entite_id = public.current_entite_id())', 'entite_iso', t);
  END LOOP;
END $$;

-- Rollback (manuel) : DROP TABLE ... ; DROP FUNCTION ...
