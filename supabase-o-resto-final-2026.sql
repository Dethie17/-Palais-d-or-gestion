-- ============================================================================
-- O RESTO — CONSOLIDATION BASE 2026
-- ============================================================================
-- À exécuter UNE fois, en entier, dans le Supabase SQL Editor (production).
-- Idempotent : chaque bloc vérifie avant d'agir, rejouer ne casse rien.
--
-- Ce script REMPLACE (et n'est pas additionné à) les anciens
-- supabase-security.sql / supabase-parents-import.sql / supabase-reclamations.sql
-- pour tout ce qui suit. Aucune table n'est supprimée ; aucun paiement
-- n'est effacé.
--
-- Ordre des sections : chacune dépend de la précédente :
--   1. PIVOT identité : users.auth_id (colonne, index, rattachement par email)
--   2. ARGENT : paid_at / settled_at, vue v_paiements_valides, RPC, settle_payment
--   3. CARTES : jetons QR 128 bits (enfants + abonnements)
--   4. JOURNAL : table import_batches
--   5. UNICITÉS : noms de comptes, enfants doublés, abonnement actif unique, références
--   6. RLS : fermeture des accès anonymes, politiques par table, storage
--   7. RAPPORTS : contrôle final
--
-- Après exécution : CHAQUE compte existant doit se reconnecter une fois
-- (login parent par numéro, login personnel par pseudo) — l'application y
-- écrira users.auth_id toute seule et complètera le rattachement.
-- ============================================================================


-- ============================================================================
-- 1. PIVOT IDENTITÉ — users.auth_id
-- ============================================================================
-- C'est la colonne qui relie une fiche métier (parent, personnel) à son
-- compte d'authentification Supabase auth.users. TOUTE la matrice RLS
-- ci-dessous en dépend : sans elle, une session ne peut pas prouver
-- quelle ligne la regarde.

alter table public.users add column if not exists auth_id uuid;

-- Un compte d'authentification = un seul profil. L'index partiel évite
-- l'aliasing avant la pose.
create unique index if not exists users_auth_id_key
  on public.users (auth_id)
  where auth_id is not null;

-- Rattachement par l'adresse Auth « <username>@oresto-sn.com » :
-- c'est le domaine que l'application pose quand elle crée les comptes
-- (AUTH_EMAIL_DOMAIN par défaut : oresto-sn.com). Le créneau protège le
-- premier profil inscrit : en cas de collision, le compte est plutôt
-- corrigé à la main ou refait par re-connexion dans l'application.
do $$
begin
  update public.users u
     set auth_id = a.id
    from auth.users a
   where u.auth_id is null
     and a.email = u.username || '@oresto-sn.com'
     and not exists (select 1 from public.users u2 where u2.auth_id = a.id);
end $$;

-- Anciens libellés : conversion définitive (rôles historiques). AVANT la
-- contrainte de rôles, sinon les lignes historiques la feraient échouer.
update public.users set role = 'gestionnaire' where role = 'caissier';
update public.users set role = 'admin'       where role = 'manager';
update public.users set role = 'personnel'   where role = 'superviseur';

-- Le rôle métier ne tolère que les quatre rôles canoniques.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_allowed'
  ) then
    alter table public.users add constraint users_role_allowed
      check (role in ('client', 'personnel', 'gestionnaire', 'admin'));
  end if;
end $$;

-- Privilèges de la table users : le mot de passe métier n'est lisible que par
-- service_role. L'application ne s'en sert plus (les connexions passent par
-- le serveur d'authentification).
revoke all on table public.users from anon;
revoke all on table public.users from authenticated;
grant select (id, username, role, auth_id, establishment_id, qr_token) on public.users to authenticated;
grant update (username, role, establishment_id, qr_token)            on public.users to authenticated;
grant insert (username, role, auth_id, qr_token, establishment_id)   on public.users to authenticated;
-- Un profil ne se supprime pas depuis le navigateur (route serveur de DAF).
revoke delete on table public.users from authenticated;


-- ============================================================================
-- 2. ARGENT — horodatage de règlement, vue validée, RPC, règlement comptoir
-- ============================================================================
-- La règle comptable unique : est réglé un paiement
--   status = 'paid' ET settled_at IS NOT NULL
-- et settled_at n'est écrit QUE par le serveur (webhook, comptoir via
-- /api/finance/settle-payment). Le navigateur n'y touche jamais.

