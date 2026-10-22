# PRÉSENTATION OFFICIELLE — O RESTO
### Gestion des repas et abonnements pour écoles et entreprises

---

## 1. PROBLÉMATIQUE & OBJECTIFS

Avant O RESTO : files d'attente à la cantine, tickets papier perdus, absence de traçabilité des repas, paiements en espèces non sécurisés, parents sans visibilité.

**O RESTO apporte :**
- Un suivi numérique des repas servis (QR Code anti-double)
- Des paiements mobiles (Wave) et abonnements dématérialisés
- Une carte prépayée par enfant (kiosque récréation)
- Un pilotage en temps réel pour la direction (chiffre d'affaires, repas, abonnés)
- Une expérience mobile-first, installable comme une application (PWA)

---

## 2. STACK TECHNOLOGIQUE

| Couche | Technologie | Rôle |
|---|---|---|
| Frontend | React 18 + TypeScript | Interface utilisateur typée, composants réutilisables |
| Build | Vite 5 | Compilation rapide, code-splitting par page |
| UI | Tailwind CSS + Radix UI + Lucide | Design system responsive, accessible |
| Backend/BDD | Supabase (PostgreSQL + RLS) | Données temps réel, authentification, sécurité par ligne |
| Paiements | SycaPay (Wave, Max / Orange Money) | Encaissement mobile money |
| Hébergement | Vercel (front + API serverless) | Déploiement continu via GitHub |
| Tests | Vitest | Tests unitaires et d'intégration |
| Qualité | ESLint + TypeScript strict | Code contrôlé à chaque commit |

---

## 3. ARCHITECTURE DE L'APPLICATION

```
Navigateur (React SPA)
      │
      ├── Supabase (PostgreSQL, Auth, Realtime)  ← données métier
      ├── SycaPay (Wave, Max / Orange Money)      ← encaissement + redirection
      └── /api/sycapay/webhook (fonction serverless) ← règlement des paiements
```

- **SPA React** : une seule page HTML, navigation côté client fluide
- **Code-splitting** : chaque espace (Parent, POS, Dashboard…) est chargé à la demande → site rapide
- **RLS Supabase** : chaque utilisateur ne lit/écrit que ses données
- **Matrice de permissions** (`src/lib/permissions.ts`) : chaque profil n'accède qu'à ses modules

---

## 4. LES 4 ESPACES UTILISATEUR

### 4.1 ESPACE PARENT (le plus important)
Parcours continu en 6 étapes, pensé pour des parents non-techniques :

1. **Inscription des enfants** — nom, prénom, classe (cycles préscolaire → lycée), un **QR Code unique** généré par enfant
2. **Abonnement** — comparaison des 3 formules, réservation en 1 clic, paiement SycaPay (Wave, Max / Orange Money) par redirection sécurisée
3. **Menu du jour** — consultation des menus publiés par le personnel
4. **Kiosque Récréation** — snacks et boissons payés par la **carte prépayée** de l'enfant
5. **Mes cartes** — solde de chaque carte, recharge Wave/espèces
6. **Historique** — dépenses par enfant : recharges, abonnements, repas servis ou refusés, statuts de paiement

Le parent peut aussi exporter/imprimer les QR Codes de ses enfants.

### 4.2 ESPACE SUPERVISEUR (personnel de cantine)
- Validation des repas par **scan QR caméra ou saisie** (contrôle : actif, date, solde, **anti-double passage 1/jour**)
- Composition et publication des menus de la semaine
- Création des tickets repas
- Encaissement des abonnements au comptoir
- Gestion des utilisateurs et établissements
- Tableau de bord : repas servis, CA du jour, alertes
- Suivi financier et historique des services

### 4.3 ESPACE CAISSIER
- **Caisse POS** : vente directe, ticket, monnaie rendue
- Lien de paiement **Wave Business** (QR + bouton sur l'écran d'encaissement)
- Tableau de bord du jour, commandes, historique
- Accès volontairement restreint : pas de gestion des menus ni des abonnements

### 4.4 ESPACE DIRECTEUR GÉNÉRAL
- Tableau de bord : CA jour/semaine/mois, top produits, graphiques, **exports PDF/Excel**
- Finance : ventes, abonnements, trésorerie
- Gestion des abonnés, formules, remboursements
- Gestion des comptes et des caissiers

---

## 5. FONCTIONNALITÉS CLÉS (à démontrer en live)

1. **Connexion par rôle** → chaque profil voit un espace différent
2. **QR Code enfant** → scan = repas validé ou refusé (raison affichée)
3. **Paiement Wave** → lien de paiement, confirmation
4. **Kiosque récréation** → paiement par carte prépayée
5. **Dashboard DG** → graphiques et statistiques en temps réel
6. **Installation PWA** → l'app s'installe sur téléphone, plein écran

---

## 6. SÉCURITÉ

- Mots de passe hashés, session Supabase sécurisée
- Code d'accès parent (ParentGate) avant l'espace sensible
- Clés secrètes côté serveur uniquement (jamais dans le code client)
- Headers de sécurité HTTP (X-Frame-Options, nosniff, Referrer-Policy)
- RLS : isolation des données par utilisateur
- Anti-double validation des repas par QR

---

## 7. RESPONSIVE & PWA

- Interface **mobile-first** : sidebar → menu hamburger sur mobile, grilles adaptatives
- **PWA installable** : manifest + service worker + icônes → ajout à l'écran d'accueil (iOS Safari / Android Chrome), ouverture plein écran
- Testé : page d'accueil, connexion, espace parent sur écran 390px sans débordement

---

## 8. DÉPLOIEMENT & CYCLE DE VIE

```
Développement local (npm run dev)
   → commit GitHub
      → Vercel build automatique (npm run build)
         →    Production https://oresto-sn.com
            → variables d'environnement gérées sur Vercel
```

- CI/CD : chaque push sur `main` déclenche un déploiement
- Variables d'environnement séparées : développement / preview / production
- En production : comptes de démonstration désactivés (`VITE_DEMO_LOGIN=false`)

---

## 9. ÉVOLUTIONS PRÉVUES

- **SycaPay** déjà intégré : Wave et Max / Orange Money, webhook de règlement
- Application mobile native si besoin
- Notifications parents (SMS/WhatsApp) après chaque repas

---

## 10. PLAN DE DÉMO RECOMMANDÉ (10 min)

| Temps | Action |
|---|---|
| 0–1 min | Présentation du problème et de la solution O RESTO |
| 1–3 min | Connexion Parent → tour de l'espace parent (inscription, abonnement, carte, historique) |
| 3–5 min | Connexion Superviseur → validation d'un repas par QR Code |
| 5–7 min | Connexion Caissier → vente POS + paiement Wave |
| 7–9 min | Connexion DG → dashboard, chiffres, exports |
| 9–10 min | Installation PWA sur téléphone + questions |

**Messages-clés à retenir :** React/TypeScript moderne, base temps réel sécurisée, paiements mobiles locaux (Wave), QR Code anti-fraude, accessible partout (mobile + PWA), déployé en continu sur Vercel.
