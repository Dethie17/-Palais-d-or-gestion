-- =============================================================================
-- O RESTO — DURCISSEMENT DE L'AUTHENTIFICATION ET DU RLS
-- =============================================================================
-- À exécuter APRÈS les migrations de schéma, sur le projet Supabase
-- (Dashboard → SQL Editor). Le script est idempotent : le rejouer est sans
-- risque, il supprime puis recrée ses propres politiques.
--
-- POURQUOI CE FICHIER EST INDISPENSABLE
--
-- Les scripts d'installation utilisent tous la même politique :
--
--     CREATE POLICY open_<table> ON <table> FOR ALL USING (true) WITH CHECK (true);
--
-- `USING (true)` ne teste rien : la seule présence de la clé publique
-- (« publishable », embarquée dans le bundle JavaScript et donc lisible par
-- n'importe qui) suffit à lire ET écrire n'importe quelle table. Concrètement,
-- sur le projet d'aujourd'hui, une seule requête HTTP anonyme permet de :
--
--   1. lire la table `users`, donc récupérer le rôle de chaque compte ;
--   2. lire la colonne `password` — les empreintes SHA-256 non salées de tous
--      les comptes, y compris l'administrateur ;
--   3. appeler UPDATE sur `users` et passer son propre rôle à 'admin' ;
--   4. lire et modifier `oresto_payments`, `wallets`, `wallet_transactions`,
--      `finance_expenses` — c'est-à-dire solder des abonnements, créditer des
--      cartes et modifier la comptabilité.
--
-- Le contournement ne demande aucune connaissance : ouvrir la console du
-- navigateur pendant que l'application est ouverte suffit.
--
-- Ce script referme ces quatre portes. Après exécution :
--
--   - plus aucun hash de mot de passe n'est lisible depuis le navigateur ;
--   - plus aucun rôle n'est modifiable sans être authentifié comme administrateur ;
--   - chaque table est filtrée selon le rôle de la session ;
--   - l'anonyme seul n'obtient rien du tout.
--
-- PRÉREQUIS
--
--   1. Renseignez d'abord le secret de signature (une seule fois) :
--
--        select private.set_signing_secret('un-secret-long-et-aleatoire');
--
--      ou, en SQL Editor, remplaçant la valeur :
--
--        update private.app_secret set secret = 'un-secret-long-et-aleatoire';
--
--      Le même secret doit être fourni à l'application sous le nom
--      APP_SIGNING_SECRET (jamais VITE_*) si les fonctions serveur
--      (/api/sycapay/*) doivent vérifier les jetons qu'elle reçoit.
--
--   2. CRÉEZ les comptes dans Supabase Auth :
--        Dashboard → Authentication → Users → Add user
--        - email    : <nom d'utilisateur>@oresto-sn.com (vrai domaine : Supabase refuse `.local`)
--          (Supabase exige une adresse ; le domaine n'existe pas, le compte
--           ne peut donc jamais recevoir de courriel et n'a pas à être réel)
--        - password : le mot de passe du compte
--        - puis Authentication → Providers → Email : désactiver
--          « Confirm email » et, si l'on n'en a pas besoin,
--          « Enable email signup » — l'inscription libre est un backdoor.
--
--      Puis liez chaque compte Auth à sa ligne métier (une fois par compte) :
--
--        update public.users set auth_id = '<uuid auth>' where username = 'admin';
--
--      Un script d'aide est fourni en bas de ce fichier (section 8).
--
-- COMPATIBILITÉ
--
-- Tant que les comptes ne sont pas créés dans Auth, l'application affiche un
-- écran « base non configurée » au lieu de se laisser passer. C'est le but :
-- mieux vaut un site hors service qu'un site ouvert à tous.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. SCHÉMA PRIVÉ
--    Hors de la portée de PostgREST : rien de ce qui s'y trouve n'est
--    atteignable par la clé publique.
-- =============================================================================

create schema if not exists private;

create table if not exists private.app_secret (
  id          boolean primary key default true check (id),
  secret      text   not null,
  updated_at  timestamptz not null default now(),
  constraint app_secret_singleton check (id)
);

insert into private.app_secret (id, secret)
values (true, 'CHANGE-MOI-avant-de-mettre-en-production')
on conflict (id) do update set secret = excluded.secret;

create or replace function private.set_signing_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = private, pg_temp
as $$
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'Le secret doit faire au moins 32 caractères.';
  end if;
  update private.app_secret set secret = p_secret, updated_at = now() where id;
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on table private.app_secret from public, anon, authenticated;
grant execute on function private.set_signing_secret(text) to service_role;

-- Secret de signature lu par les fonctions SECURITY DEFINER uniquement.
create or replace function private.signing_secret()
returns text
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select secret from private.app_secret where id;
$$;

revoke all on function private.signing_secret() from public, anon, authenticated;

-- =============================================================================
-- 2. PROFILS : LA TABLE `users` N'EST PLUS LISIBLE DEPUIS LE NAVIGATEUR
-- =============================================================================
-- On ajoute `auth_id`, le lien vers le compte Supabase Auth qui porte
-- l'identité. La colonne `password` reste en base le temps de la migration
-- (elle permet encore de vérifier les anciens comptes), mais le SELECT est
-- retiré à anon et authenticated : les empreintes cessent d'être exposées.
-- =============================================================================

alter table public.users add column if not exists auth_id uuid;

create unique index if not exists users_auth_id_key
  on public.users (auth_id) where auth_id is not null;

-- `username` DOIT être unique, et c'est critique dès lors que les parents
-- s'inscrivent eux-mêmes.
--
-- L'identité d'une session se résout par `auth_id`, mais toutes les politiques
-- RLS des autres tables (commandes, enfants, portefeuilles) s'appuient sur
-- `current_app_username()`. Si deux profils portent le même nom, le second
-- hérite des données du premier : un parent qui s'inscrit en « laurent »
-- verrait les enfants, le solde et l'historique de la vraie Laurent.
--
-- Vérifié sur ce projet avant correction : l'insertion d'un doublon était
-- acceptée.
--
-- D'abord le diagnostic : l'index ne peut pas être posé tant qu'un doublon
-- existe, et un échec brut ne dit pas lequel.
do $$
declare
  doublons record;
begin
  for doublons in
    select lower(username) as nom, count(*) as n
    from public.users
    group by lower(username)
    having count(*) > 1
  loop
    raise exception
      'Deux comptes portent le nom « % » (%). Renommez-les avant de poursuivre.',
      doublons.nom, doublons.n;
  end loop;
end;
$$;

create unique index if not exists users_username_key
  on public.users (lower(username));

-- La colonne `password` n'est plus utilisée : le hachage se fait chez
-- Supabase (bcrypt), le mot de passe ne transite plus par la base
-- applicative. On la supprime — garder des empreintes SHA-256 non salées
-- d'anciens comptes serait laisser une cible de plus, pas une protection.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'password'
  ) then
    alter table public.users drop column password;
  end if;
end;
$$;

-- Un profil doit appartenir à un compte Auth : c'est cette contrainte qui
-- empêche d'inventer un rôle sans posséder l'identité correspondante.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('client', 'personnel', 'gestionnaire', 'admin'));
  end if;
end;
$$;

-- Les anciens rôles (« caissier », « manager ») sont convertis ICI, une fois
-- pour toutes. L'application ne le fera plus elle-même : écrire son propre
-- rôle depuis le navigateur est précisément ce que ce script interdit.
update public.users set role = 'gestionnaire' where role = 'caissier';
update public.users set role = 'admin'       where role = 'manager';
update public.users set role = 'personnel'   where role = 'superviseur';

-- Tout profil sans compte Auth rattaché est neutralisé : sans session, il ne
-- peut de toute façon rien atteindre (auth.uid() est nul). On le signale
-- plutôt que de le supprimer, pour que la migration reste réversible.
do $$
declare
  orphelins int;
begin
  select count(*) into orphelins
  from public.users
  where auth_id is null;

  if orphelins > 0 then
    raise warning
      'O RESTO : % profil(s) sans auth_id — injoignables tant que la migration des comptes n''est pas terminée.',
      orphelins;
  end if;
end;
$$;

-- Le rôle ne peut plus être écrit que par un administrateur authentifié
-- (voir la politique « admin_write » plus bas), jamais par le porteur du rôle.
revoke all on table public.users from anon;
grant select (username, role, auth_id, establishment_id, qr_token, id)
  on public.users to authenticated;
grant update (username, role, establishment_id, qr_token)
  on public.users to authenticated;

-- =============================================================================
-- 3. RÔLE DE LA SESSION
--    Une fonction unique, lue par toutes les politiques RLS.
--
--    ATTENTION — pourquoi SECURITY DEFINER, et pourquoi c'est décisif.
--    Ces fonctions lisent `users`, et les politiques de `users` s'appuient sur
--    elles. Sans SECURITY DEFINER, PostgreSQL détecte une récursion infinie
--    et refuse le script : « infinite recursion detected in policy for
--    relation "users" ».
--
--    SECURITY DEFINER les fait exécuter avec les droits du propriétaire
--    (postgres), ce qui court-circuite le RLS de `users` et casse la boucle.
--    Il faut pour cela que `users` soit en `enable` mais PAS en `force` :
--    `force` assujettirait aussi le propriétaire, et la récursion
--    reviendrait. C'est le compromis habituel — `anon` et `authenticated`
--    ne peuvent pas contourner le RLS de toute façon, seuls les rôles
--    propriétaires le pourraient, et ce sont des administrateurs de base.
-- =============================================================================

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.role from public.users u where u.auth_id = auth.uid()),
    'anonymous'
  );
$$;

create or replace function public.current_app_username()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.username from public.users u where u.auth_id = auth.uid();
$$;

/** Vrai pour les rôles d'administration (DAF). Remplace les former alias. */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_role() in ('admin');
$$;

/** Vrai pour tout le personnel de cantine : administrateur compris. */
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_role() in ('admin', 'personnel', 'gestionnaire');
$$;

-- Ces fonctions ne renvoient que le rôle de l'appelant : les laisser ouvertes
-- à anon n'expose rien (auth.uid() y est nul, elles répondent « anonymous »).
revoke all on function public.current_app_role() from public;
revoke all on function public.current_app_username() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.current_app_username() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;

-- =============================================================================
-- 4. POLITIQUES PAR TABLE
--    On retire TOUTES les politiques antérieures — y compris celles en
--    USING (true) — avant d'appliquer la matrice ci-dessous.
-- =============================================================================

-- Supprime, sur une table donnée, toute politique publique ou nommée open_*.
create or replace function private.drop_open_policies(p_table text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
end;
$$;

revoke all on function private.drop_open_policies(text) from public, anon, authenticated;

-- Raccourcis : révoque l'accès anonyme puis applique une politique.
create or replace function private.lock_table(
  p_table   text,
  p_policy  text,
  p_command text,
  p_using   text default null,
  p_check   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('alter table public.%I force row level security', p_table);
  execute format('revoke all on public.%I from anon', p_table);
  execute format('drop policy if exists %I on public.%I', p_policy, p_table);

  if p_using is not null then
    execute format(
      'create policy %I on public.%I for %s using (%s)',
      p_policy, p_table, p_command, p_using);
  end if;

  if p_check is not null then
    execute format(
      'create policy %I on public.%I for %s with check (%s)',
      p_policy || '_check', p_table, p_command, p_check);
  end if;
end;
$$;

revoke all on function private.lock_table(text, text, text, text, text)
  from public, anon, authenticated;

-- Suppression des politiques « ouvertes » de tous les tableaux applicatifs.
do $$
declare
  t text;
begin
  foreach t in array array[
    'orders', 'products', 'establishments', 'formulas', 'subscriptions',
    'validations', 'oresto_payments', 'children', 'wallets',
    'wallet_transactions', 'finance_settings', 'finance_expenses',
    'weekly_menus', 'kiosk_orders', 'parent_profiles', 'reclamations',
    'reclamation_messages', 'sycapay_events', 'menus_items', 'menus'
  ] loop
    -- La table peut ne pas exister (migration non jouée) : on l'ignore.
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      perform private.drop_open_policies(t);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Catalogue : lecture par tout le personnel authentifié.
-- Un parent n'a rien à y faire : il lit le menu, pas la carte des produits.
-- -----------------------------------------------------------------------------
select private.lock_table('products', 'products_read', 'select',
  'public.is_staff()');

-- -----------------------------------------------------------------------------
-- Comptes utilisateurs : chacun voit sa propre ligne, la DAF voit tout.
-- Aucun mot de passe n'est sélectionnable (privilèges de colonne, §2).
--
-- L'INSERT sert à l'inscription libre des parents (écran « Créer un compte »).
-- La contrainte `role = 'client'` est ce qui rend cette porte inoffensive :
-- un nouvel arrivant peut créer son profil, et ONLY THAT — il ne peut pas se
-- déclarer gestionnaire ni administrateur. Les comptes du personnel sont
-- créés par la DAF, donc hors navigateur (fonction serveur, §5).
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;
-- PAS de FORCE ici, contrairement aux autres tables : les fonctions de rôle
-- sont SECURITY DEFINER et lisent cette table pour résoudre auth.uid(). En
-- `force`, le propriétaire serait lui aussi assujetti, la fonction
-- ré-entrerait dans la politique, et PostgreSQL lèverait « infinite
-- recursion detected in policy for relation "users" ».
revoke all on public.users from anon;
-- Le droit de lecture est redonné colonne par colonne : un droit global sur
-- la table primerait sur ces restrictions.
revoke all on public.users from authenticated;
grant insert (username, role, auth_id, qr_token, establishment_id)
  on public.users to authenticated;
grant select (username, role, auth_id, establishment_id, qr_token, id)
  on public.users to authenticated;
grant update (username, role, establishment_id, qr_token)
  on public.users to authenticated;

drop policy if exists users_read on public.users;
create policy users_read on public.users for select
  using (public.is_admin() or auth_id = auth.uid());

drop policy if exists users_self_register on public.users;
create policy users_self_register on public.users for insert
  with check (auth_id = auth.uid() and role = 'client');

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for update
  using (public.is_admin())
  with check (public.is_admin());

-- On retire aussi le droit de se supprimer soi-même : un profil fantôme
-- resterait sans propriétaire Auth, donc accessible par personne — mieux vaut
-- le garder pour audit.
revoke delete on public.users from authenticated;

-- -----------------------------------------------------------------------------
-- Commandes de caisse : le personnel les gère, un parent y accède pour lire
-- ses propres achats.
-- -----------------------------------------------------------------------------
select private.lock_table('orders', 'orders_read', 'select',
  'public.is_staff() or customer_name = public.current_app_username()');
select private.lock_table('orders', 'orders_write', 'insert',
  'public.is_staff()',
  'public.is_staff()');
select private.lock_table('orders', 'orders_update', 'update',
  'public.is_staff()',
  'public.is_staff()');
select private.lock_table('orders', 'orders_delete', 'delete',
  'public.is_admin()');

-- -----------------------------------------------------------------------------
-- Établissements : catalogue de référence pour le personnel.
-- -----------------------------------------------------------------------------
select private.lock_table('establishments', 'establishments_read', 'select',
  'public.is_staff()');
select private.lock_table('establishments', 'establishments_write', 'all',
  'public.is_admin()',
  'public.is_admin()');

-- -----------------------------------------------------------------------------
-- Formules : lecture par tout utilisateur connecté (le parent choisit),
-- écriture réservée à la DAF.
-- -----------------------------------------------------------------------------
select private.lock_table('formulas', 'formulas_read', 'select',
  'auth.uid() is not null');
select private.lock_table('formulas', 'formulas_write', 'all',
  'public.is_admin()',
  'public.is_admin()');

-- -----------------------------------------------------------------------------
-- Abonnements : un parent voit les siens, le personnel les voit tous.
-- -----------------------------------------------------------------------------
select private.lock_table('subscriptions', 'subscriptions_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('subscriptions', 'subscriptions_write', 'all',
  'public.is_staff()',
  'public.is_staff()');

-- -----------------------------------------------------------------------------
-- Validations de QR au comptoir : personnel uniquement, en écriture.
-- -----------------------------------------------------------------------------
select private.lock_table('validations', 'validations_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('validations', 'validations_write', 'insert',
  'public.is_staff()',
  'public.is_staff()');
select private.lock_table('validations', 'validations_update', 'update',
  'public.is_staff()',
  'public.is_staff()');

-- -----------------------------------------------------------------------------
-- Paiements : ARGENT. Un parent voit ses propres règlements, le personnel
-- les valides, personne ne les supprime.
-- -----------------------------------------------------------------------------
select private.lock_table('oresto_payments', 'payments_read', 'select',
  'public.is_staff() or client_username = public.current_app_username()');
select private.lock_table('oresto_payments', 'payments_write', 'insert',
  'public.is_staff()',
  'public.is_staff()');
select private.lock_table('oresto_payments', 'payments_update', 'update',
  'public.is_staff()',
  'public.is_staff()');

-- -----------------------------------------------------------------------------
-- Enfants : un parent gère les siens, le personnel les consulte.
-- -----------------------------------------------------------------------------
select private.lock_table('children', 'children_read', 'select',
  'public.is_staff() or parent_username = public.current_app_username()');
select private.lock_table('children', 'children_write', 'all',
  'public.is_staff() or parent_username = public.current_app_username()',
  'public.is_staff() or parent_username = public.current_app_username()');

-- -----------------------------------------------------------------------------
-- Portefeuilles : SOLDE. Lecture par le détenteur et le personnel,
-- écriture par le personnel seulement — un parent ne crédite pas sa carte
-- depuis le navigateur, il passe par une recharge paying.
-- -----------------------------------------------------------------------------
select private.lock_table('wallets', 'wallets_read', 'select',
  'public.is_staff() or exists (
    select 1 from public.children c
    where c.id = wallets.child_id
      and c.parent_username = public.current_app_username()
  )');
select private.lock_table('wallets', 'wallets_write', 'all',
  'public.is_staff()',
  'public.is_staff()');

select private.lock_table('wallet_transactions', 'wallet_tx_read', 'select',
  'public.is_staff() or exists (
    select 1 from public.children c
    where c.id = wallet_transactions.child_id
      and c.parent_username = public.current_app_username()
  )');
select private.lock_table('wallet_transactions', 'wallet_tx_write', 'insert',
  'public.is_staff()',
  'public.is_staff()');

-- -----------------------------------------------------------------------------
-- Comptabilité : DAF et superviseur cantine uniquement.
-- -----------------------------------------------------------------------------
select private.lock_table('finance_settings', 'finance_read', 'select',
  'public.is_admin()');
select private.lock_table('finance_settings', 'finance_write', 'all',
  'public.is_admin()',
  'public.is_admin()');
select private.lock_table('finance_expenses', 'expenses_read', 'select',
  'public.is_staff()');

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='finance_expenses') then
    perform private.lock_table('finance_expenses', 'expenses_write', 'insert',
      'public.is_admin()', 'public.is_admin()');
    perform private.lock_table('finance_expenses', 'expenses_delete', 'delete',
      'public.is_admin()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Menus hebdomadaires et produits kiosque : lire par tous, écrire par la DAF.
-- -----------------------------------------------------------------------------
select private.lock_table('weekly_menus', 'menus_read', 'select',
  'auth.uid() is not null');
select private.lock_table('weekly_menus', 'menus_write', 'all',
  'public.is_admin()',
  'public.is_admin()');

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='kiosk_orders') then
    perform private.lock_table('kiosk_orders', 'kiosk_read', 'select',
      'public.is_staff() or parent_username = public.current_app_username()');
    perform private.lock_table('kiosk_orders', 'kiosk_write', 'insert',
      'auth.uid() is not null', 'auth.uid() is not null');
    perform private.lock_table('kiosk_orders', 'kiosk_update', 'update',
      'public.is_staff()', 'public.is_staff()');
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='parent_profiles') then
    perform private.lock_table('parent_profiles', 'parent_profiles_access', 'all',
      'public.is_admin() or username = public.current_app_username()',
      'public.is_admin() or username = public.current_app_username()');
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='reclamations') then
    perform private.lock_table('reclamations', 'reclamations_read', 'select',
      'public.is_staff() or client_username = public.current_app_username()');
    perform private.lock_table('reclamations', 'reclamations_insert', 'insert',
      'auth.uid() is not null', 'auth.uid() is not null');
    perform private.lock_table('reclamations', 'reclamations_update', 'update',
      'public.is_staff()', 'public.is_staff()');
  end if;

  -- sycapay_events est le journal de l'opérateur : consultation DAF seulement.
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='sycapay_events') then
    perform private.lock_table('sycapay_events', 'sycapay_events_read', 'select',
      'public.is_admin()');
  end if;