alter table public.oresto_payments add column if not exists settled_at timestamptz;
alter table public.oresto_payments add column if not exists paid_at timestamptz;
alter table public.oresto_payments add column if not exists idempotency_key text;

-- Historique : les « paid » d'avant la colonne sont ratifiés
-- rétroactivement (encaissements caisse/comptoir et règlements SycaPay
-- déjà consommés dans le réel).
update public.oresto_payments
   set paid_at    = coalesce(paid_at, settled_at, created_at),
       settled_at = coalesce(settled_at, paid_at, created_at)
 where status = 'paid';

-- Les références de paiement sont uniques (doublons historiques : suffixés,
-- le premier garde son nom ; ces renuméros ne concernent QUE les doublons).
do $$
declare
  r record;
begin
  for r in
    select reference, array_agg(id order by created_at, id) as ids
      from public.oresto_payments
     where reference is not null
     group by reference
    having count(*) > 1
  loop
    for i in 2..array_length(r.ids, 1) loop
      update public.oresto_payments
         set reference = reference || '-' || r.ids[i]
       where id = r.ids[i];
    end loop;
  end loop;
end $$;

create unique index if not exists oresto_payments_reference_key
  on public.oresto_payments (reference);
create unique index if not exists oresto_payments_idempotency_key_key
  on public.oresto_payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists oresto_payments_provider_tx_key
  on public.oresto_payments (provider, provider_tx) where provider_tx is not null;

-- Vue de référence de la comptabilité. `select *` volontaire : le schéma des
-- paiements évolue (colonnes SycaPay) sans casse ; security_invoker pour que
-- les politiques RLS des paiements s'appliquent au lecteur de la vue.
create or replace view public.v_paiements_valides
  with (security_invoker = true)
as
  select *
    from public.oresto_payments
   where status = 'paid' and settled_at is not null;

-- Abonnés actifs pour les compteurs des tableaux.
create or replace view public.v_abonnes_actifs
  with (security_invoker = true)
as
  select s.*
    from public.subscriptions s
   where s.status = 'active' and s.end_date >= current_date;

-- Courts-circuits KPI : sommes sur paiements VALIDÉS seulement.
create or replace function public.rpc_ca_periode(p_start date default null, p_end date default null)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_total numeric := 0;
begin
  -- Garde : la comptabilité n'est pas une lecture de parent.
  if not coalesce(
    (select u.role in ('admin', 'personnel', 'gestionnaire')
       from public.users u
      where u.auth_id = auth.uid()),
    false) then
    raise insufficient_privilege;
  end if;
  select coalesce(sum(amount), 0) into v_total
    from public.v_paiements_valides
   where (p_start is null or coalesce(paid_at, settled_at, created_at)::date >= p_start)
     and (p_end   is null or coalesce(paid_at, settled_at, created_at)::date <= p_end);
  return v_total;
end $$;

create or replace function public.rpc_dashboard_kpis()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ca_jour numeric; v_ca_mois numeric; v_count integer; v_abonnes integer;
begin
  if not coalesce(
    (select u.role in ('admin', 'personnel', 'gestionnaire')
       from public.users u
      where u.auth_id = auth.uid()),
    false) then
    raise insufficient_privilege;
  end if;
  select coalesce(sum(amount), 0) into v_ca_jour
    from public.v_paiements_valides
   where coalesce(paid_at, settled_at, created_at)::date = current_date;
  select coalesce(sum(amount), 0) into v_ca_mois
    from public.v_paiements_valides
   where date_trunc('month', coalesce(paid_at, settled_at, created_at))
       = date_trunc('month', current_date);
  select count(*) into v_count from public.v_paiements_valides;
  select count(*) into v_abonnes from public.v_abonnes_actifs;
  return jsonb_build_object(
    'ca_jour', v_ca_jour,
    'ca_mois', v_ca_mois,
    'paiements_valides_count', v_count,
    'abonnes_actifs', v_abonnes);
end $$;

