# 🏛️ PALAIS D'OR - Présentation Complète pour le Propriétaire

## 📋 Vue d'Ensemble du Projet

**Palais d'Or** est une solution complète de gestion de restaurant développée pour automatiser et moderniser l'ensemble des opérations d'un établissement de restauration rapide. C'est une application web moderne, full-stack, prête pour la production.

---

## 🎯 Problèmes Résolus

| Problème Actuel | Solution Palais d'Or |
|----------------|---------------------|
| Gestion manuelle des commandes (papier/cahier) | Digitalisation complète avec suivi en temps réel |
| Erreurs de caisse et pertes d'argent | Caisse automatisée avec calcul exact de la monnaie |
| Perte de temps à la caisse | Interface POS optimisée (< 30 sec/commande) |
| Inventaire manuel des stocks | Gestion menu temps réel avec dispo/inventaire |
| Pas de visibilité sur les ventes | Dashboard temps réel + exports PDF |
| Gestion clients manuelle | Espace Parent + fidélisation QR Code |
| Pas de paiement mobile | Intégration SycaPay (Wave, Max / Orange Money) + Espèces |

---

## 🏗️ Architecture Technique

### Stack Technologique Moderne
```
Frontend:     React 18 + TypeScript + Vite
Styling:      Tailwind CSS + shadcn/ui (Design System)
Backend:      Supabase (PostgreSQL + Auth + Realtime)
Hosting:      Netlify (CDN global, SSL auto)
```

### Pourquoi ce choix ?
- **Coût maîtrisé** : Supabase gratuit jusqu'à 500MB DB + Netlify gratuit
- **Scalabilité** : PostgreSQL gère des millions de commandes
- **Sécurité** : Row Level Security (RLS) natif Supabase
- **Maintenance** : Zéro serveur à gérer (Serverless)

---

## 👥 Rôles & Accès - Matrice Complète

| Fonctionnalité | Parent (Client) | Personnel | Gérant | Admin |
|----------------|-----------------|-----------|--------|-------|
| **Espace Parent** | ✅ Complet | ❌ | ❌ | ✅ |
| Inscription enfants | ✅ | ❌ | ❌ | ✅ |
| Achat menus/abonnements | ✅ | ❌ | ❌ | ✅ |
| Carte prépayée (QR) | ✅ | ❌ | ❌ | ✅ |
| Historique dépenses | ✅ | ❌ | ❌ | ✅ |
| **Menu Récréation (Kiosque)** | ✅ Achat | ✅ Gestion | ❌ | ✅ |
| **Menu Semaine (Cantines)** | ✅ Vue | ✅ **Création/Modif** | ✅ Vue | ✅ |
| **Caisse (POS)** | ❌ | ✅ Complet | ✅ Complet | ✅ |
| Validation repas (QR) | ❌ | ✅ Scan | ✅ Scan | ✅ |
| Abonnés & Paiements | ❌ | ✅ Gestion | ✅ Gestion | ✅ |
| Dashboard Stats | ❌ | ❌ | ✅ Complet | ✅ Complet |
| Gestion Menu (Produits) | ❌ | ✅ CRUD | ✅ CRUD | ✅ CRUD |
| Utilisateurs | ❌ | ✅ Lecture | ✅ CRUD | ✅ CRUD |
| Finance / Rapports PDF | ❌ | ❌ | ❌ | ✅ Complet |

---

## 📱 Pages & Fonctionnalités Détaillées

### 1. 🏠 **Page d'Accueil / Login**
- Design professionnel avec branding Palais d'Or
- Connexion sécurisée (email/mot de passe)
- Mode démo disponible pour tests
- Redirection automatique selon rôle

