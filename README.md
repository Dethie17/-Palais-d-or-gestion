<div align="center">

# 🍔 Miam Street Food

### Application de gestion complète pour restaurant et street food

[![React](https://img.shields.io/badge/React-18.3.1-61dafb?logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4.19-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.17-38bdf8?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Démo](#-fonctionnalités) • [Installation](#-installation) • [Documentation](#-utilisation) • [Configuration](#️-configuration) • [Contribution](#-contribution)

</div>

---

## 📋 Table des matières

- [À propos](#-à-propos)
- [Fonctionnalités](#-fonctionnalités)
- [Technologies](#️-technologies)
- [Installation](#-installation)
- [Configuration Supabase](#-configuration-supabase)
- [Utilisation](#-utilisation)
- [Structure du projet](#-structure-du-projet)
- [Configuration](#️-configuration)
- [Authentification](#-authentification)
- [Contribution](#-contribution)
- [Licence](#-licence)

---

## 🎯 À propos

**Miam Street Food** est une application web moderne de gestion complète pour restaurants et street food. Développée avec React et TypeScript, elle offre une interface intuitive et élégante pour gérer tous les aspects d'un établissement de restauration rapide.

### ✨ Points forts

- 💰 **Devise FCFA** - Système de prix en Franc CFA (Afrique de l'Ouest)
- 🎨 **Design moderne** - Interface gradient orange-rouge avec animations fluides
- 📱 **Responsive** - Adapté à tous les écrans (mobile, tablette, desktop)
- ⚡ **Performance** - Build optimisé avec Vite pour des temps de chargement ultra-rapides
- 🧩 **Composants réutilisables** - Bibliothèque shadcn-ui pour une cohérence visuelle
- 🔐 **Authentification sécurisée** - Système de rôles (caissier/manager) avec Supabase
- 💾 **Persistance des données** - Sauvegarde automatique dans PostgreSQL via Supabase
- 🔄 **Synchronisation temps réel** - Mise à jour optimiste avec rollback automatique

---

## 🚀 Fonctionnalités

### � Authentification et Rôles
- **Rôle Caissier** : Accès Menu, POS, Commandes, Profil
- **Rôle Manager** : Accès complet + Dashboard, Gestion menu, Statistiques
- Changement de mot de passe sécurisé
- Session persistante avec sessionStorage
- Déconnexion avec confirmation personnalisée

### �📊 Dashboard
- Vue d'ensemble des statistiques en temps réel
- Indicateurs de performance (revenus, commandes, clients)
- Graphiques de ventes avec Recharts
- Top produits les plus vendus
- Design avec cartes gradient et icônes Lucide React

### 🍕 Gestion du menu
- CRUD complet des produits (Créer, Lire, Modifier, Supprimer)
- **Persistance automatique dans Supabase** - Les modifications sont sauvegardées en temps réel
- Catégories : Burgers, Pizzas, Boissons, Desserts, Accompagnements
- Gestion des extras/suppléments avec prix additionnels
- Upload d'images pour chaque produit
- Statut de disponibilité persistant (conservé après rafraîchissement)
- Filtrage par catégorie
- Dialogues de confirmation personnalisés (sans popups navigateur)

### 💳 Point de vente (POS)
- Interface de caisse intuitive et rapide
- Système de panier avec ajout/modification/suppression
- Gestion des quantités en temps réel
- Calcul automatique du sous-total, TVA (10%) et total
- Sélection d'extras pour chaque produit
- Navigation fluide vers le paiement

### 💰 Gestion des paiements
- Méthodes de paiement multiples :
  - 💵 Espèces (avec calcul de monnaie)
  - 💳 Carte bancaire
  - 📱 Mobile Money
  - 🧾 Chèque
- Pavé numérique pour saisie du montant reçu
- Validation automatique des paiements
- Génération de ticket de caisse

### 🧾 Reçu de caisse
- Ticket professionnel avec logo
- Détails de la commande et articles
- Animation de succès
- Options d'impression et téléchargement PDF
- Bouton pour nouvelle commande

### 📦 Historique des commandes
- **Persistance complète dans Supabase** - Toutes les commandes sont sauvegardées
- Liste complète des commandes avec filtres
- Statuts : En attente, En préparation, Prêt, Terminé, Annulé
- Détails : Numéro, heure, type (sur place/à emporter), montant
- Actions : Accepter, Refuser, Marquer comme prêt/terminé
- Compteurs par statut en temps réel
- Synchronisation automatique entre les onglets
- Conservation des données après rafraîchissement de la page

---

## 🛠️ Technologies

### Frontend
- **React 18.3.1** - Bibliothèque UI
- **TypeScript 5.8.3** - Typage statique
- **Vite 5.4.19** - Build tool ultra-rapide
- **Tailwind CSS 3.4.17** - Framework CSS utilitaire
- **shadcn-ui** - Composants UI modernes et accessibles

### Backend & Base de données
- **Supabase** - Backend as a Service (BaaS)
- **PostgreSQL** - Base de données relationnelle
- **Row Level Security (RLS)** - Sécurité au niveau des lignes
- **Real-time subscriptions** - Mises à jour en temps réel

### Bibliothèques
- **@supabase/supabase-js** - Client Supabase pour JavaScript
- **Lucide React** - Icônes modernes (500+ icônes)
- **Recharts 2.15.4** - Graphiques et visualisations
- **jsPDF** - Génération de PDF pour les reçus
- **React Hook Form** - Gestion de formulaires
- **Zod** - Validation de schémas
- **date-fns** - Manipulation de dates
- **Radix UI** - Primitives UI accessibles

### Développement
- **ESLint** - Linting JavaScript/TypeScript
- **Vitest** - Framework de tests unitaires
- **Testing Library** - Tests de composants React
- **PostCSS** - Transformation CSS
- **Autoprefixer** - Compatibilité navigateurs

---

## 📦 Installation

### Prérequis

- **Node.js** v16+ ([Télécharger](https://nodejs.org/))
- **npm** v7+ ou **yarn** v1.22+
- **Git** ([Télécharger](https://git-scm.com/))
- **Compte Supabase** (gratuit) - [Créer un compte](https://supabase.com/)

### Étapes d'installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/etudiantcisse/miam-street-food.git

# 2. Accéder au répertoire
cd miam-street-food

# 3. Installer les dépendances
npm install
# ou
yarn install

# 4. Configurer les variables d'environnement
cp .env.example .env.local
# Éditez .env.local avec vos identifiants Supabase

# 5. Lancer le serveur de développement
npm run dev
# ou
yarn dev
```

L'application sera accessible à l'adresse : **http://localhost:8080**

---

## 🔧 Configuration Supabase

### 1. Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com/) et créez un compte
2. Créez un nouveau projet
3. Notez votre **URL** et **anon key** du projet

### 2. Configurer les variables d'environnement

Créez un fichier `.env.local` à la racine du projet :

```env
VITE_SUPABASE_URL=votre_url_supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anon_supabase
```

### 3. Initialiser la base de données

1. Ouvrez le **SQL Editor** dans votre dashboard Supabase
2. Copiez le contenu du fichier `supabase-setup.sql`
3. Exécutez le script pour créer les tables

Le script crée automatiquement :
- Table `users` (utilisateurs avec rôles)
- Table `orders` (commandes avec tous les champs)
- Table `products` (produits avec disponibilité)
- Politiques RLS (Row Level Security)
- Index pour optimiser les performances
- Comptes par défaut (caissier/manager)

### 4. Vérifier l'installation

Lancez l'application et connectez-vous avec :

**Caissier** :
- Username: `caissier`
- Password: `caissier123`

**Manager** :
- Username: `manager`
- Password: `manager123`

---

## 💻 Utilisation

### Commandes disponibles

```bash
# Développement
npm run dev              # Lance le serveur de développement

# Build
npm run build            # Build de production
npm run build:dev        # Build de développement

# Prévisualisation
npm run preview          # Prévisualise le build de production

# Tests
npm run test             # Lance les tests
npm run test:watch       # Tests en mode watch

# Qualité de code
npm run lint             # Vérifie le code avec ESLint
```

### Navigation dans l'application

1. **Dashboard** - Accédez aux statistiques et performances
2. **Menu** - Gérez vos produits et catégories
3. **Point de vente** - Créez de nouvelles commandes
4. **Commandes** - Suivez l'état des commandes en cours
5. **Paiement** - Finalisez les transactions
6. **Reçu** - Imprimez ou téléchargez les tickets

---

## 📁 Structure du projet

```
miam-street-food/
├── public/                 # Fichiers statiques
│   └── robots.txt
├── src/
│   ├── components/         # Composants réutilisables
│   │   ├── ConfirmDialog.tsx  # Dialog de confirmation personnalisé
│   │   ├── NavLink.tsx        # Lien de navigation
│   │   ├── layout/            # Composants de layout
│   │   │   └── Sidebar.tsx    # Menu latéral avec gestion de rôles
│   │   └── ui/                # Composants UI shadcn-ui (40+ composants)
│   ├── context/            # Contextes React (gestion d'état global)
│   │   ├── AppContext.tsx     # Gestion des commandes + Supabase
│   │   ├── AuthContext.tsx    # Authentification + SessionStorage
│   │   └── ProductContext.tsx # Gestion des produits + Supabase
│   ├── data/              # Données initiales
│   │   └── mockData.ts    # Produits par défaut (initialisés dans Supabase)
│   ├── hooks/             # Hooks personnalisés
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── lib/               # Utilitaires et configuration
│   │   ├── supabase.ts    # Client Supabase + Types Database
│   │   └── utils.ts       # Fonctions utilitaires (FCFA, formatage)
│   ├── pages/             # Pages de l'application
│   │   ├── Dashboard.tsx          # Statistiques (Manager uniquement)
│   │   ├── LoginPage.tsx          # Page de connexion
│   │   ├── MenuManagement.tsx     # Gestion du menu
│   │   ├── OrderHistoryPage.tsx   # Historique des commandes
│   │   ├── PaymentPage.tsx        # Page de paiement
│   │   ├── POSPage.tsx            # Point de vente
│   │   ├── ProfilePage.tsx        # Profil utilisateur
│   │   └── ReceiptPage.tsx        # Reçu de caisse
│   ├── types/             # Définitions TypeScript
│   │   └── menu.ts        # Types Product, Order, CartItem, etc.
│   ├── App.tsx            # Composant racine avec Providers
│   ├── main.tsx           # Point d'entrée
│   └── index.css          # Styles globaux + animations
├── supabase-setup.sql     # Script de création des tables Supabase
├── .env.local             # Variables d'environnement (à créer)
├── package.json           # Dépendances et scripts
├── tsconfig.json          # Configuration TypeScript
├── vite.config.ts         # Configuration Vite
└── tailwind.config.ts     # Configuration Tailwind CSS
```

---

## ⚙️ Configuration

### Devise et conversion

Le projet utilise le **Franc CFA (FCFA)** comme devise principale. Les fonctions de conversion et formatage se trouvent dans `src/lib/utils.ts` :

```typescript
// Taux de conversion EUR vers FCFA
const EUR_TO_FCFA = 655.957;

// Formater un montant en FCFA
formatCurrency(5000) // "5 000 FCFA"

// Convertir EUR vers FCFA
eurToFcfa(10) // 6559.57
```

### Personnalisation des couleurs

Les couleurs principales sont définies dans `tailwind.config.ts` :

```typescript
colors: {
  primary: 'hsl(var(--primary))',      // Orange-rouge
  secondary: 'hsl(var(--secondary))',
  // ...
}
```

### Modification des catégories

Ajoutez ou modifiez les catégories dans `src/data/mockData.ts` :

```typescript
export const categories = [
  'Tous',
  'Burgers',
  'Pizzas',
  // Ajoutez vos catégories ici
];
```

### Configuration Supabase

Les types de base de données sont définis dans `src/lib/supabase.ts` :

```typescript
export interface Database {
  public: {
    Tables: {
      orders: { /* ... */ },
      products: { /* ... */ },
      users: { /* ... */ },
    };
  };
}
```

Si vous modifiez le schéma de la base de données, mettez à jour ces types.

---

## 🔐 Authentification

### Système de rôles

**Caissier** (`role: 'caissier'`) :
- ✅ Menu (consultation)
- ✅ Point de vente (POS)
- ✅ Historique des commandes
- ✅ Profil utilisateur
- ❌ Dashboard
- ❌ Gestion du menu (modification)

**Manager** (`role: 'manager'`) :
- ✅ Accès complet à toutes les fonctionnalités
- ✅ Dashboard avec statistiques
- ✅ Gestion complète du menu
- ✅ Réinitialisation des données
- ✅ Téléchargement de rapports PDF

### Identifiants par défaut

Ces comptes sont créés automatiquement par le script `supabase-setup.sql` :

```
Caissier:
  Username: caissier
  Password: caissier123

Manager:
  Username: manager
  Password: manager123
```

⚠️ **Important** : Changez ces mots de passe par défaut en production !

### Gestion des sessions

- Les sessions utilisent `sessionStorage` (temporaire)
- Expiration à la fermeture du navigateur
- Connexion via Supabase (table `users`)
- Changement de mot de passe sécurisé

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Voici comment participer :

### 1. Fork et clone

```bash
# Forker le dépôt sur GitHub puis :
git clone https://github.com/VOTRE_USERNAME/miam-street-food.git
cd miam-street-food
```

### 2. Créer une branche

```bash
git checkout -b feature/ma-nouvelle-fonctionnalite
```

### 3. Développer et tester

```bash
# Faire vos modifications puis :
npm run lint        # Vérifier le code
npm run test        # Lancer les tests
npm run build       # Tester le build
```

### 4. Commit et Push

```bash
git add .
git commit -m "✨ Ajout d'une nouvelle fonctionnalité"
git push origin feature/ma-nouvelle-fonctionnalite
```

### 5. Pull Request

Créez une Pull Request sur GitHub avec une description détaillée.

### Convention de commits

Utilisez des emojis pour catégoriser vos commits :

- ✨ `:sparkles:` - Nouvelle fonctionnalité
- 🐛 `:bug:` - Correction de bug
- 📝 `:memo:` - Documentation
- 🎨 `:art:` - Amélioration du style/UI
- ⚡ `:zap:` - Performance
- ♻️ `:recycle:` - Refactoring
- 🧪 `:test_tube:` - Tests

---

## 📄 Licence

Ce projet est sous licence **MIT**. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 👨‍💻 Auteur

**Babacar Cissé**

- GitHub: [@etudiantcisse](https://github.com/etudiantcisse)
- Dépôt: [miam-street-food](https://github.com/etudiantcisse/miam-street-food)

---

## 🙏 Remerciements

- [shadcn-ui](https://ui.shadcn.com/) pour les composants UI
- [Lucide](https://lucide.dev/) pour les icônes
- [Unsplash](https://unsplash.com/) pour les images de démonstration
- La communauté React et TypeScript

---

<div align="center">

**⭐ Si ce projet vous plaît, n'oubliez pas de lui donner une étoile sur GitHub ! ⭐**

Fait avec ❤️ pour la communauté de la restauration rapide

</div>