revoke all on function public.rpc_ca_periode(date, date)    from public, anon;
revoke all on function public.rpc_dashboard_kpis()          from public, anon;
grant  execute on function public.rpc_ca_periode(date, date) to authenticated, service_role;
grant  execute on function public.rpc_dashboard_kpis()       to authenticated, service_role;

-- RÈGLEMENT COMPTOIR — le seul accès d'écriture de l'horodatage (service).
-- Idempotent : un paiement déjà réglé est retourné tel quel.
create or replace function public.settle_payment(p_payment_id text)
returns public.oresto_payments
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.oresto_payments;
begin
  if p_payment_id is null or btrim(p_payment_id) = '' then
    raise exception 'identifiant de paiement manquant' using errcode = '22023';
  end if;
  select * into v_row from public.oresto_payments where id = p_payment_id for update;
  if not found then
    raise exception 'paiement introuvable: %', p_payment_id using errcode = 'P0002';
  end if;
  if v_row.status = 'paid' and v_row.settled_at is not null then
    return v_row;
  end if;
  update public.oresto_payments
     set status = 'paid',
         paid_at = coalesce(paid_at, now()),
         settled_at = now()
   where id = p_payment_id
   returning * into v_row;
  return v_row;
end $$;

revoke all on function public.settle_payment(text) from public, anon, authenticated;
grant  execute on function public.settle_payment(text) to service_role;


-- ============================================================================
-- 3. CARTES — jetons QR 128 bits
-- ============================================================================
-- L'ancien schéma « ORESTO-XXXXXX » était dérivé du nom d'utilisateur :
-- reproductible par n'importe qui connaissant ce nom. Nouveau jeton :
-- 16 octets aléatoires → base64url 22 caractères. Les enfants et les
-- abonnements actuels migrent ici ; le code applicatif (secureQr.ts)
-- génère déjà ce format pour les nouveaux.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_qr_token()
returns text
language plpgsql security definer set search_path = extensions, public
as $$
declare
  v_token text;
