# Mise en production — O RESTO

Ce document est la procédure complète. Dans l'ordre, sans sauter d'étape : chaque
étape suppose la précédente.

**Ce qui a motivé cette procédure** : avant elle, la clé publique du projet
permettait à n'importe qui de lire la table `users` — donc les rôles et les
empreintes des mots de passe — puis de s'attribuer le rôle `admin` par un
simple `UPDATE`. La session du navigateur était un objet JSON écrit dans
`localStorage`, falsifiable en une ligne. Aucune de ces deux protections n'était
réelle : le rôle était contrôlé par le client, donc par l'attaquant.

---

## Étape 0 — Ce qu'il faut avoir sous la main

Un accès au projet Supabase :

- l'URL et la clé publique, déjà présentes dans `.env.local` ;
- la **clé de service** (`service_role`), à récupérer ;
- un accès au SQL Editor.

---

## Étape 1 — La clé de service

Dashboard Supabase → **Project Settings → API** → colonne `service_role**.

Cliquez sur « Reveal », copiez la valeur. Elle commence par `eyJ...` (ancien
format) ou `sb_secret_...` (format actuel).

Ajoutez-la **deux fois** — c'est le geste le plus souvent oublié, et sans elle
les paiements ne fonctionnent pas en production :

**Dans `.env.local`** (local) :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=collez-la-ici
```

**Chez Vercel** : Project → Settings → Environment Variables → ajoutez les deux,
puis **redéployez** (les variables ne s'appliquent qu'au build suivant).

> ⚠️ Cette clé contourne toutes les politiques RLS : elle donne la main sur
> toute la base. Elle vit uniquement dans le runtime serveur. **Jamais** dans
> une variable `VITE_*`, jamais dans le dépôt, jamais dans un bundle.
> `SUPABASE_SERVICE_ROLE_KEY` n'est pas préfixée par `VITE_` précisément pour
> que Vite ne l'injecte pas dans le JavaScript du navigateur.

---

## Étape 2 — Durcir la base (`supabase-security.sql`)

SQL Editor → **New query** → collez le contenu de `supabase-security.sql` →
**Run**.

Ce script :

- supprime les politiques RLS `USING (true)` — celles qui rendaient la base
  entièrement publique ;
- supprime la colonne `password` de `users` (les empreintes SHA-256 non salées
  n'ont plus lieu d'être : le hachage se fait chez Supabase, en bcrypt) ;
- rend `username` **unique** — indispensable, voir la note ci-dessous ;
- ajoute `users.auth_id`, le lien vers le compte d'authentification ;
- lie chaque table à `auth.uid()` via des politiques par rôle ;
- restreint `users` : plus de `role` modifiable depuis le navigateur, et
  l'inscription libre limitée à `role = 'client'`.

**Il est idempotent** : le rejouer ne casse rien.

> **Pourquoi `username` doit être unique.** C'est le point le plus subtil, et
> il ne se voit qu'à partir du moment où les parents s'inscrivent eux-mêmes.
> La session est identifiée par `auth_id`, mais les politiques RLS des autres
> tables (commandes, enfants, portefeuilles) reposent sur
> `current_app_username()`. Si deux profils portent le même nom, le second
> hérite des données du premier : un parent qui s'inscrit en « laurent » verrait
> les enfants, le solde et l'historique de la vraie Laurent.
>
> Ce projet n'avait aucune contrainte d'unicité : le doublon aurait été accepté.

> **Pont de transition, tant que la migration n'est pas faite.** Sans
> `auth_id`, le serveur ne peut pas relier un jeton à une fiche par le lien
> direct. Il retombe alors sur l'adresse Auth : le parent `awa.ndiaye` a pour
> adresse `awa.ndiaye@oresto-sn.com`, et le nom s'en déduit — c'est la même
> règle que l'inscription.
>
> Ce pont n'est ouvert qu'aux comptes créés par **notre** route
> `/api/auth/signup-parent`, marqués `app_metadata.oresto = 'parent'`. Un
> compte Auth forgé autrement (inscription directe, dashboard) ne peut donc
> pas se faire passer pour une fiche existante — un `admin` reste hors
> d'atteinte. Le jour où `supabase-security.sql` est exécuté, la colonne
> `auth_id` existe : le lien direct l'emporte et le pont ne sert plus.