### 2. 👨‍👩‍👧‍👦 **Espace Parent (Client)**
| Étape | Fonctionnalité |
|-------|----------------|
| 1️⃣ **Inscription** | Enfants par cycle (Primaire/Lycée) - QR Code auto-généré |
| 2️⃣ **Abonnements** | 3 formules (Hebdo 9 500 / Mensuel Primaire 27 000 / Mensuel Lycée 32 000) |
| 3️⃣ **Menu du jour** | Achat ticket jour + Ticket repas libre (carte prépayée) |
| 4️⃣ **Kiosque Récréation** | Snacks/Boissons par catégorie (Récréation/Pause) - Paiement carte prépayée |
| 5️⃣ **Cartes Enfants** | Solde carte + QR Code + Recharge SycaPay (Wave / Max) + Renouvellement |
| 6️⃣ **Historique** | Filtre par enfant + Dépenses mensuelles + Reçus |

### 3. 🍽️ **Menu Récréation (Kiosque Client)**
- **Interface** : Grille produits style kiosque (mobile-first)
- **Catégories** : Récréation (7 items) + Pause (9 items) + Filtres
- **Panier** : Par enfant, quantités, solde carte affiché
- **Paiement** : Carte prépayée (solde déduit instantanément)
- **Ticket** : QR Code `TICKET-XXXXXX` pour validation cantine

### 3. 🍽️ **Gestion Menu Semaine (Personnel/Gérant)**
- **Composition** : 5 jours (Lun-Ven) avec plats + prix unique/jour
- **Publication** : 5 jours obligatoires + prix pour publication
- **Visibilité** : Parents voient menu publié ; Personnel compose

### 4. 🛒 **Point de Vente - POS (Personnel/Gérant)**
| Fonction | Description |
|----------|-------------|
| Catalogue | Grille produits par catégories (10 catégories) |
| Panier latéral | Quantités, extras, sous-total temps réel |
| Extras | Frites, boissons, fromage... par article |
| Paiement | Espèces (calcul monnaie) / Wave / Max / Orange Money via SycaPay |
| Ticket | QR Code commande + impression/téléchargement |

### 5. 💰 Paiements Multi-Méthodes
| Méthode | Fonctionnement | Usage |
|---------|---------------|-------|
| **Espèces** | Pavé numérique + calcul monnaie auto | Comptoir |
| **Wave** | QR Code Wave Business + lien copiable | Mobile |
| **SycaPay** | Redirection sécurisée vers Wave / Max (Orange Money) | Mobile (Sénégal) |
| **Mobile Money** | Orange Money / Free Money / Wave | Mobile |
| **Carte** | Terminal de paiement | Comptoir |

### 6. 🧾 Reçu de Caisse Professionnel
- Logo Palais d'Or + informations établissement
- Détail articles + extras + TVA (10%) + Total
- QR Code de vérification `ORESTO-ORDER:...`
- Impression / Téléchargement PDF / Nouvelle commande

### 7. 📦 Historique Commandes (Temps Réel)
| Fonction | Description |
|----------|-------------|
| Filtres | Par statut / date / type / recherche |
| Statuts | En attente → En préparation → Prêt → Terminé/Annulé |
| Actions | Accepter / Refuser / Prêt / Terminer |
| Compteurs | Temps réel par statut |
| Synchronisation | Multi-onglets temps réel |

### 8. 📊 Dashboard (Gérant/Admin)
| Widget | Description |
|--------|-------------|
| **Clients actifs** | Abonnements en cours |
| **Repas aujourd'hui** | Validations jour |
| **Revenus** | CA temps réel |
| **Top Produits** | Graphique barres |
| **Ventes Hebdo** | Courbe 7 jours |
| **Alertes** | Stock bas, paiements échoués |

### 9. 📄 Rapports PDF (Admin/Gérant)
- Rapport journalier / hebdomadaire / mensuel
- Export PDF professionnel avec logo
- Détail transactions + totaux par méthode

### 10. 👥 Gestion Utilisateurs (Personnel/Admin)
- Liste parents avec recherche (nom/enfant/classe)
- Fiche par parent : enfants, abonnement, solde, repas servis
- **Suppression parent** (admin only) - nettoyage données test

