# 🚀 Guide de déploiement Netlify

Ce guide explique comment déployer **Miam Street Food** sur Netlify.

## 📋 Prérequis

- Compte GitHub avec le dépôt `miam-street-food`
- Compte Netlify (gratuit) : https://app.netlify.com/signup

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

### 3. Configuration personnalisée (optionnel)

#### Nom de domaine personnalisé

1. Allez dans **Site settings** → **Domain management**
2. Cliquez sur **"Add custom domain"**
3. Suivez les instructions pour configurer votre DNS

#### Variables d'environnement

Si nécessaire, ajoutez des variables dans **Site settings** → **Environment variables**

## 🔧 Déploiement manuel

### Via Netlify CLI

```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Se connecter
netlify login

# Build du projet
npm run build

# Déployer
netlify deploy --prod
```

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
