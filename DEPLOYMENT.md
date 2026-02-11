# 🚀 Guide de déploiement Netlify

Ce guide explique comment déployer **Miam Street Food** sur Netlify.

## 📋 Prérequis

- Compte GitHub avec le dépôt `miam-street-food`
- Compte Netlify (gratuit) : https://app.netlify.com/signup
- **Compte Supabase** (gratuit) : https://supabase.com/
- **Base de données Supabase configurée** (voir section ci-dessous)

## 🗄️ Configuration Supabase (REQUIS)

**⚠️ IMPORTANT** : L'application nécessite Supabase pour fonctionner.

### 1. Créer un projet Supabase

1. Allez sur https://supabase.com/ et créez un compte
2. Créez un nouveau projet
3. Notez votre **Project URL** et **anon public key**

### 2. Initialiser la base de données

1. Dans votre dashboard Supabase, ouvrez le **SQL Editor**
2. Copiez le contenu du fichier `supabase-setup.sql` du dépôt
3. Exécutez le script pour créer :
   - Table `users` (comptes utilisateurs)
   - Table `orders` (commandes)
   - Table `products` (produits)
   - Politiques RLS et index

### 3. Noter les identifiants

Vous aurez besoin de ces 2 valeurs pour Netlify :
- **VITE_SUPABASE_URL** : L'URL de votre projet (ex: `https://xxxxx.supabase.co`)
- **VITE_SUPABASE_ANON_KEY** : La clé publique anon

Trouvez-les dans **Settings** > **API** de votre dashboard Supabase.

## 🌐 Déploiement automatique (recommandé)

### 1. Connexion à Netlify

1. Allez sur https://app.netlify.com/
2. Cliquez sur **"Add new site"** → **"Import an existing project"**
3. Sélectionnez **"Deploy with GitHub"**
4. Autorisez Netlify à accéder à votre compte GitHub

### 2. Configuration du site

1. Sélectionnez le dépôt `etudiantcisse/miam-street-food`
2. Netlify détecte automatiquement les paramètres :
   - **Branch to deploy** : `main`
   - **Build command** : `npm run build`
   - **Publish directory** : `dist`
3. Cliquez sur **"Deploy site"**

### 3. Configuration des variables d'environnement (OBLIGATOIRE)

**⚠️ L'application ne fonctionnera pas sans ces variables !**

1. Allez dans **Site settings** → **Environment variables**
2. Cliquez sur **"Add a variable"**
3. Ajoutez ces 2 variables :

| Clé | Valeur | Exemple |
|-----|--------|---------|
| `VITE_SUPABASE_URL` | URL de votre projet Supabase | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clé anon publique de Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

4. Cliquez sur **"Save"**
5. **Redéployez le site** pour appliquer les variables

### 4. Déploiement final

1. Cliquez sur **"Deploy site"**
2. Attendez la fin du build (2-3 minutes)
3. Le site est en ligne ! 🎉

### 5. Vérification

1. Ouvrez votre site déployé
2. Essayez de vous connecter avec :
   - Username: `manager`
   - Password: `manager123`
3. Si la connexion fonctionne, tout est bon !

### 6. Configuration personnalisée (optionnel)

#### Nom de domaine personnalisé

1. Allez dans **Site settings** → **Domain management**
2. Cliquez sur **"Add custom domain"**
3. Suivez les instructions pour configurer votre DNS

## 🔧 Déploiement manuel

**⚠️ IMPORTANT** : N'oubliez pas de configurer les variables d'environnement Supabase dans Netlify avant le déploiement manuel !

### Via Netlify CLI

```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Se connecter
netlify login

# Créer un fichier .env.local avec vos clés Supabase
echo "VITE_SUPABASE_URL=votre_url" > .env.local
echo "VITE_SUPABASE_ANON_KEY=votre_cle" >> .env.local

# Build du projet
npm run build

# Déployer
netlify deploy --prod
```

**Note** : Les variables d'environnement doivent être configurées dans les paramètres Netlify (voir section précédente).

### Via glisser-déposer

1. Build en local : `npm run build`
2. Allez sur https://app.netlify.com/drop
3. Glissez-déposez le dossier `dist`

## ⚙️ Configuration automatique

Le fichier `netlify.toml` configure automatiquement :

- ✅ Commande de build : `npm run build`
- ✅ Répertoire de publication : `dist`
- ✅ Redirections SPA (pour React Router)
- ✅ Headers de sécurité (XSS, CORS, etc.)
- ✅ Cache optimisé pour les assets
- ✅ Support Node.js 18

## 🔄 Déploiements automatiques

Netlify redéploie automatiquement à chaque push sur `main` :

1. Vous faites un commit et push sur GitHub
2. Netlify détecte le changement
3. Build et déploiement automatiques (2-3 minutes)
4. Site mis à jour !

## 🌍 URL du site

Après déploiement, votre site sera disponible à :
- **URL Netlify** : `https://[nom-aleatoire].netlify.app`
- **URL personnalisée** (recommandé) : `https://miam-street-food.netlify.app`

Pour changer le nom :
1. **Site settings** → **General** → **Site details**
2. Cliquez sur **"Change site name"**
3. Entrez `miam-street-food`

## 📊 Fonctionnalités Netlify gratuites

- ✅ 100 GB de bande passante/mois
- ✅ Builds illimités
- ✅ HTTPS automatique
- ✅ Déploiement continu (CI/CD)
- ✅ Preview deployments (branches)
- ✅ Rollback instantané
- ✅ Formulaires et fonctions serverless (si besoin)

## 🐛 Dépannage

### Build échoue

```bash
# Vérifier que le build fonctionne en local
npm run build

# Vérifier les logs dans Netlify
```

### Page blanche après déploiement

- Vérifiez que `netlify.toml` est bien présent
- Assurez-vous que les redirections SPA sont configurées

### Erreur 404 sur les routes

- Le fichier `netlify.toml` gère automatiquement les redirections SPA
- Vérifiez que la règle `/* → /index.html` est active

## 📝 Checklist de déploiement

- [ ] Code pushé sur GitHub
- [ ] `npm run build` fonctionne en local
- [ ] `netlify.toml` présent à la racine
- [ ] Compte Netlify créé
- [ ] Site connecté au dépôt GitHub
- [ ] Nom de site personnalisé configuré
- [ ] Build réussi sur Netlify
- [ ] Site accessible via l'URL
- [ ] Toutes les pages fonctionnent (navigation)

## 🚀 Optimisations post-déploiement

### Performance
- [ ] Activer la compression Brotli (automatique)
- [ ] Vérifier les scores Lighthouse
- [ ] Optimiser les images si nécessaire

### Analytics
- [ ] Activer Netlify Analytics (payant)
- [ ] Ou intégrer Google Analytics

### Sécurité
- [ ] Vérifier les headers de sécurité
- [ ] Activer les notifications de déploiement
- [ ] Configurer les notifications d'erreur

## 📞 Support

- Documentation Netlify : https://docs.netlify.com/
- Community forum : https://answers.netlify.com/
- Status page : https://www.netlifystatus.com/

---

**Bon déploiement ! 🎉**