Après exécution, contrôlez :

```sql
select * from public.check_anon_exposure() where exposed;
```

→ **zéro ligne**. Si une table s'affiche, elle est encore lisible avec la
seule clé publique.

---

## Étape 3 — Les comptes

### 3a. La confirmation par courriel — PLUS NÉCESSAIRE

Depuis que les comptes sont créés **côté serveur**
(`POST /api/auth/signup-parent`), le compte naît **déjà confirmé**
(`email_confirm: true`) : le réglage « Confirm email » de Supabase n'a
**plus aucun effet** sur les parents ni sur les comptes du personnel créés
par la DAF. Il peut rester désactivé ou activé, peu importe.

> Pourquoi ce changement. Avec `supabase.auth.signUp` côté navigateur,
> Supabase envoyait un courriel de validation à une adresse interne
> (`mamadou@oresto-sn.com`) que personne ne reçoit : chaque compte restait
> inactif, et à force d'envois inutiles le quota tombait (`429`). La création
> serveur supprime la cause : aucun courriel n'est jamais envoyé.

Sur **Authentication → Providers → Email**, laissez simplement
**« Enable email signup »** dans l'état qui vous convient : la route serveur
fonctionne même s'il est désactivé (elle utilise la clé de service), mais
l'activer ne crée aucun risque — voir la note ci-dessous.

### 3b. Créer les comptes du personnel

**Authentication → Users → Add user → Create new user**. Pour chaque compte :

| Email | Mot de passe (8+ caractères, unique) |
|---|---|
| `admin@oresto-sn.com` | *votre choix* |
| `personnel@oresto-sn.com` | *votre choix* |
| `gestionnaire@oresto-sn.com` | *votre choix* |

Cochez **« Auto Confirm User »**.

> Les parents, eux, n'ont **pas** de compte à créer ici : ils s'inscrivent
> depuis l'application.
>
> Le domaine `@oresto-sn.com` est un vrai domaine (le vôtre) : Supabase
> refuse les adresses en `.local` (« email_address_invalid »). Aucun courriel
> ne part par défaut ; le domaine permettra un jour le reset par email.
>
> Les mots de passe **ne doivent pas** être `admin123`, `client123`,
> `gestionnaire123` : ils sont écrits en clair dans ce dépôt. Celui de `admin`
> en particulier devrait être long et unique.

### 3c. Faire correspondre les adresses

Les noms d'utilisateur de l'application doivent être **exactement** le préfixe
avant `@` : `admin`, `personnel`, `gestionnaire`. Un préfixe différent rendra
le compte inutilisable.

---

## Étape 4 — Rattacher les comptes (`supabase-link-accounts.sql`)

SQL Editor → nouveau query → contenu de `supabase-link-accounts.sql` → **Run**.

Le script fait la correspondance tout seul : aucun UUID à copier à la main.
C'est possible parce que l'application construit son adresse de connexion en
`<nom d'utilisateur>@oresto-sn.com`.

Il renvoie un tableau de contrôle. **Chaque ligne doit afficher `rattache =
true`** :

```
 username      | role        | rattache
---------------+-------------+----------
 admin         | admin       | true
 gestionnaire  | gestionnaire | true
 personnel     | personnel    | true
```

Un `false` signifie que le compte n'existe pas dans Authentication, ou que son
adresse ne correspond pas exactement. Ce compte-là ne pourra pas se connecter.

Les parents qui se sont inscrits avant la migration n'apparaîtront pas ici :
ils se rattachent au moment de leur inscription.

---

## Étape 5 — Couper les comptes de démonstration

Dans `.env.local`, **supprimez** `VITE_DEMO_LOGIN` (ou mettez `false`), et faites
de même chez Vercel.

