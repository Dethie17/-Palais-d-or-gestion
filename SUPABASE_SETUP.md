# 🗄️ Configuration Supabase - Miam streetfood

Ce guide vous explique comment configurer la base de données Supabase pour synchroniser vos données entre tous vos appareils.

## 📋 Prérequis

Vous avez déjà :
- ✅ URL du projet Supabase : `https://cwrsxofgehsjyztyyhlt.supabase.co`
- ✅ Clé publique configurée dans `.env.local`

## 🚀 Étapes d'installation

### 1️⃣ Créer les tables dans Supabase

1. Connectez-vous à votre projet Supabase : https://cwrsxofgehsjyztyyhlt.supabase.co
2. Dans le menu latéral, cliquez sur **"SQL Editor"**
3. Cliquez sur **"New query"**
4. Ouvrez le fichier `supabase-setup.sql` de ce projet
5. **Copiez tout le contenu** du fichier
6. **Collez-le** dans l'éditeur SQL de Supabase
7. Cliquez sur **"Run"** pour exécuter le script

Le script va créer :
- ✅ Table `orders` (commandes)
- ✅ Table `products` (produits du menu)
- ✅ Index pour optimiser les performances
- ✅ Politiques de sécurité (RLS)

### 2️⃣ Installer les dépendances

```bash
npm install @supabase/supabase-js jspdf
```

Note: `jspdf` est nécessaire pour générer les rapports PDF mensuels depuis le tableau de bord.

### 3️⃣ Vérifier le fichier `.env.local`

Assurez-vous que le fichier `.env.local` existe à la racine du projet avec :

```env
VITE_SUPABASE_URL=https://cwrsxofgehsjyztyyhlt.supabase.co
VITE_SUPABASE_ANON_KEY=votre_clé_ici
```

⚠️ **Important** : Ce fichier est déjà dans `.gitignore` et ne sera pas partagé sur GitHub.

### 4️⃣ Démarrer l'application

```bash
npm run dev
```

## 🎯 Fonctionnalités

Maintenant votre application :

✅ **Sauvegarde automatique** dans le cloud  
✅ **Synchronisation multi-appareils** en temps réel  
✅ **Données persistantes** (ne se perdent plus)  
✅ **Accessible partout** avec connexion internet  
✅ **Backup automatique** par Supabase  

## 🔧 Structure des données

### Table `orders`
- `id` : Identifiant unique
- `number` : Numéro de commande (CMD-XXX)
- `items` : Produits de la commande (JSON)
- `subtotal` : Sous-total
- `tax` : Taxes
- `total` : Total
- `status` : Statut (pending, preparing, ready, completed, cancelled)
- `type` : Type (dine-in, takeaway)
- `customer_name` : Nom du client
- `payment_method` : Méthode de paiement
- `created_at` : Date de création
- `updated_at` : Date de modification

### Table `products`
- `id` : Identifiant unique
- `name` : Nom du produit
- `category` : Catégorie
- `price` : Prix
- `description` : Description
- `image` : URL de l'image
- `available` : Disponible (true/false)
- `extras` : Extras du produit (JSON)
- `created_at` : Date de création
- `updated_at` : Date de modification

## 🔐 Sécurité

Les politiques RLS (Row Level Security) sont configurées pour :
- Autoriser la lecture publique des données
- Autoriser la création/modification/suppression des données

⚠️ **Pour la production**, vous devriez ajouter une authentification et restreindre les accès.

## 📱 Tester la synchronisation

1. Ouvrez l'application sur votre ordinateur
2. Créez une nouvelle commande
3. Ouvrez l'application sur un autre appareil (même compte Supabase)
4. Les données devraient apparaître automatiquement ! ✨

## 🐛 Dépannage

### Les données ne se synchronisent pas ?

1. Vérifiez que les tables sont créées dans Supabase (SQL Editor → Tables)
2. Vérifiez la console du navigateur pour les erreurs
3. Vérifiez que les clés API dans `.env.local` sont correctes
4. Assurez-vous d'avoir exécuté `npm install`

### Erreur "Table doesn't exist" ?

Cela signifie que vous n'avez pas exécuté le script SQL. Suivez l'étape 1 ci-dessus.

## 📞 Support

Si vous rencontrez des problèmes, vérifiez :
- Les logs dans la console du navigateur (F12)
- Les logs dans Supabase Dashboard → Logs
- Que votre clé API est valide

## 🎉 C'est tout !

Votre application est maintenant connectée à une vraie base de données cloud ! 🚀