---

## 💳 Intégration Paiements Mobiles (Afrique)

### SycaPay (Sénégal) — Wave, Max / Orange Money
- Passerelle unique : redirection sécurisée vers l’opérateur choisi
- Intention de paiement enregistrée avant redirection (`oresto_payments`)
- Webhook `/api/sycapay/webhook` : signature vérifiée, règlement idempotent
- Retour parent automatique vers `/paiement-succes` ou `/paiement-echec`

### SycaPay — Configuration Requise
```
Variables Vercel :
- SYCAPAY_API_KEY=xxx
- SYCAPAY_MERCHANT_ID=xxx
- SYCAPAY_WEBHOOK_SECRET=xxx
- SUPABASE_SERVICE_ROLE_KEY=xxx
- VITE_APP_URL=https://orestosn.com
```

---

## 🗄️ Base de Données - Schéma Principal

```sql
Tables principales :
├── users              # Utilisateurs (roles: client/personnel/gestionnaire/admin)
├── children           # Enfants liés aux parents (QR Code unique)
├── subscriptions      # Abonnements (formule, dates, repas restants)
├── formulas           # Produits abonnement/ticket (F1, F2, F3, T1, C10)
├── weekly_menus       # Menu semaine Lundi-Vendredi (plats + prix)
├── products           # Produits kiosque (récréation/pause)
├── orders             # Commandes POS (statut, items, extras, paiement)
├── payments           # Paiements (méthode, statut, référence)
├── validations        # Scans QR cantine (anti-double, 1/jour/enfant)
├── wallets            # Cartes prépayées enfants (solde FCFA)
├── wallet_transactions # Historique recharges/débits
├── oresto_payments   # Intentions + règlements SycaPay (Wave / Max)
└── finance_*          # Paramètres compta + dépenses
```

### Sécurité (RLS - Row Level Security)
- Parents voient **seulement** leurs enfants/abonnements/paiements
- Personnel voit **tous** les élèves pour validation
- Gérant/Admin voit **tout** (dashboard, finance, users)
- RLS géré nativement par Supabase (sécurité base)

---

## 🚀 Déploiement & Production

### Netlify (Recommandé)
```bash
# Build command
npm run build

# Publish directory
dist

# Variables d'environnement Netlify
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_URL_PUBLIC=xxx
VITE_SUPABASE_PUBLISHABLE_KEY=xxx
SYCAPAY_WEBHOOK_SECRET=xxx
```

### Variables d'Environnement Requises
```env
# Frontend (Vite)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=xxx
VITE_APP_URL=https://orestosn.com

# Backend (Vercel Functions)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SYCAPAY_API_KEY=xxx
SYCAPAY_MERCHANT_ID=xxx
SYCAPAY_WEBHOOK_SECRET=xxx
```

### Domaine Personnalisé
```
orestosn.com  → Vercel (SSL automatique)
oresto-sn.com → alias (anciens liens + webhook)
```

---

## 💰 Modèle Économique & ROI

### Coûts Mensuels Estimés
| Service | Coût | Note |
|---------|------|------|
| Supabase | 0€ / 25€ | Gratuit < 500MB / Pro 25€/mois |
| Netlify | 0€ / 19$ | Gratuit / Pro 19$/mois |
| Domaine | ~10€/an | ovh/gandi/cloudflare |
| **Total** | **~1€/mois** | Quasi gratuit au démarrage |

### Revenus Potentiels (Exemple)
| Source | Volume/mois | Prix | CA Mensuel |
|--------|-------------|------|------------|
| Abonnements Primaire | 100 | 27 000 | 2 700 000 FCFA |
| Abonnements Lycée | 50 | 32 000 | 1 600 000 FCFA |
| Tickets journaliers | 500 | 1 900 | 950 000 FCFA |
| Kiosque Récréation | 300 jrs | 500 | 150 000 FCFA |
| **Total** | | | **~5,4M FCFA/mois** |

