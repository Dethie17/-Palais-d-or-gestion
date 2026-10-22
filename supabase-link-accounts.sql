-- =============================================================================
-- O RESTO — RATTACHEMENT DES COMPTES MÉTIER AUX COMPTES AUTH
-- =============================================================================
-- À exécuter UNE FOIS, dans le SQL Editor, APRÈS :
--
--   1. supabase-security.sql
--   2. la création des comptes dans Authentication → Users
--
-- L'application se connecte avec l'adresse `<nom d'utilisateur>@oresto-sn.com`
-- (cf. authEmailFor dans src/lib/authEmail.ts). Ce script fait donc la
-- correspondance tout seul : il n'y a aucun uuid à copier à la main.
--
-- Il est idempotent — le rejouer ne fait rien de plus.
-- =============================================================================

begin;

update public.users u
set auth_id = a.id
from auth.users a
where u.auth_id is null
  and a.email = u.username || '@oresto-sn.com';

commit;

-- -----------------------------------------------------------------------------
-- Compte rendu
--
-- `rattache` doit valoir true pour TOUTES les lignes. Un false signifie :
--   - soit le compte n'existe pas dans Authentication → Users,
--   - soit son adresse n'est pas exactement <username>@oresto-sn.com.
--
-- Dans les deux cas l'application refusera la connexion : c'est le
-- comportement voulu. Un profil non rattaché n'est accessible à personne.
-- -----------------------------------------------------------------------------
select
  username,
  role,
  auth_id is not null as rattache
from public.users
order by role, username;

-- Rappel : l'inscription des parents passe par l'écran « Créer un compte » et
-- rattache le profil au fur et à mesure. Seuls les comptes du personnel et de
-- la direction doivent figurer ici.