begin
  loop
    v_token := left(
      replace(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=', ''),
      22);
    if not exists (select 1 from public.children where qr_token = v_token)
       and not exists (select 1 from public.subscriptions where qr_token = v_token) then
      return v_token;
    end if;
  end loop;
end $$;

-- Migrer les jetons FAIBLES existants (enfants), régénérer les doublons de
-- jeton en premier (sinon l'index unique refuserait), puis contrainte
-- NOT NULL UNIQUE.
alter table public.children add column if not exists qr_token text;

do $$
begin
  update public.children
     set qr_token = public.generate_qr_token()
   where qr_token is null
      or btrim(qr_token) = ''
      or length(qr_token) <> 22
      or qr_token !~ '^[A-Za-z0-9_-]{22}$';
end $$;

do $$
declare
  r record;
begin
  for r in
    select qr_token, array_agg(id order by created_at, id) as ids
      from public.children
     group by qr_token
    having count(*) > 1
  loop
    for i in 2..array_length(r.ids, 1) loop
      update public.children
         set qr_token = public.generate_qr_token()
       where id = r.ids[i];
    end loop;
  end loop;
end $$;

alter table public.children alter column qr_token set not null;
create unique index if not exists children_qr_token_key on public.children (qr_token);

-- Abonnements faibles aussi (36/36 étaient en ORESTO-XXXX).
do $$
begin
  update public.subscriptions
     set qr_token = public.generate_qr_token()
   where qr_token is null
      or btrim(qr_token) = ''
      or length(qr_token) <> 22
      or qr_token !~ '^[A-Za-z0-9_-]{22}$';
end $$;

create index if not exists idx_subscriptions_qr on public.subscriptions (qr_token);
create index if not exists idx_children_qr on public.children (qr_token);
create index if not exists idx_children_parent on public.children (parent_username);
create index if not exists idx_children_class on public.children (class_name);

-- Règle métier : UN même mois d'UN même enfant ne peut être réglé qu'une
-- fois. Concrètement, deux abonnements du même enfant ne peuvent pas se
-- chevaucher : le double paiement du même mois est refusé en base (la
-- borne fin est exclue — deux abonnements consécutifs se rejoignent
-- proprement le 1er). Les lignes sans enfant (tickets sans carte) ne
-- sont pas contraintes.
create extension if not exists btree_gist with schema extensions;

-- Pré-flight : si des abonnements historiques se chevauchent déjà
-- (mêmes jours, même enfant), la création de la contrainte échouerait
-- sans explication. On liste le premier pair en conflit pour corriger
-- l'article concerné (statut → cancelled) avant de rejouer le fichier.
do $$ declare v_child uuid; v_d1 date; v_d2 date;
begin
  for v_child in
    select distinct child_id from public.subscriptions
     where child_id is not null and status in ('active', 'pending')
  loop
    select a.start_date::date, b.start_date::date
      into v_d1, v_d2
      from public.subscriptions a
      join public.subscriptions b
        on b.child_id = a.child_id
       and b.id > a.id
       and b.status in ('active', 'pending')
       and a.status in ('active', 'pending')
       where a.child_id = v_child
         and (a.start_date)::date < (b.end_date)::date
         and (b.start_date)::date < (a.end_date)::date
     limit 1;
    if v_d1 is not null then
      raise exception 'abonnements qui se chevauchent pour l''enfant % (début % et %) : passer l''un des deux en « cancelled » puis rejouer', v_child, v_d1, v_d2;
    end if;
    v_d1 := null; v_d2 := null;
  end loop;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'subscriptions_no_overlap_per_child'
  ) then
    create unique index subscriptions_no_overlap_per_child
      on public.subscriptions using gist (
        child_id,
        daterange((start_date)::date, (end_date)::date, '[)')
      )
      where child_id is not null and status in ('active', 'pending');
  end if;
end $$;


-- ============================================================================
-- 4. JOURNAL DES IMPORTS — import_batches
-- ============================================================================
-- Une ligne par import exécuté par la DAF : type, effectifs, opérateur.
-- Définition ALIGNÉE sur l'application (src/lib/importBatches.ts).
-- (L'ancienne définition du supabase-parents-import.sql est abandonnée.)

create table if not exists public.import_batches (
  id text primary key,
  kind text not null check (kind in ('students', 'parents')),
  total_rows integer not null default 0 check (total_rows >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_import_batches_created
  on public.import_batches (created_at desc);


-- ============================================================================
-- 5. UNICITÉS MÉTIER — anti-doublons
-- ============================================================================
-- Pré-flight : si un doublon empêche un index unique, ce bloc s'arrête AVEC la
-- liste à corriger (l'exécution n'ira pas plus loin, par sécurité). Corriger
-- les lignes listées, puis rejouer le script.

do $$
begin
  if exists (
    select 1 from public.users group by lower(btrim(username)) having count(*) > 1
  ) then
    raise exception 'doublons users.username — liste : %', (
      select string_agg(username, ', ') from (
        select min(username) as username from public.users
        group by lower(btrim(username)) having count(*) > 1) d);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from public.parent_profiles
    group by lower(btrim(parent_username)) having count(*) > 1
  ) then
    raise exception 'doublons parent_profiles.parent_username — corriger puis rejouer';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from public.children
    group by parent_username, lower(btrim(first_name)), lower(btrim(last_name))
    having count(*) > 1
  ) then
    raise exception 'enfants doublés (parent, prénom, nom) — supprimer les lignes en plus puis rejouer';
  end if;
end $$;

-- 5a. identifiants métier uniques
create unique index if not exists users_username_key
  on public.users (lower(btrim(username)));
create unique index if not exists parent_profiles_parent_username_key
  on public.parent_profiles (lower(btrim(parent_username)));

-- 5b. enfant unique par parent + prénom + nom
create unique index if not exists children_parent_name_unique_idx
  on public.children (
    parent_username, lower(btrim(first_name)), lower(btrim(last_name)));

-- 5c. La règle « un seul mois payé par enfant » est portée par la
--     contrainte d'exclusion de la section 3 (gist sur les intervalles
--     de dates). Elle remplace l'ancien index unique (child_id WHERE
--     status = 'active') : celui-ci refusait à tort deux abonnements
--     actifs d'un même enfant quand le parent règle d'avance les mois
--     suivants (abonnement futur actif dès le paiement).

