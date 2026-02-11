# 🔐 Système d'Authentification - Miam streetfood

Ce guide explique comment fonctionne le système d'authentification avec gestion des rôles.

## 👥 Types d'utilisateurs

### 1. **Caissier** 👤
Accès limité aux fonctionnalités de vente :
- ✅ Menu (consultation uniquement)
- ✅ Caisse (POS) - Point de vente
- ✅ Commandes - Historique des commandes
- ✅ Profil - Gestion de compte
- ❌ Tableau de bord (statistiques)
- ❌ Gestion du menu (modifier/ajouter produits)

**Identifiants par défaut :**
- Nom d'utilisateur : `caissier`
- Mot de passe : `caissier123`

### 2. **Manager** 👑
Accès complet à toutes les fonctionnalités :
- ✅ Tableau de bord - Statistiques et rapports
- ✅ Gestion du menu - Ajouter/modifier produits
- ✅ Caisse (POS)
- ✅ Commandes
- ✅ Profil
- ✅ Réinitialisation des données
- ✅ Téléchargement des rapports PDF

**Identifiants par défaut :**
- Nom d'utilisateur : `manager`
- Mot de passe : `manager123`

## 🚀 Utilisation

### Connexion

1. Au démarrage de l'application, vous voyez la page de sélection de rôle
2. Choisissez votre rôle : **Caissier** ou **Manager**
3. Entrez vos identifiants
4. Cliquez sur "Se connecter"

### Changer de mot de passe

1. Cliquez sur votre nom en bas du menu latéral
2. Ou allez dans **Profil** via le menu
3. Cliquez sur "Changer le mot de passe"
4. Entrez votre mot de passe actuel
5. Entrez votre nouveau mot de passe (minimum 6 caractères)
6. Confirmez le nouveau mot de passe
7. Cliquez sur "Modifier"

⚠️ **Important** : Vous devez connaître votre mot de passe actuel pour le changer.

### Déconnexion

1. Allez dans **Profil**
2. Cliquez sur le bouton rouge "Se déconnecter"
3. Confirmez la déconnexion

## 📊 Fonctionnalités Manager

### Réinitialiser les données

Le bouton **Réinitialiser** sur le tableau de bord permet de :
- Supprimer toutes les commandes
- Remettre les statistiques à zéro
- ⚠️ **Action irréversible !**

### Télécharger le rapport PDF

Le bouton **Rapport PDF** sur le tableau de bord génère :
- Rapport mensuel complet
- Statistiques du mois (revenus, commandes, clients)
- Top 5 des produits les plus vendus
- Liste des dernières commandes
- Format PDF téléchargeable

## 🔧 Stockage des données

**⚠️ IMPORTANT : Cette application utilise maintenant EXCLUSIVEMENT Supabase pour le stockage des données.**

### Configuration requise

L'application nécessite une base de données Supabase configurée pour fonctionner. Voir le fichier [README.md](README.md#-configuration-supabase) pour les instructions d'installation.

### Avec Supabase (REQUIS)
- ✅ Données sauvegardées dans le cloud (PostgreSQL)
- ✅ Synchronisation multi-appareils
- ✅ Backup automatique
- ✅ Accès sécurisé avec Row Level Security
- ✅ Persistance complète des commandes et produits
- ✅ Conservation des données après rafraîchissement de page

### Tables Supabase

L'application utilise 3 tables principales :

1. **users** : Comptes utilisateurs avec rôles (caissier/manager)
2. **orders** : Toutes les commandes avec détails complets
3. **products** : Catalogue de produits avec disponibilité

Toutes ces tables sont créées automatiquement via le script `supabase-setup.sql`.

## 🛡️ Sécurité

### Mots de passe

⚠️ **Important** : Pour la production, vous devriez :
1. Changer les mots de passe par défaut
2. Utiliser des mots de passe forts (12+ caractères)
3. Activer le chiffrement des mots de passe
4. Implémenter Supabase Auth pour une vraie authentification

### Recommandations

