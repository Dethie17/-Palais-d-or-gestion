-- ============================================================================
-- O RESTO — CORRECTION « La table des paiements n'existe pas encore »
-- (octobre 2026)
-- ============================================================================
-- À exécuter AVANT supabase-o-resto-final-2026.sql : le script de
-- consolidation part du principe que la table de base existe (il la modifie,
-- jamais la crée). Si elle manque, ce bloc la pose avec TOUTES les colonnes
-- que l'application écrit (SycaPay, règlement comptoir, historique), puis
-- les index et les règles d'accès RLS.
--
-- Idempotent : ce bloc peut être rejoué sans risque (aucune donnée effacée,
-- chaque instruction vérifie avant d'agir).
--
-- Après ce bloc, exécutez EN ENTIER supabase-o-resto-final-2026.sql
-- (vue comptable v_paiements_valides, RPC règlement comptoir settle_payment,
-- pivot d'identité, matrice RLS complète). Il est aussi idempotent.
--
-- Pré-requis : la table public.children et les fonctions
-- public.current_app_username() / public.is_staff() existent déjà dans la
-- base (posées à la livraison ; les écrans enfants/parents fonctionnent).
-- ============================================================================

-- 1. TABLE DE BASE ----------------------------------------------------------
create table if not exists public.oresto_payments (
  id           text primary key,
  subscription_id text references public.subscriptions(id),
  client_username text,
  formula_id      text,
  amount          numeric not null,
  method          text not null default 'cash',
  status          text not null default 'pending',
  reference       text unique,
  qr_token        text,
  created_at      timestamptz not null default now()
);

-- 2. COLONNES COMPLÉMENTAIRES (colonnes SycaPay + horodatage du règlement) ---
alter table public.oresto_payments add column if not exists child_id text;
alter table public.oresto_payments add column if not exists paid_at timestamptz;
alter table public.oresto_payments add column if not exists settled_at timestamptz;
alter table public.oresto_payments add column if not exists idempotency_key text;
alter table public.oresto_payments add column if not exists provider text;
alter table public.oresto_payments add column if not exists provider_tx text;
alter table public.oresto_payments add column if not exists provider_status text;
alter table public.oresto_payments add column if not exists provider_error text;
alter table public.oresto_payments add column if not exists provider_url text;
alter table public.oresto_payments add column if not exists provider_qr text;
alter table public.oresto_payments add column if not exists provider_deep_links text;
alter table public.oresto_payments add column if not exists provider_expires_at timestamptz;

-- 3. CONTRAINTES (créées seulement si absentes) ------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oresto_payments_method_check') then
    execute 'alter table public.oresto_payments add constraint oresto_payments_method_check
      check (method in (''cash'',''wave'',''mobile_money'',''card'',''balance''))';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oresto_payments_status_check') then
    execute 'alter table public.oresto_payments add constraint oresto_payments_status_check
      check (status in (''pending'',''paid'',''failed'',''cancelled'',''refunded''))';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oresto_payments_child_fk') then
    execute 'alter table public.oresto_payments add constraint oresto_payments_child_fk
      foreign key (child_id) references public.children(id)';
  end if;
end $$;

-- 4. INDEX -------------------------------------------------------------------
create unique index if not exists oresto_payments_reference_key
  on public.oresto_payments (reference);
create unique index if not exists oresto_payments_idempotency_key_key
  on public.oresto_payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists oresto_payments_provider_tx_key
  on public.oresto_payments (provider, provider_tx) where provider_tx is not null;
create index if not exists idx_payments_client on public.oresto_payments (client_username);
create index if not exists idx_payments_child on public.oresto_payments (child_id);
create index if not exists idx_payments_sub on public.oresto_payments (subscription_id);
create index if not exists idx_payments_created on public.oresto_payments (created_at desc);
create index if not exists idx_payments_paid_at on public.oresto_payments (paid_at);
create index if not exists idx_payments_provider_tx on public.oresto_payments (provider, provider_tx);
create index if not exists idx_payments_pending on public.oresto_payments (status) where status = 'pending';

-- 5. ACCÈS (RLS) -------------------------------------------------------------
-- Lecture : le personnel voit tout, un parent les siens.
-- Insertion : un parent ne peut pas se créer un règlement « paid » lui-même.
-- Mise à jour : le personnel partout ; le parent uniquement la correction
-- de sa DEmande non réglée. Suppression : personne (comptabilité).
alter table public.oresto_payments enable row level security;
revoke all on public.oresto_payments from anon;

drop policy if exists payments_read on public.oresto_payments;
create policy payments_read on public.oresto_payments for select
  using (public.is_staff() or client_username = public.current_app_username());

drop policy if exists payments_insert on public.oresto_payments;
create policy payments_insert on public.oresto_payments for insert
  with check (public.is_staff() or (auth.uid() is not null and status <> 'paid'));

drop policy if exists payments_update on public.oresto_payments;
create policy payments_update on public.oresto_payments for update
  using (public.is_staff() or client_username = public.current_app_username())
  with check (public.is_staff() or (client_username = public.current_app_username()
             and status <> 'paid'));

grant select, insert, update on public.oresto_payments to authenticated;
grant all on public.oresto_payments to service_role;

-- 6. CONTRÔLE FINAL ----------------------------------------------------------
-- Doit renvoyer une ligne : la table existe et est lisible.
select
  count(*)                                as lignes,
  count(*) filter (where status = 'paid') as encaissees,
  coalesce(sum(amount) filter (where status = 'paid'), 0) as total_fcfa
from public.oresto_payments;
