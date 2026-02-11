# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2.0.0] - 2026-02-12

### 🚀 Migration majeure vers Supabase

Cette version représente une refonte complète de la persistance des données et de l'authentification.

### ✨ Ajouté

#### 🔐 Système d'authentification complet
- Authentification via Supabase (table `users`)
- Système de rôles : Caissier et Manager
- Page de connexion sécurisée avec sélection de rôle
- Gestion de sessions avec sessionStorage
- Changement de mot de passe sécurisé
- Déconnexion avec confirmation personnalisée

#### 💾 Persistance des données avec Supabase
- **ProductContext** : Gestion globale des produits
  - Chargement automatique depuis Supabase au démarrage
  - Sauvegarde automatique de toutes les modifications
  - Initialisation automatique avec produits par défaut
  - Mise à jour optimiste avec rollback en cas d'erreur
- **AppContext** : Gestion des commandes
  - Toutes les commandes sauvegardées dans PostgreSQL
  - Synchronisation temps réel entre les onglets
  - Conservation des données après rafraîchissement
  - Logs de débogage détaillés (🔵, ✅, ❌)
- **AuthContext** : Gestion de l'authentification
  - Connexion asynchrone via Supabase
  - Persistance de session temporaire
  - État de chargement initial

#### 🎨 Composants personnalisés
- **ConfirmDialog** : Dialogue de confirmation personnalisé
  - 3 types : danger, warning, info
  - Icônes personnalisées par type
  - Animations fluides (fade-in, scale-in)
  - Remplace tous les `confirm()` et `alert()` natifs

#### 🗄️ Base de données PostgreSQL
- Script `supabase-setup.sql` pour initialisation complète
- Tables : `users`, `orders`, `products`
- Row Level Security (RLS) configuré
- Politiques d'accès public pour développement
- Index pour optimisation des performances
- Triggers pour mise à jour automatique des timestamps
- Comptes par défaut (caissier/manager)

#### 📝 Documentation améliorée
- README.md mis à jour avec configuration Supabase
- Fichier `.env.example` pour variables d'environnement
- Section authentification détaillée
- Instructions d'installation Supabase étape par étape
- Structure du projet complète avec nouveaux contextes

### 🔄 Modifié

#### 🍕 Gestion du menu
- Migration de `useState` local vers `ProductContext`
- Statut de disponibilité persistant après navigation
- `confirm()` remplacé par ConfirmDialog
- Ajout/modification/suppression synchronisés avec Supabase
- Conservation de l'état entre les changements d'onglet

#### 💳 Point de vente (POS)
- Utilise `useProducts()` au lieu de `mockProducts`
- Affiche toujours l'état réel de disponibilité des produits
- Synchronisation automatique avec la base de données

#### 📦 Historique des commandes
- Chargement depuis Supabase au lieu de localStorage
- Persistance complète après rafraîchissement
- Mise à jour optimiste de l'interface
- ConfirmDialog pour toutes les actions critiques

#### 👤 Profil utilisateur
- Changement de mot de passe asynchrone
- Sauvegarde dans Supabase
- Déconnexion avec confirmation personnalisée

#### 📊 Dashboard
- ConfirmDialog pour réinitialisation des données
- Statistiques basées sur les données Supabase
- Bouton de réinitialisation sécurisé

### 🗑️ Supprimé

#### ❌ localStorage
- Suppression complète de localStorage pour les utilisateurs
- Suppression du hook `useLocalStorage.ts`
- Migration vers sessionStorage pour les sessions temporaires

#### ❌ Données mock automatiques
- Suppression de l'insertion automatique de commandes mock
- Produits mock utilisés uniquement pour l'initialisation
- Base de données vide au premier lancement

#### ❌ Dialogues natifs du navigateur
- Suppression de tous les `window.confirm()`
- Suppression de tous les `window.alert()`
- Remplacement par ConfirmDialog personnalisé

### 🐛 Corrigé

#### 🔧 Problèmes de persistance
- **Produits** : La disponibilité se réinitialisait après changement d'onglet → Résolu avec ProductContext
- **Commandes** : Disparaissaient après rafraîchissement → Résolu avec Supabase
- **Statistiques** : Se réinitialisaient à chaque page → Résolu avec persistance dans PostgreSQL

#### 🔧 Schéma de base de données
- Ajout des colonnes manquantes : `extras`, `amount_received`, `change`
- Types TypeScript mis à jour dans `supabase.ts`
- Correction de l'erreur 400 "Could not find the 'amount_received' column"

#### 🔧 Architecture
- Commentaire obsolète "Save order to localStorage" corrigé
- Imports manquants ajoutés
- Erreurs TypeScript corrigées

### 🔒 Sécurité

- Authentification sécurisée via Supabase
- Sessions temporaires (expiration à la fermeture du navigateur)
- Row Level Security (RLS) activé sur toutes les tables
- Validation des rôles côté serveur
- Mots de passe stockés en clair (⚠️ à hasher en production)

### ⚡ Performance

- Mise à jour optimiste de l'interface (AppContext, ProductContext)
- Rollback automatique en cas d'erreur Supabase
- Index sur colonnes fréquemment interrogées
- Triggers pour mise à jour automatique des timestamps

### 📦 Dépendances

#### Ajouté
- `@supabase/supabase-js` - Client Supabase officiel

### 🚧 Notes de migration

Si vous migrez depuis la version 1.x :