- Ne partagez jamais vos mots de passe
- Changez régulièrement vos mots de passe
- Utilisez des mots de passe différents pour chaque compte
- Déconnectez-vous après chaque session

## 🔄 Migration vers Supabase Auth

Pour une authentification plus sécurisée avec Supabase :

1. Créez la table `users` dans Supabase (déjà dans `supabase-setup.sql`)
2. Les utilisateurs seront stockés dans le cloud
3. Possibilité d'ajouter plus d'utilisateurs
4. Gestion avancée des permissions

La table `users` contient :
```sql
- id : Identifiant unique
- username : Nom d'utilisateur
- password : Mot de passe (à chiffrer en production)
- role : caissier ou manager
- created_at : Date de création
- updated_at : Date de modification
```

## 📱 Interface

### Page de connexion
- Design moderne et responsive
- Choix du rôle visuel
- Messages d'erreur clairs
- Animation fluide

### Page Profil
- Informations de compte
- Permissions détaillées
- Changement de mot de passe
- Déconnexion sécurisée

## 🆘 Dépannage

### J'ai oublié mon mot de passe

**Solution** : 
1. Connectez-vous à votre dashboard Supabase
2. Allez dans **Table Editor** > **users**
3. Trouvez votre compte et modifiez le mot de passe
4. Ou supprimez votre compte et utilisez les comptes par défaut :
   - Caissier : `caissier` / `caissier123`
   - Manager : `manager` / `manager123`

**Alternative (développement uniquement)** :
1. Ouvrez la console du navigateur (F12)
2. Tapez : `sessionStorage.removeItem('miam-current-user')`
3. Rechargez la page pour revenir à l'écran de connexion

### Je ne peux pas me connecter

Vérifiez que :
1. **Supabase est configuré** : Fichier `.env.local` existe avec vos clés
2. **Les tables existent** : Script `supabase-setup.sql` a été exécuté
3. **Les identifiants sont corrects** : Utilisez les comptes par défaut pour tester
4. **La connexion Internet fonctionne** : Supabase nécessite une connexion

### Je ne peux pas accéder à une page

Vérifiez que votre rôle a les permissions nécessaires :
- **Caissiers** : Menu, POS, Commandes, Profil
- **Managers** : Tout

Le sidebar n'affiche que les pages accessibles selon votre rôle.

### Les données ne se sauvegardent pas

Vérifiez que :
1. **Supabase est bien configuré** dans `.env.local`
2. **Les colonnes existent** dans la base de données :
   - Table `orders` : doit avoir les colonnes `extras`, `amount_received`, `change`
   - Table `products` : doit avoir les colonnes `available`, `extras`
3. **Les politiques RLS sont actives** : Le script SQL les configure automatiquement
4. **La console affiche des erreurs** : Ouvrez F12 et regardez les messages (🔵, ✅, ❌)

## 🎯 Améliorations futures

### ✅ Déjà implémentées (v2.0.0)
- [x] Migration complète vers Supabase
- [x] Persistance des commandes et produits
- [x] Système de rôles fonctionnel
- [x] Sessions avec sessionStorage
- [x] Dialogues de confirmation personnalisés

### 🚧 Prévues pour les prochaines versions
- [ ] Chiffrement des mots de passe avec bcrypt
- [ ] Migration vers Supabase Auth (authentification native)
- [ ] Récupération de mot de passe par email
- [ ] Authentification à deux facteurs (2FA)
- [ ] Journal d'activité des utilisateurs
- [ ] Gestion avancée des permissions (rôles personnalisés)
- [ ] Sessions avec expiration automatique configurable
- [ ] Mode hors ligne avec synchronisation automatique
- [ ] Multi-tenancy (plusieurs restaurants sur une instance)

## 📞 Support

Pour toute question sur l'authentification :
- Consultez ce fichier
- Vérifiez les logs dans la console (F12)
- Assurez-vous que JavaScript est activé

---

**Développé avec ❤️ pour Miam streetfood**