-- 5d. un numéro de téléphone parent = un compte. Pré-flight : deux fiches
--     au même numéro (après normalisation) bloquent l'exécution avec la liste
--     à corriger.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'parent_profiles'
       and column_name = 'phone'
  ) then
    if exists (
      select 1 from public.parent_profiles
      group by regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^2210?', '')
      having count(*) > 1
    ) then
      raise exception 'doublons parent_profiles.phone — deux fiches au même numéro : corriger puis rejouer';
    end if;
    create unique index if not exists parent_profiles_unique_phone
      on public.parent_profiles (regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^2210?', ''));
  end if;
end $$;


-- ============================================================================
-- 6. MATRICE RLS — l'accès se mérite, table par table
-- ============================================================================
-- helpers privés (le schéma private est réservé à ces outils de migration).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Aide : supprimer toute politique existante d'une table.
create or replace function private.drop_all_policies(p_table text)
returns void language plpgsql security definer set search_path = pg_temp
as $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = p_table
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, p_table);
  end loop;
end $$;

-- Helper : activer RLS, fermer anon, poser une politique nommée.
create or replace function private.lock_table(
  p_table text, p_policy text, p_command text,
  p_using text default null, p_check text default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('alter table public.%I force row level security', p_table);
  execute format('revoke all on public.%I from anon', p_table);
  execute format('drop policy if exists %I on public.%I', p_policy, p_table);
  if p_using is not null then
    execute format('create policy %I on public.%I for %s using (%s)',
      p_policy, p_table, p_command, p_using);
  end if;
  if p_check is not null then
    execute format('create policy %I on public.%I for %s with check (%s)',
      p_policy || '_chk', p_table, p_command, p_check);
  end if;
end $$;

revoke all on function private.drop_all_policies(text) from public, anon, authenticated;
revoke all on function private.lock_table(text, text, text, text, text)
  from public, anon, authenticated;

-- RÔLES DE SESSION — SECURITY DEFINER obligatoire : ces fonctions lisent
-- `users` et les politiques s'appuient elles-mêmes sur ces fonctions. Sans
-- SECURITY DEFINER, PostgreSQL déclencherait une récursion infinie d'évalions
-- (« infinite recursion detected in policy for relation "users" »). En
-- contrepartie, `users` reste en enable MAIS PAS force : forcer assujettirait
-- aussi le propriétaire (donc ces fonctions) et ramènerait la récursion.
create or replace function public.current_app_role()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.role from public.users u where u.auth_id = auth.uid()),
    'anonymous');
$$;

create or replace function public.current_app_username()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select u.username from public.users u where u.auth_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.current_app_role() = 'admin' $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.current_app_role() in ('admin', 'personnel', 'gestionnaire') $$;

revoke all on function public.current_app_role()      from public, anon;
revoke all on function public.current_app_username()  from public, anon;
revoke all on function public.is_admin()              from public, anon;
revoke all on function public.is_staff()              from public, anon;
grant execute on function public.current_app_role(), public.current_app_username(),
                     public.is_admin(), public.is_staff() to anon, authenticated, service_role;

-- Purge des politiques héritées (open_* et toutes les autres) — CI-méi la
-- table existe ; les tables de la matrice qui suivent repartent de zéro.
do $$
declare
  t text;
begin
  foreach t in array array[
    'orders', 'products', 'establishments', 'formulas', 'subscriptions',
    'validations', 'oresto_payments', 'children', 'wallets',
    'wallet_transactions', 'finance_settings', 'finance_expenses',
    'weekly_menus', 'menus', 'menus_items', 'kiosk_orders', 'parent_profiles',
    'reclamations', 'reclamation_messages', 'sycapay_events', 'classes',
    'import_batches', 'users'
  ] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      perform private.drop_all_policies(t);
    end if;
  end loop;
end $$;

-- 6.1 USERS (enable, PAS force — voir helpers)
alter table public.users enable row level security;
revoke all on public.users from anon;
drop policy if exists users_read on public.users;
create policy users_read on public.users for select
  using (public.is_admin() or auth_id = auth.uid());
drop policy if exists users_self_register on public.users;
create policy users_self_register on public.users for insert
  with check (auth_id = auth.uid() and role = 'client');
drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for update
  using (public.is_admin() or public.is_staff())
  with check (public.is_admin() or public.is_staff());

