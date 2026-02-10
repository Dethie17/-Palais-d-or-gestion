# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
