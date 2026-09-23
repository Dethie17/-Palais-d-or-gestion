# O RESTO — Adaptation du cahier des charges

Ancien nom : **Palais d'Or** → nouveau nom : **O RESTO** (repas, menus, abonnements, QR Code).

## Correspondance cahier des charges → site

| Section CDC | Implémentation |
|---|---|
| 2. Profils | `client`, `personnel`, `gestionnaire` (Gérant de cantine), `admin` (Directeur Général) (+ `caissier`/`manager` conservés). Voir `src/context/AuthContext.tsx`, `src/components/layout/Sidebar.tsx` |
| 3. App client | `HomePage` (accueil), `MenusPage` (menu du jour mis en avant + tickets semaine + carte), `SubscriptionPage` (**Ma carte** : validité, J-restants, jauge repas, règles + **comparateur** prix/repas + **réservations en attente** + tickets cantine + **anciennes cartes** + **reçus imprimables**), `QRCodePage`, `OrderHistoryPage` (historique), `ProfilePage` |
| 4. QR Code & validation | `QRCodePage` (badge pro, **QR personnel stable par client** `ORESTO-XXXXXX`, export PNG, impression), `ValidationPage` (**service du midi** : liste des élèves abonnés avec bouton Servir 1-clic + recherche, **scan caméra** + saisie manuelle) : contrôle abonnement actif, date, repas restants, anti-double (1/jour/QR). Anciens QR restants valides. Enregistré avec date/heure/cantine |
| 5. Menus & offres | `MenuManagement` (CRUD plats, publication via disponibilité) + `formulas` (formules et règles) dans `RestoContext` + **`TicketsPage` (staff)** : formules d’abonnement complètes + tickets semaine avec photos ; **Gérant : vente au comptoir** (client nommé, espèces = activation immédiate + reçu, Wave = demande à confirmer) ; Personnel/DG : lecture seule |
| 6. Paiements | `PaymentPage` (caisse comptant, **Gérant uniquement**) + `SubscriptionPage` + `WavePaymentModal` : **Wave, Espèces**. Mobile = initiation → code à 6 chiffres → confirmation → activation automatique (`RestoContext.confirmMobilePayment`, reprise via `resumeMobilePayment`). Espèces = encaissement au comptoir par le Gérant (`counterSale`, encaissement back-office). **Reçu imprimable unique** (`PaymentReceiptModal`) : client, comptoir, back-office. Statuts `pending/paid/failed/cancelled/refunded` (`ORestoPayment`). Config marchand : `VITE_WAVE_MERCHANT_NUMBER`, `VITE_WAVE_MERCHANT_NAME` |
| 7. Back-office | `Dashboard` (**Direction** : CA jour/semaine/mois caisse + abos, rapports **PDF/Excel**, alertes), `SubscriptionsAdminPage` (**Abonnés** avec encaissement espèces, **Formules** CRUD, **Paiements**), `SettingsPage` (**Paramètres DG** : créer/supprimer des gérants, changer mots de passe), `EstablishmentsPage` (cantines), `MenuManagement`, exports PDF |
| 8. Stats | `RestoContext.stats` + stats commandes existantes (`AppContext`) |
| 12. Navigation | Accueil, Menus, Abonnement, QR Code, Historique, Profil (+ Tableau de bord, Établissements, Validation selon rôle) |

## Comptes démo

| Rôle | Login | Mot de passe | Périmètre strict |
|---|---|---|---|
| Client | `client` | `client123` | Accueil, Menus, Abonnement, Mon QR Code, Historique |
| Personnel | `personnel` | `personnel123` | Accueil, Menus (lecture), **Tickets & formules (lecture, annonce des plats)**, Validation repas (liste 1-clic + recherche + scan caméra + saisie), Historique |
| Gestionnaire (Gérant de cantine) | `gestionnaire` | `gestionnaire123` | Accueil, Tableau de bord, **Caisse (POS, seul habilité)**, **Tickets & formules (complet + vente au comptoir)**, Gestion Menu, Cantines, Validation, Abonnés, Historique |
| Admin (Directeur Général) | `admin` | `admin123` | Tout **sauf la caisse** (supervision + lecture des encaissements) + Paramètres (gérants) + Rapports PDF/Excel |

Matrice appliquée dans `src/lib/permissions.ts`, Sidebar filtrée + garde d'accès
dans `App.tsx` (page « Accès réservé » si hors périmètre). Anciens comptes :
`caissier` → personnel, `manager` → admin.

Fonctionnent même sans migration Supabase (repli local). Après exécution de
`supabase-setup.sql` + `supabase-oresto-migration.sql`, les mêmes comptes existent en base.

## Recette (§15)

1. Compte client → espace accessible ✅
2. Abonnement acheté/activé/renouvelé/consulté (page Abonnement) ✅
3. Paiement enregistré avec statut (tableau Mes paiements) ✅
4. QR Code : chaque client a son **QR personnel permanent** (affiché page « Mon QR Code »), valide 1 fois/jour ; 2ᵉ tentative rejetée (page Validation) ✅
5. Consommations visibles dans Historique ✅
6. Admin : menus, clients, établissements, abonnements ✅
7. Stats = données enregistrées ✅
8. Accès filtrés par rôle (Sidebar) ✅

## Restent en phase ultérieure (roadmap §14)

- Scan caméra natif (aujourd'hui : saisie/scan du token + QR affiché scannable)
- Webhooks Wave (aujourd'hui : parcours démo avec code à 6 chiffres)
- Notifications push/SMS (rappels d'expiration)
- Durcissement auth (Supabase Auth + hash mots de passe)