---

## 🔒 Sécurité & Conformité

| Mesure | Implémentation |
|--------|----------------|
| **Authentification** | Supabase Auth (email/password + sessionStorage) |
| **Mots de passe** | Hachés par Supabase (bcrypt) |
| **API** | RLS Supabase + Service Role Key côté serveur |
| **HTTPS** | Netlify SSL auto (Let's Encrypt) |
| **CORS** | Configuré Netlify + Supabase |
| **CSP** | Headers Netlify configurés |
| **Audit** | Table `payment_callbacks` pour traçabilité paiements |

---

## 📈 Roadmap & Évolutions Futures

| Version | Fonctionnalité | Priorité |
|---------|---------------|----------|
| **v1.1** | Notifications Push (Web Push API) | 🔴 Haute |
| **v1.2** | Multi-restaurant (multi-établissement) | 🟡 Moyenne |
| **v1.3** | Application mobile (PWA → Capacitor) | 🟡 Moyenne |
| **v1.4** | IA Prévision stocks / ventes | 🟢 Basse |
| **v2.0** | API publique pour partenaires | 🟢 Basse |

---

## 📞 Support & Maintenance

| Niveau | Description | SLA |
|--------|-------------|-----|
| **Niveau 1** | Bugs critiques (paiement, login) | < 4h |
| **Niveau 2** | Bugs fonctionnels (affichage, UX) | < 24h |
| **Niveau 3** | Évolutions, améliorations | Planifié |

### Monitoring Recommandé
- **Uptime** : UptimeRobot (gratuit)
- **Erreurs** : Sentry (gratuit 5k erreurs/mois)
- **Perf** : Netlify Analytics (9$/mois)
- **Logs** : Netlify Functions logs + Supabase logs

---

## 📞 Contacts & Transfert de Connaissances

### Documentation Technique
- `README.md` - Installation développeur
- `PRESENTATION_PROPRIETAIRE.md` - Ce document
- `supabase-setup.sql` - Script DB complet
- Code commenté TypeScript strict

### Comptes de Test (Pré-créés)
```
Caissier:    caissier / caissier123
Manager:     manager / manager123
Client test: client / client123
```

### Comptes Supabase
- Projet: `rzdgpdskfhidbcczbvqe`
- Dashboard: https://supabase.com/dashboard/project/rzdgpdskfhidbcczbvqe

### Netlify
- Site: `oresto-sn.com` / `www.oresto-sn.com`
- Dashboard: https://app.netlify.com/sites/-Palais-d-or-gestion

---

## ✅ Checklist Livraison

- [x] Code source complet sur GitHub
- [x] Base de données initialisée (script SQL fourni)
- [x] Build production validé (`npm run build` ✅)
- [x] Déploiement Netlify configuré
- [x] Variables d'environnement documentées
- [x] Comptes de test créés
- [x] Documentation technique complète
- [x] Guide déploiement Netlify
- [x] Scripts SQL Supabase fournis
- [x] Variables d'environnement documentées

---

## 🎁 Bonus Inclus

1. **Script de nettoyage test** (`deleteParent` function)
2. **Mode démo** activable (`VITE_DEMO_LOGIN=true`)
3. **Cache-busting** automatique (hash Vite)
4. **PWA Ready** (manifest + service worker ready)
5. **Tests unitaires** (Vitest + Testing Library)
6. **ESLint + TypeScript strict** (qualité code)

---

## 📝 Conclusion

**Palais d'Or** est une solution **clé en main**, **sécurisée**, **scalable** et **économique** pour moderniser la gestion de votre restaurant. 

**Prêt pour la mise en production immédiate** avec un coût d'infrastructure quasi nul au démarrage.

---

*Document généré le $(date) - Version 1.0*
*Pour questions techniques : consulter `README.md` et `supabase-setup.sql`*