-- 6.2 CATALOGUES : formules, menus, produits, établissement
-- lecteurs raccordés (parent inclus). L'anon erte perdu quand la session tombe.
select private.lock_table('formulas', 'formulas_read', 'select', 'auth.uid() is not null');
select private.lock_table('formulas', 'formulas_write', 'all',
  'public.is_admin()', 'public.is_admin()');
select private.lock_table('weekly_menus', 'menus_read', 'select', 'auth.uid() is not null');
select private.lock_table('weekly_menus', 'menus_write', 'all',
  'public.is_admin()', 'public.is_admin()');
select private.lock_table('products', 'products_read', 'select', 'auth.uid() is not null');
select private.lock_table('products', 'products_write', 'all',
  'public.is_admin()', 'public.is_admin()');
select private.lock_table('establishments', 'establishments_read', 'select', 'public.is_staff()');
select private.lock_table('establishments', 'establishments_write', 'all',
  'public.is_admin()', 'public.is_admin()');

-- 6.3 ENFANTS : un parent ne voit et ne gère que les siens.
select private.lock_table('children', 'children_read', 'select',
  'public.is_staff() or parent_username = public.current_app_username()');
select private.lock_table('children', 'children_write', 'all',
  'public.is_staff() or parent_username = public.current_app_username()',
  'public.is_staff() or parent_username = public.current_app_username()');