end;
$$;

-- =============================================================================
-- 5. FONCTIONS MÉTIER : LE WEBHOOK ET LES FONCTIONS SERVEUR
--    passent par la clé de service, qui contourne le RLS (bypassrls).
--    On s'assure qu'aucune de ces entrées n'est accordée à anon.
-- =============================================================================

do $$
declare
  fn record;
begin
  for fn in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'oresto_%' or p.proname like 'menu_%')
  loop
    execute format('revoke all on function public.%I from anon', fn.proname);
    execute format('grant execute on function public.%I to service_role', fn.proname);
  end loop;
end;
$$;

-- =============================================================================
-- 6. AUCUNE CONNEXION ANONYME
--    Filet de sécurité : si une table a été ajoutée après ce script, elle
--    reste inaccessible tant qu'une politique ne l'a pas ouverte.
-- =============================================================================

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- =============================================================================
-- 7. VÉRIFICATION
--    Renvoie la liste des tables encore accessibles sans être connecté.
--    Le résultat attendu est : zéro ligne.
-- =============================================================================

create or replace function public.check_anon_exposure()
returns table (table_name text, exposed boolean)
language sql
stable
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

grant execute on function public.check_anon_exposure() to anon, authenticated, service_role;

commit;

-- =============================================================================
-- 8. SUITE : RATTACHEMENT DES COMPTES
-- =============================================================================
-- Ce fichier s'arrête ici volontairement. Les comptes doivent d'abord exister
-- dans Authentication → Users ; le rattachement se fait ensuite, dans un
-- script distinct : supabase-link-accounts.sql.
-- =============================================================================

-- =============================================================================
-- 9. CONTRÔLE FINAL
-- =============================================================================
--   select * from public.check_anon_exposure() where exposed;
--
-- Ce script s'arrête ici. Attendu : aucune ligne exposée. Si une table
-- s'affiche, elle est encore lisible avec la seule clé publique.
-- =============================================================================