Ces comptes (`admin`/`admin123`, etc.) ne sont acceptés que si la variable vaut
explicitement `true`. En production, l'application doit n'accepter que les
comptes Supabase Auth.

> C'est une variable **de build** : la changer exige de redéployer.

---

## Étape 6 — Vérifier

### En local

```bash
npm run dev
```

Connectez-vous avec `admin` et le mot de passe choisi à l'étape 3b.

- ✅ si l'espace Direction s'ouvre ;
- ❌ « incorrect » → l'étape 4 n'est pas faite, ou l'adresse du compte Auth ne
  correspond pas au nom d'utilisateur.

### Le parcours parent

Sur l'écran de connexion : **Parent → Créer un compte**. Renseignez nom,
prénom, téléphone, identifiant, mot de passe. Vous devez entrer directement
dans l'espace parent, avec la possibility d'enregistrer un enfant.

> Un identifiant déjà pris est refusé : c'est la contrainte d'unicité de
> l'étape 2 qui vous protège d'une usurpation.

### La preuve que la faille est fermée

Sur la page de connexion, console du navigateur :

```js
localStorage.setItem('o-resto-current-user',
  '{"username":"pirate","role":"admin"}');
location.reload();
```

→ Vous rebouchez sur l'écran de connexion. C'est le comportement attendu : la
session n'est plus une valeur que le navigateur choisit, mais un jeton signé
par le serveur, et le rôle est relu en base.

### Cote base

```sql
-- Aucun profil ne doit exposer de hash, et tous doivent être rattachés.
select username, role, auth_id is not null as rattache
from public.users order by role;

-- Un seul profil par identifiant.
select lower(username), count(*)
from public.users group by 1 having count(*) > 1;
```

→ la seconde requête ne doit rien renvoyer.

---

## Étape 7 — Redéployer

Chez Vercel, après avoir posé les variables : **Redeploy**. Puis testez sur
l'URL de production, pas seulement en local.

---

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| Connexion refusée, « incorrect » | Étape 4 non faite, ou adresse Auth ≠ `<username>@oresto-sn.com` |
| Connexion refusée alors que le mot de passe est bon | Compte créé sans fiche : reconnectez-vous, la réparation automatique crée la fiche manquante |
| Parent : « trop de tentatives de création » | Limite anti-spam (5 créations / 10 min) — attendre quelques minutes |
| Parent : « email_address_invalid » au signup | Ancien build avec `@oresto.local` : redéployer, le domaine est `oresto-sn.com` |
| Parent : « compte créé, reconnectez-vous » | idem — c'est exactement ce symptôme |
| Parent : « fiche non enregistrée » | Identifiant déjà pris (unicité de l'étape 2) |
| 400 sur `users?...auth_id=eq...` à la connexion | Colonne `auth_id` absente → migration (étape 4) non faite. Normal : la connexion aboutit par le pont de transition (voir ci-dessous) ; exécutez `supabase-security.sql` pour faire disparaître ces 400 |
| Le paiement ne passe pas | `SUPABASE_SERVICE_ROLE_KEY` absente, ou absente chez Vercel. Avant migration, un parent est identifié par son adresse Auth (pont de transition) — vérifiez d'abord cette clé |
| `infinite recursion detected in policy` | Utilisez la version à jour de `supabase-security.sql` : les fonctions de rôle doivent être `SECURITY DEFINER` et `users` sans `FORCE` |
| `Deux comptes portent le nom …` | Renommez le doublon dans `users`, puis relancez le script |
| Toutes les pages vides après le script | Une table n'a plus de politique : vérifiez `check_anon_exposure()` |

---

## Révoquer l'accès si une clé fuite

Si `service_role` est sortie du dépôt ou d'une machine :

1. Dashboard → Project Settings → API → **Rotate** sur `service_role` ;
2. remplacez-la dans `.env.local` **et** chez Vercel ;
3. redéployez.

Pour les mots de passe compromis : Authentication → Users → l'utilisateur →
« Reset password ». Changer un mot de passe ne révoque pas les sessions
existantes ; pour cela, supprimez le compte et recréez-le.