-- 6.4 ABONNEMENTS : les siens, le personnel tout ; un parent ne peut pas se
--     créer lui-même un abonnement « payé » sans passer par un règlement
--     (les règles comptables par le personne côté serveur).
--     NB : pour INSERT, PostgreSQL n'accepte QUE `with check` — jamais `using`.
select private.lock_table('subscriptions', 'subscriptions_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('subscriptions', 'subscriptions_insert', 'insert',
  null,
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('subscriptions', 'subscriptions_update', 'update',
  'public.is_staff() or client_username = public.current_app_username()',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('subscriptions', 'subscriptions_delete', 'delete',
  'public.is_staff() or client_username = public.current_app_username()');

-- 6.5 PAIEMENTS : lecture (les siens + le personnel) ; insertion — un parent
--     pose sa DEMANDE de paiement, seule l'équipe peut déjà poser « paid » ;
--     mise à jour — le personnel et le seul retrait de sa propre demande
--     non payée ; suppression — AUCUNE politique : personne depuis le
--     navigateur (la comptabilité n'est pas effaçable, c'est le but).
select private.lock_table('oresto_payments', 'payments_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('oresto_payments', 'payments_insert', 'insert',
  null,
  'public.is_staff() or (auth.uid() is not null and status <> ''paid'')');
select private.lock_table('oresto_payments', 'payments_update', 'update',
  'public.is_staff() or client_username = public.current_app_username()',
  'public.is_staff() or (client_username = public.current_app_username()'
  || ' and status <> ''paid'')');

-- 6.6 CARTE PRÉPAYÉE : lecture par le détenteur et le personnel ; insertion
--     (demande de recharge par le parent, recharge validée par l'équipe) ;
--     mise à jour par le personnel SEULEMENT (le webhook et la caisse
--     passent par la clé de service) ; suppression — aucune politique.
select private.lock_table('wallets', 'wallets_read', 'select',
  'public.is_staff() or exists (
     select 1 from public.children c
      where c.id = wallets.child_id
        and c.parent_username = public.current_app_username())');
select private.lock_table('wallets', 'wallets_write', 'all',
  'public.is_staff()', 'public.is_staff()');
select private.lock_table('wallet_transactions', 'wallet_tx_read', 'select',
  'public.is_staff() or exists (
     select 1 from public.children c
      where c.id = wallet_transactions.child_id
        and c.parent_username = public.current_app_username())');
select private.lock_table('wallet_transactions', 'wallet_tx_insert', 'insert',
  null,
  'public.is_staff() or (auth.uid() is not null and status <> ''paid'')');
select private.lock_table('wallet_transactions', 'wallet_tx_update', 'update',
  'public.is_staff()', 'public.is_staff()');

-- 6.7 VALIDATIONS DE REPAS : personnel uniquement.
select private.lock_table('validations', 'validations_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('validations', 'validations_insert', 'insert',
  null, 'public.is_staff()');
select private.lock_table('validations', 'validations_update', 'update',
  'public.is_staff()', 'public.is_staff()');

-- 6.8 PROFILS PARENTS : le parent ne voit que sa fiche, le personnel/DAF
--     lit et tient le registre (activation, désactivation, profil).
--     (Colonne clé : `parent_username`, PAS `username`.)
select private.lock_table('parent_profiles', 'parent_profiles_read', 'select',
  'public.is_staff() or parent_username = public.current_app_username()');
select private.lock_table('parent_profiles', 'parent_profiles_follow', 'all',
  'public.is_staff() or parent_username = public.current_app_username()',
  'public.is_staff() or parent_username = public.current_app_username()');

-- 6.9 KIOSQUE : le parent passe commande depuis son compte,
--     le personnel marque « servie », personne d'autre ne lit le panier.
select private.lock_table('kiosk_orders', 'kiosk_read', 'select',
  'public.is_staff() or parent_username = public.current_app_username()');
select private.lock_table('kiosk_orders', 'kiosk_insert', 'insert',
  null,
  'auth.uid() is not null and parent_username = public.current_app_username()');
select private.lock_table('kiosk_orders', 'kiosk_update', 'update',
  'public.is_staff()', 'public.is_staff()');

-- 6.10 COMPTABILITÉ : DAF et personnel.
select private.lock_table('finance_settings', 'finance_read', 'select',
  'public.is_admin() or public.is_staff()');
select private.lock_table('finance_settings', 'finance_write', 'all',
  'public.is_admin()', 'public.is_admin()');
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'finance_expenses') then
    perform private.lock_table('finance_expenses', 'expenses_read', 'select', 'public.is_staff()');
    perform private.lock_table('finance_expenses', 'expenses_write', 'all',
      'public.is_admin()', 'public.is_admin()');
  end if;
end $$;

-- 6.11 RÉCLAMATIONS & MESSAGES : le propriétaire du fil et le personnel
--     uniquement ; les ANNONCES (is_announcement) sont visibles de tous
--     les comptes connectés.
--     NB : pour INSERT, PostgreSQL n'accepte QUE `with check` — jamais `using`.
select private.lock_table('reclamations', 'reclamations_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()'
  || ' or is_announcement = true');
select private.lock_table('reclamations', 'reclamations_insert', 'insert',
  null,
  'auth.uid() is not null and (client_username = public.current_app_username()'
  || ' or public.is_staff())');
select private.lock_table('reclamations', 'reclamations_update', 'update',
  'public.is_staff()', 'public.is_staff()');
select private.lock_table('reclamation_messages', 'reclamation_messages_read', 'select',
  'public.is_staff()');
select private.lock_table('reclamation_messages', 'reclamation_messages_others', 'select',
  'exists (
     select 1 from public.reclamations r
      where r.id = reclamation_messages.complaint_id
        and (r.client_username = public.current_app_username()
             or r.is_announcement = true))');
select private.lock_table('reclamation_messages', 'reclamation_messages_insert', 'insert',
  null,
  'auth.uid() is not null and author_username = public.current_app_username()');

-- 6.12 CLASSES (taxonomie école) : lecture pour tous, gestion par l'équipe.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'classes') then
    perform private.lock_table('classes', 'classes_read', 'select', 'auth.uid() is not null');
    perform private.lock_table('classes', 'classes_write', 'all',
      'public.is_staff()', 'public.is_staff()');
  end if;
end $$;

-- 6.13 Sycapay events (journal opérateur) : consultation DAF/ISM.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'sycapay_events') then
    perform private.lock_table('sycapay_events', 'sycapay_events_read', 'select',
      'public.is_admin() or public.is_staff()');
  end if;
end $$;

-- 6.14 IMPORTS (journal) : DAF tout, personnel lecture.
select private.lock_table('import_batches', 'import_batches_read', 'select',
  'public.is_admin() or public.is_staff()');
select private.lock_table('import_batches', 'import_batches_write', 'all',
  'public.is_admin()', 'public.is_admin()');

-- 6.15 TABLES SECONDAIRES (si présentes) : commandes de caisse, menus du
-- jour de l'ancien schéma — même règle : personne d'anon, écriture limitée.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'orders') then
    perform private.lock_table('orders', 'orders_read', 'select',
      'public.is_staff() or customer_name = public.current_app_username()');
    perform private.lock_table('orders', 'orders_write', 'all',
      'public.is_staff()', 'public.is_staff()');
    perform private.lock_table('orders', 'orders_delete', 'delete',
      'public.is_admin()');
  end if;
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'menus') then
    perform private.lock_table('menus', 'menus_read', 'select', 'auth.uid() is not null');
    perform private.lock_table('menus', 'menus_write', 'all',
      'public.is_staff()', 'public.is_staff()');
  end if;
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'menus_items') then
    perform private.lock_table('menus_items', 'menus_items_read', 'select', 'auth.uid() is not null');
    perform private.lock_table('menus_items', 'menus_items_write', 'all',
      'public.is_staff()', 'public.is_staff()');
  end if;