1. **Créer un projet Supabase**
   - Inscrivez-vous sur [supabase.com](https://supabase.com)
   - Créez un nouveau projet
   - Notez l'URL et la clé anon

2. **Configurer les variables d'environnement**
   ```bash
   cp .env.example .env.local
   # Éditez .env.local avec vos identifiants Supabase
   ```

3. **Initialiser la base de données**
   - Ouvrez le SQL Editor dans Supabase
   - Exécutez le script `supabase-setup.sql`

4. **Lancer l'application**
   ```bash
   npm run dev
   ```

5. **Se connecter**
   - Utilisez les identifiants par défaut (voir README.md)
   - Changez les mots de passe pour la production

---

## [1.0.0] - 2026-02-10

### ✨ Ajouté

#### 📊 Dashboard
- Statistiques en temps réel (revenus, commandes, clients, produits)
- Graphiques de ventes avec Recharts
- Top 5 produits les plus vendus
- Cartes avec gradient orange-rouge moderne
- Icônes Lucide React pour une meilleure lisibilité

#### 🍕 Gestion du menu
- CRUD complet pour les produits
- Catégories : Burgers, Pizzas, Boissons, Desserts, Accompagnements
- Gestion des extras avec prix additionnels
- Upload d'images pour chaque produit
- Toggle de disponibilité en temps réel
- Modal d'édition/ajout responsive
- Filtrage par catégorie avec boutons élégants

#### 💳 Point de vente (POS)
- Interface de caisse intuitive et rapide
- Système de panier dynamique
- Gestion des quantités (+/-/supprimer)
- Calcul automatique: sous-total, TVA 10%, total
- Sélection d'extras par produit
- Recherche et filtrage par catégorie
- Navigation fluide vers le paiement

#### 💰 Gestion des paiements
- 4 méthodes de paiement :
  - Espèces (avec calcul automatique de monnaie)
  - Carte bancaire
  - Mobile Money
  - Chèque
- Pavé numérique tactile pour montant reçu
- Validation automatique des montants
- Résumé détaillé de la commande
- Génération automatique du ticket

#### 🧾 Reçu de caisse
- Ticket professionnel avec logo
- Détails complets de la commande
- Animation de succès avec icône CheckCircle
- Liste des articles avec quantités
- Sous-total, TVA et total FCFA
- Boutons d'impression et téléchargement PDF
- Action "Nouvelle commande"

#### 📦 Historique des commandes
- Vue d'ensemble de toutes les commandes
- 5 statuts : En attente, En préparation, Prêt, Terminé, Annulé
- Filtres par statut avec compteurs en temps réel
- Détails : numéro, heure, type (sur place/emporter), montant
- Actions contextuelles par statut :
  - En attente : Accepter/Refuser
  - En préparation : Marquer comme prêt
  - Prêt : Marquer comme terminé
- Badges colorés selon le statut
- Design en grille responsive

### 💰 Système FCFA
- Conversion complète de EUR vers FCFA (1 EUR = 655.957 FCFA)
- Fonction `formatCurrency()` avec formatage français (espaces)
- Fonction `eurToFcfa()` pour les conversions
- Affichage cohérent sur toutes les pages

### 🎨 Design & UI
- Interface moderne avec gradients orange-rouge
- Composants shadcn-ui pour cohérence visuelle
- Animations fluides et transitions CSS
- Mode responsive (mobile, tablette, desktop)
- Sidebar avec navigation élégante
- Icônes Lucide React (500+ icônes modernes)
- Thème sombre/clair (préparé)

### 🛠️ Technologies
- React 18.3.1
- TypeScript 5.8.3
- Vite 5.4.19
- Tailwind CSS 3.4.17
- shadcn-ui
- Lucide React 0.462.0
- Recharts 2.15.4
- React Hook Form 7.61.1
- Zod 3.25.76
- TanStack Query 5.83.0

### 📦 Infrastructure
- Configuration ESLint + TypeScript
- Tests avec Vitest
- Testing Library pour React
- Build optimisé avec Vite
- Support TypeScript strict
- Hot Module Replacement (HMR)

### 📝 Documentation
- README.md complet et professionnel
- Guide de contribution (CONTRIBUTING.md)
- Templates d'issues GitHub
- Template de Pull Request
- Code de conduite
- Licence MIT

### 🔧 Configuration
- Structure de projet modulaire
- Composants réutilisables
- Types TypeScript stricts
- Utilitaires de formatage
- Mock data pour développement

---

## [Non publié]

### 🚧 En cours
- Système d'authentification
- Gestion multi-utilisateurs
- Rapports et analytics avancés
- Export Excel/PDF
- Notifications en temps réel
- Mode hors-ligne (PWA)

### 💡 Planifié
- Intégration avec imprimante thermique
- Système de réservation de tables
- Gestion du stock et inventaire
- Programme de fidélité clients
- Multi-restaurants (franchise)
- API REST backend
- Application mobile

---

**Légende:**
- ✨ Ajouté - Nouvelles fonctionnalités
- 🔧 Modifié - Changements dans les fonctionnalités existantes
- 🐛 Corrigé - Corrections de bugs
- 🗑️ Supprimé - Fonctionnalités retirées
- 🔒 Sécurité - Corrections de vulnérabilités
- 📝 Documentation - Changements dans la documentation
- ⚡ Performance - Améliorations de performance
