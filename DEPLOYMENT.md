# Guide de déploiement Vercel

Ce guide explique comment déployer **Palais d'Or** sur Vercel.

## Prérequis

- Code source du projet
- Compte Vercel (offre Hobby gratuite) : https://vercel.com/signup
- **Compte Supabase** (gratuit) : https://supabase.com/
- Base de données Supabase configurée (voir ci-dessous)

## Configuration Supabase

1. Créez un projet sur https://supabase.com/.
2. Dans le **SQL Editor**, exécutez les scripts SQL du dépôt dans l'ordre indiqué
   dans `.env.example`.
3. Notez dans **Settings > API** :
   - `VITE_SUPABASE_URL` (Project URL)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key)
   - `SUPABASE_SERVICE_ROLE_KEY` (service role, **serveur uniquement**)

## Déploiement sur Vercel

1. Ouvrez https://vercel.com/new et importez le dépôt GitHub.
2. Vercel détecte automatiquement :
   - Framework : **Vite**
   - Build command : `npm run build`
   - Output directory : `dist`
3. Dans **Settings > Environment Variables**, ajoutez les variables en
   **Production** :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_APP_URL=https://orestosn.com`
   - `SYCAPAY_BASE_URL`
   - `SYCAPAY_LOGIN_API`
   - `SYCAPAY_MDP_API`
   - `SYCAPAY_CA_CRT`
   - `SYCAPAY_CLIENT_CERT_B64`
   - `SYCAPAY_CLIENT_KEY_B64`
   - `SYCAPAY_WEBHOOK_SECRET`
   - `SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE=true`
4. Cliquez sur **Deploy**.

Les variables `SYCAPAY_*` et `SUPABASE_SERVICE_ROLE_KEY` ne doivent jamais
être préfixées par `VITE_` : elles seraient exposées dans le navigateur.

Le projet doit rester sous la limite de **12 fonctions** de l'offre Hobby :
chaque fichier de `api/` compte. N'ajoutez pas de route sans en supprimer une.

## Déploiement en ligne de commande

```bash
npm.cmd install -g vercel
vercel login
vercel --prod
```

Le projet Vercel est déjà lié dans `.vercel/project.json`.

## Domaine personnalisé

Dans **Settings > Domains**, ajoutez `orestosn.com` et `www.orestosn.com`.
Chez le registrar (Amenworld) :

```
A      @      76.76.21.21
CNAME  www    cname.vercel-dns.com
```

Vercel fournit le certificat SSL automatiquement.

## Vérification après déploiement

```bash
curl -s "https://orestosn.com/api/sycapay/status"
curl -s "https://orestosn.com/api/sycapay/status?probe=1"
```

Le webhook SycaPay doit être déclaré sur :

```
https://orestosn.com/api/sycapay/webhook
```

## Paiements SycaPay

Vercel (offre gratuite) utilise une IP de sortie dynamique. Si SycaPay répond
`1117` (IP non autorisée), consultez `egress.primary` dans la sonde, ajoutez
cette IP dans l'allowlist SycaPay pour un test immédiat, ou configurez
`SYCAPAY_PROXY_URL` avec un proxy à IP fixe pour une solution durable.

Voir `docs/SYCAPAY_INTEGRATION.md` section 8 pour le diagnostic complet.