end $$;

-- 6.16 STOCKAGE : photos preuves (aucune lecture publique, URL signées).
insert into storage.buckets (id, name, public)
values ('reclamation-photos', 'reclamation-photos', false)
on conflict (id) do nothing;

-- Suppression des anciennes politiques du bucket (celles qui autorisaient
-- anon étaient un trou : n'importe qui pouvait lister les preuves).
drop policy if exists upload_reclamation_photos on storage.objects;
drop policy if exists read_reclamation_photos on storage.objects;
drop policy if exists delete_reclamation_photos on storage.objects;

create policy upload_reclamation_photos on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reclamation-photos');

create policy read_reclamation_photos on storage.objects
  for select to authenticated
  using (bucket_id = 'reclamation-photos');

create policy delete_reclamation_photos on storage.objects
  for delete to authenticated
  using (bucket_id = 'reclamation-photos' and public.is_staff());

-- 6.16 PARE-FEU GÉNÉRAL : toute table créée plus tard N'est lisible par
--     personne tant qu'une politique ne l'ouvre explicitement.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;


-- ============================================================================
-- 7. CONTRÔLES — rapports à lire APRÈS exécution
-- ============================================================================

-- Fonction de contrôle : tables encore lisibles par un visiteur anonyme.
create or replace function public.check_anon_exposure()
returns table (table_name text, exposed boolean)
language sql stable
as $$
  select c.relname,
         has_table_privilege('anon', 'public.' || c.relname, 'SELECT')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname not in ('app_secret')
   order by 1;
$$;

-- ============ REQUÊTES À COPIER-COLLER EN FIN D'EXÉCUTION ============
--
-- 7a. Tables encore exposées à l'anon (attendu : ZÉRO ligne).
--   select table_name from public.check_anon_exposure() where exposed;
--
-- 7b. Profils SANS compte Auth rattaché — ces comptes devront se
--     reconnecter une fois via l'application (l'écriture est alors faite
--     automatiquement par login-parent / login-staff).
--   select username, role from public.users where auth_id is null order by role;
--
-- 7c. jetons QR encore faibles (attendu : 0 chez les enfants et les
--     abonnements ; users.qr_token est volontairement laissé tel quel pour
--     ne pas invalider les cartes personnelles imprimées).
--   select 'children' as t, count(*) from public.children
--    where length(qr_token) <> 22 or qr_token !~ '^[A-Za-z0-9_-]{22}$'
--   union all
--   select 'subscriptions', count(*) from public.subscriptions
--    where length(qr_token) <> 22 or qr_token !~ '^[A-Za-z0-9_-]{22}$';
--
-- 7d. Doublons résiduels (attendu : 0).
--   select 'users_username' t, count(*) n from (
--     select lower(btrim(username)) from public.users group by 1 having count(*) > 1) x
--   union all
--   select 'children_doublon', count(*) from (
--     select parent_username, lower(btrim(first_name)), lower(btrim(last_name))
--       from public.children group by 1,2,3 having count(*) > 1) y
--   union all
--   select 'abonnements_actifs_multiples', count(*) from (
--     select child_id from public.subscriptions where status='active' group by child_id
--     having count(*) > 1) z;
--
-- 7e. Comptabilité vue validée (contrôle visuel du CA).
--   select min(settled_at)::date as depuis, count(*) as reglements,
--          sum(amount) as total_fcfa from public.v_paiements_valides;
-- ============================================================================
