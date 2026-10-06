# Présentation du site O RESTO — Palais d'Or

## 1. Vue d'ensemble

O RESTO est une plateforme web de gestion de restauration scolaire/entreprise (menus, QR Code, paiements Wave/InTouch, caisse POS, abonnements, tableau de bord).

- Application React + Vite + TypeScript, interface responsive (desktop / mobilité / kiosque)
- Base de données Supabase (temps réel), déployée sur Netlify/Vercel
- 4 espaces utilisateur distincts selon le profil connecté
- Connexion par identifiant/mot de passe, accès parent protégé par un code personnel (ParentGate)

## 2. Les espaces utilisateur

| Profil | Rôle | Périmètre |
|---|---|---|
| **Parent** | Inscrire ses enfants, recharger, suivre | Espace Parent unique + profil |
| **Superviseur** (personnel) | Cantine terrain : menus, validation, utilisateurs | Espace le plus large |
| **Caissier** (gestionnaire) | Vente au comptoir | Caisse POS, dashboard, historique — sans accueil |
| **Directeur Général** (admin/manager) | Pilotage | Dashboard, finance, abonnés, utilisateurs, paramètres |

---

## 3. Espace Parent (détaillé)

C'est un parcours continu en 6 étapes (`EspaceParentPage`), avec navigation par ancres.

### Étape 1 — J'inscris mes enfants
- Ajout d'un enfant : nom, prénom, classe
- Chaque enfant reçoit un **QR Code unique**
- Modification/suppression des fiches enfants

### Étape 2 — Je choisis l'abonnement
- 3 formules fixes proposées (comparaison prix/repas)
- Réservation en 1 clic
- Achat d'un ticket repas (formule) → paiement
- Paiement par **Wave** ou **InTouch** ou espèces : modale de paiement avec code de confirmation, minuteur d'expiration, envoi à `{merchantName}`

### Étape 3 — Menu du jour
- Consultation des menus du jour publiés (plats + prix)
- Vision par cycle scolaire

### Étape 4 — Kiosque Récréation & Pause
- Snacks et boissons payés par la **carte prépayée** de l'enfant
- Commande à récupérer à la cantine

### Étape 5 — Mes cartes
- Visualisation des cartes prépayées et de leurs soldes
- **Recharge** de carte (Wave / InTouch / Espèces), suivi du solde par carte

### Étape 6 — Historique des dépenses
- Filtre par enfant (Tous / chaque enfant)
- Détail des opérations : recharges, abonnements, repas servis ou refusés, passages validés
- Statuts de paiement (payé, en attente, échoué), export/reçu

### En plus
- **Mon QR Code** : badges scannables des enfants, export PNG, impression
- **Profil** : informations du compte parent
- Pages de confirmation : paiement réussi / échoué

---

## 4. Espace Superviseur (Personnel de service)

Mission : supervision complète de la cantine.

- **Accueil** personnalisé avec statistiques
- **Validation repas** : scan QR caméra ou saisie, contrôle auto (actif, date, solde, anti-double 1/jour), passages servis/refusés en temps réel
- **Gestion Menu** : composition des menus du jour, publication de la semaine, création de tickets repas (nom, prix, durée, repas)
- **Menu Récréation** : snacks/boissons du kiosque
- **Abonnés & paiements** : encaissements espèces/Wave, confirmations
- **QR Élèves** : galerie des QR codes
- **Utilisateurs** : parents, enfants, comptes du site
- **Établissements** : ajouter/supprimer un site
- **Paramètres** : comptes, accès, mots de passe
- **Tableau de bord** : repas servis, CA, abonnés actifs, alertes
- **Caisse POS** : vente directe au comptoir, ticket, monnaie rendue
- **Finance** : ventes, abonnements, solde ISM
- **Historique** : traçabilité des services

## 5. Espace Caissier

Mission : vente au comptoir et pilotage du jour, sans accueil.

- **Tableau de bord** : repas du jour, abonnés actifs, alertes
- **Caisse (POS)** : vente directe, encaissement, ticket, monnaie rendue
- **Encaissement / Reçu** : paiement et remboursement
- **Commandes** : suivi des commandes
- **Menu Récréation** (lecture) : annoncer les plats, vente à la caisse
- **Historique** : commandes et passages du jour
- Interdits : gestion des menus cantine, abonnements, validation repas, utilisateurs

## 6. Espace Directeur Général (DG)

Mission : pilotage et suivi.

- **Tableau de bord** : CA jour/semaine/mois, top produits, graphiques, rapports PDF/Excel
- **Finance** : ventes, abonnements, solde ISM
- **Abonnés & paiements** : encaissements Wave/espèces (lecture), CRUD des offres, remboursements, annulations
- **Utilisateurs & accès** : voir abonnés, comptes et périmètres
- **Établissements**
- **Paramètres** : ajout/suppression de caissiers, réinitialisation des mots de passe
- **Historique**

## 7. Fonctionnalités transversales

- Paiements mobiles **Wave** et **InTouch** (code de confirmation, expiration)
- **QR Code** par enfant : validation anti-double, export PNG, impression
- Historique unifié : repas, recharges, abonnements, paiements
- Matrice de permissions par rôle (`permissions.ts`) — chaque profil ne voit que ses modules
- Design : Tailwind CSS + Radix UI, responsive mobile
