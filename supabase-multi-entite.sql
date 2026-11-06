-- Migration multi-entités O RESTO (réversible : voir section ROLLBACK en fin de fichier)

-- 1. Table des entités
CREATE TABLE IF NOT EXISTS public.entites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed idempotent
INSERT INTO public.entites (nom, slug, statut)
VALUES ('GROUPE ISM', 'groupe-ism', 'actif')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.entites (nom, slug, statut)
VALUES ('DANGOTE', 'dangote', 'actif')
ON CONFLICT (slug) DO NOTHING;

-- 2. Ajout entite_id sur toutes les tables métier
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users','orders','products','children','establishments','finance_expenses',
    'finance_settings','formulas','oresto_payments','parent_profiles','reclamations',
    'reclamation_messages','subscriptions','sycapay_events','validations',
    'wallet_transactions','wallets','weekly_menus','kiosk_orders','oresto_payment_groups',
    'classes','import_batches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS entite_id UUID', t);
      -- rattacher les lignes existantes à Groupe ISM
      EXECUTE format('UPDATE public.%I SET entite_id = (SELECT id FROM public.entites WHERE slug=''groupe-ism'') WHERE entite_id IS NULL', t);
    END IF;
  END LOOP;
END $$;

-- Fonction helper : entité de l'utilisateur connecté (après ajout de la colonne)
CREATE OR REPLACE FUNCTION public.current_entite_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT entite_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- 3. Contraintes FK + NOT NULL (sauf tables où l'absence est possible)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users','orders','products','children','establishments','finance_expenses',
    'finance_settings','formulas','oresto_payments','parent_profiles','reclamations',
    'reclamation_messages','subscriptions','sycapay_events','validations',
    'wallet_transactions','wallets','weekly_menus','kiosk_orders','oresto_payment_groups',
    'classes','import_batches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (entite_id) REFERENCES public.entites(id)', t, t||'_entite_fk');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN entite_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- 4. RLS : isolation par entité
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users','orders','products','children','establishments','finance_expenses',
    'finance_settings','formulas','oresto_payments','parent_profiles','reclamations',
    'reclamation_messages','subscriptions','sycapay_events','validations',
    'wallet_transactions','wallets','weekly_menus','kiosk_orders','oresto_payment_groups',
    'classes','import_batches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'entite_isolation_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'entite_isolation_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'entite_isolation_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'entite_isolation_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (entite_id = public.current_entite_id())', 'entite_isolation_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (entite_id = public.current_entite_id())', 'entite_isolation_insert', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (entite_id = public.current_entite_id()) WITH CHECK (entite_id = public.current_entite_id())', 'entite_isolation_update', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (entite_id = public.current_entite_id())', 'entite_isolation_delete', t);
    END IF;
  END LOOP;
END $$;

-- ROLLBACK (manuel) :
-- DROP POLICY ... ; ALTER TABLE ... DROP COLUMN entite_id; DROP FUNCTION public.current_entite_id(); DROP TABLE public.entites;
-- RLS pour la table entites
ALTER TABLE public.entites ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin');
$$;
DROP POLICY IF EXISTS entites_select ON public.entites;
DROP POLICY IF EXISTS entites_insert ON public.entites;
DROP POLICY IF EXISTS entites_update ON public.entites;
DROP POLICY IF EXISTS entites_delete ON public.entites;
CREATE POLICY entites_select ON public.entites FOR SELECT USING (true);
CREATE POLICY entites_insert ON public.entites FOR INSERT WITH CHECK (public.is_platform_admin());
CREATE POLICY entites_update ON public.entites FOR UPDATE USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY entites_delete ON public.entites FOR DELETE USING (public.is_platform_admin());
-- Mise � jour RLS entites : superviseur peut aussi cr�er/g�rer
CREATE OR REPLACE FUNCTION public.can_manage_entities()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role IN ('admin','personnel'));
$$;
DROP POLICY IF EXISTS entites_insert ON public.entites;
DROP POLICY IF EXISTS entites_update ON public.entites;
DROP POLICY IF EXISTS entites_delete ON public.entites;
CREATE POLICY entites_insert ON public.entites FOR INSERT WITH CHECK (public.can_manage_entities());
CREATE POLICY entites_update ON public.entites FOR UPDATE USING (public.can_manage_entities()) WITH CHECK (public.can_manage_entities());
CREATE POLICY entites_delete ON public.entites FOR DELETE USING (public.can_manage_entities());
