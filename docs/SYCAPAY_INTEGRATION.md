# Intégration SycaPay — guide de mise en service

Guide opérationnel. La référence technique est `docs/sycapay.md` (v1.18) ;
ce document dit ce qu'il faut faire dans **ce** projet.

---

## 1. Ce qui a été construit

L'application ne parle plus directement à Wave. Elle parle à un
`PaymentProvider` (`src/lib/payments/`), et deux implémentations coexistent :

| Fournisseur | Quand | Comportement |
|---|---|---|
| `demoProvider` | passerelle absente, hors ligne, `vite dev` seul | code à 6 chiffres saisi par le client. **Aucun argent ne circule.** |
| `sycaPayProvider` | `/api/sycapay/health` répond `mode: "sycapay"` | lien / QR / page carte, puis écran d'attente jusqu'au webhook |

La bascule est automatique et se fait une fois par session. Sans
configuration, rien ne casse : l'application démarre en démonstration.

### Fichiers

```
api/
  _lib/sycapay.ts        client mTLS, types, codes d'erreur et de service
  _lib/http.ts           corps de requête, réponses, normalisation des entrées
  _lib/webhookHmac.ts    vérification de signature des notifications
  _lib/supabaseAdmin.ts  client Supabase à clé de service
  _lib/settle.ts         point unique de règlement
  sycapay/initiate.ts    POST — initie un paiement mobile money
  sycapay/card.ts        POST — session de paiement par carte
  sycapay/webhook.ts     POST — SEULE autorité sur l'issue d'un paiement
  sycapay/status.ts      POST — rattrapage (statusV2) + règlement
  sycapay/health.ts      GET  — sonde de configuration

scripts/
  sycapay-env.mjs        certificats → base64 → .env.local
  sycapay-smoke.mjs      test mTLS réel (lecture seule)

src/lib/payments/        contrat fournisseur, client SycaPay, registre
src/components/WavePaymentModal.tsx   rendu du défi selon sa forme
src/pages/SycaPayReturnPage.tsx        écran de retour opérateur
supabase-sycapay.sql     colonnes provider + fonctions de règlement
```

### Outillage

```bash
node scripts/sycapay-env.mjs --check   # que manque-t-il ?
node scripts/sycapay-env.mjs           # écrit les certificats dans .env.local
node scripts/sycapay-smoke.mjs         # teste la connexion mTLS (lecture seule)
```

`sycapay-smoke.mjs` appelle `POST /balance`. Il distingue ce qui compte :

| Réponse | Signification |
|---|---|
| `200` | ✅ mTLS et identifiants corrects |
| `1110` / `1111` | ✅ mTLS bon, mot de passe à corriger |
| `1114` | mTLS bon, **partenaire désactivé chez SycaPay** |
| erreur TLS | ❌ `client.key` ne correspond pas à `client.crt` |

---

## 2. La règle qui gouverne tout

**Rien n'est payé tant que le webhook ne l'a pas dit.**

Trois choses disent « ça y est » et ne le disent pas :

- le `201` de l'initiation — la demande est partie, personne n'a payé ;
- le retour du navigateur sur `url_success` — l'opérateur a redirigé, pas
  nécessairement débité (un client peut y atterrir sans payer, comme payer
  puis fermer l'onglet avant la redirection) ;
- l'accusé de réception du client sur la page — c'est une question, pas une
  réponse.

La seule source est `data.tag` dans le webhook. Le règlement est fait par
PostgreSQL (`oresto_settle_payment` / `oresto_settle_topup`), donc atomique,
et il est idempotent : une notification rejouée ne crédite pas deux fois.

Le navigateur ne solde **jamais** un paiement en production. Il interroge,
il affiche, il recharge l'état local une fois que le serveur a soldé
(`refreshRemote`).

---

## 3. Mise en service

### Étape 1 — Base de données

Dans le SQL Editor Supabase, exécutez `supabase-sycapay.sql`. Il ajoute :

- les colonnes `provider*` sur `oresto_payments` et `wallet_transactions` ;
- la table `sycapay_events` (clé d'idempotence `eventId`) ;
- `oresto_settle_payment`, `oresto_settle_topup`,
  `oresto_register_provider_tx`, `oresto_fail_payment`.

Idempotent : ré-exécutable sans erreur.

> Sans ces fonctions, `/api/sycapay/health` répond `database: false` et
> l'application reste volontairement en mode démonstration. C'est le filet :
> mieux vaut un paiement qui ne s'aboutit pas qu'un webhook qui ne solde pas.

### Étape 2 — Certificats

Reçus de SycaPay dans `~/Downloads/miams/miami/` :

| Fichier | Rôle | État |
|---|---|---|
| `ca.crt` | CA SycaPay mTLS (prod), jusqu'en 2036 | ✅ |
| `client.crt` | certificat client `CN=MIAMS`, 12/10/2026 → 12/10/2027 | ✅ |
| `certificate.chain.crt` | client + CA concaténés | ✅ |
| `client.csr` | la demande signée | ✅ |
| `client.key` | **clé privée RSA 4096** | ✅ |

Le trio `client.key` / `client.crt` / `ca.crt` a été vérifié
programmatiquement : clé et certificat portent la même clé publique, et la
signature de la CA est valide. Les certificats **ne sont pas versionnés** —
`.gitignore` refuse `*.key`, `*.pem`, `*.crt`, `*.csr`.

> **Validité : 12/10/2026 → 12/10/2027.** Le renouvellement exigera un nouveau
> CSR. renewed par `sycapay-env.mjs`, sans toucher au reste.

### Étape 3 — Variables d'environnement (serveur uniquement)

```bash
node scripts/sycapay-env.mjs
```

Écrit dans `.env.local` (déjà ignoré par git) :

```bash
SYCAPAY_BASE_URL=https://ops.sycapay.com/coresystem/part/api
SYCAPAY_LOGIN_API=MIAMS
SYCAPAY_MDP_API=…            ← à saisir (back-office)
SYCAPAY_CA_CRT=<base64>
SYCAPAY_CLIENT_CRT=<base64>
SYCAPAY_CLIENT_KEY=<base64>
VITE_APP_URL=https://orestos.vercel.app
```

Sur Vercel, ondeclare ces mêmes variables dans les variables d'environnement
du projet `orestos`. **`SUPABASE_SERVICE_ROLE_KEY`** doit y être présente :
sans elle, le webhook ne peut écrire aucun règlement.

⚠️ **Jamais de `SYCAPAY_*` ni de `SUPABASE_SERVICE_ROLE_KEY` dans une
variable `VITE_*`** : elles seraient livrées dans le bundle.

### Étape 4 — Déclarer l'URL de webhook

Dans le back-office SycaPay (partenaire MIAMS) :

```
https://orestos.vercel.app/api/sycapay/webhook
```

mode **HMAC SHA256**, secret à aligner sur `SYCAPAY_WEBHOOK_SECRET`.

Sans secret configuré, le webhook **refuse** toute notification (401). C'est
délibéré : une notification non authentifiée laisserait n'importe qui activer
des abonnements. Le mode test « none » de SycaPay exige de poser explicitement
`SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE=false`.

### Étape 5 — Vérifier

```bash
curl https://orestos.vercel.app/api/sycapay/health
# attendu : {"ok":true,"mode":"sycapay","sycapay":true,"database":true}
```

Puis un vrai paiement de faible montant. **Rejouez la notification** depuis le
back-office SycaPay : la réponse doit dire `duplicate`, et le solde doit rester
inchangé. C'est la preuve que l'idempotence tient.

---

## 1 bis. État réel au 13/10/2026

Vérifié, pas supposé :

| Point | État |
|---|---|
| Couple mTLS `client.key` / `client.crt` / `ca.crt` | ✅ cohérent |
| Connexion mTLS à `ops.sycapay.com` | ✅ **aboutit** |
| `loginApi` = MIAMS | ✅ |
| Domaine `orestos.vercel.app` | ✅ répond |
| **Compte partenaire MIAMS** | ❌ **`1114 — partenaire désactivé`** |
| Colonnes `provider*` + `oresto_settle_payment` | ❌ à installer |
| Tables `kiosk_orders`, `reclamations`, `reclamation_messages` | ❌ à installer |
| Functions `/api/*` déployées | ❌ **redéploiement requis** |

### Deux points à traiter côté SycaPay

**1. Le compte MIAMS doit être activé.** L'API répond `1114 — Ce partenaire
est désactivé`. La connexion et l'authentification fonctionnent : c'est un
blocage commercial, pas technique.

Contact : `support@sycapay.com` · +225 01 51 40 56 03.

**2. Le rewrite SPA capturait les Functions.** `vercel.json` avait
`{ "source": "/(.*)" } → /index.html`, si bien que `/api/sycapay/health`
renvoyait du HTML au lieu de JSON. Corrigé en
`{ "source": "/((?!api/).*)" }`. Un redéploiement est nécessaire.

---

## 4. Parcours par moyen

| Moyen | Code service | Ce que voit le client |
|---|---|---|
| Wave | `SN_PM_WAVE` | un lien à ouvrir ; redirection à la fin |
| Orange Money | `SN_PM_OM` | un QR (base64, à afficher tel quel) + boutons de liens profonds |
| Carte | `/checkout/session` | une page hébergée par SycaPay |

La forme de la réponse **est** le comportement à afficher : le service décide,
l'application ne devine pas (docs §6). Le lien Wave est valable 30 minutes, le
QR Orange Money porte sa propre fenêtre dans `validFor`.

Le code Orange Money est envoyé en **base64 PNG**, pas en charge utile EMV :
`<img src="data:image/png;base64,…">`, rien à décoder.

Les liens profonds sont une table application → adresse. Parcourez-la au lieu
de coder une clé en dur : elle vient d'Orange et peut s'étendre.

---

## 5. Codes d'erreur à connaître

**À l'appel** (rien n'est engagé) :

| Code | Sens | Conduite |
|---|---|---|
| 1101 | `idPartenaire` déjà utilisé | ne **jamais** réessayer — risque de double débit. On répond 409. |
| 1103 | solde partenaire insuffisant | alerter le gérant |
| 1110 / 1111 | secret / erreur interne | réessayer (marqué `retryable`) |
| 1118 / 1119 | `url_success` / `url_failed` manquante | configuração serveur |
| 1120 / 1121 | adresse de retour en http | `VITE_APP_URL` mal réglée |

**À la transaction** (`data.erreur.code`) : une même cause porte le même code
quel que soit l'opérateur. Deux cas à traiter différemment :

- `expired` — le client n'a **pas** refusé, il n'a simplement jamais payé dans
  la fenêtre : on peut lui proposer de recommencer ;
- `service-temporarily-unavailable`, `provider-unavailable`,
  `provider-internal-error` — passagers, réessai possible.

Après la bascule vers les codes unifiés (v1.15), `EXPIRED` devient `expired` et
le message de l'opérateur ne parvient plus. Un code inconnu se traite comme
`unclassified`.

---

## 6. Points d'attention

- **RLS ouvertes.** Les politiques du projet sont `USING (true)`. La clé de
  service contourne cela, mais toute personne ayant l'`anon key` peut lire
  `oresto_payments`. À durcir avant d'ouvrir aux vraies familles — c'est
  documenté dans `supabase-oresto-full.sql` et hors périmètre de cette
  intégration.
- **Rapprochement.** `oresto_payments.provider_tx` porte le `tokenTX`.
  C'est la référence à donner au support en cas de litige.
- **Recharge de carte.** Elle vit dans `wallet_transactions`, pas
  `oresto_payments`. Le règlement bascule de table automatiquement, mais une
  requête d'audit doit prévoir les deux.
- **La caisse POS (`PaymentPage`) est un chemin séparé**, sans rapport avec
  `oresto_payments`. Elle n'est pas branchée sur SycaPay : elle écrit dans
  `orders`. La brancher demanderait un travail distinct.
- **Pas de cron serveur.** L'expiration automatique des abonnements
  (`RestoContext`) tourne dans un navigateur ouvert. C'est un problème
  préexistant, mais il devient visible dès que des paiements sont réels.

---

## 7. En cas de problème

| Symptôme | Cause probable |
|---|---|
| L'app affiche un code à 6 chiffres alors que SycaPay est configuré | `/api/sycapay/health` ne répond pas `ok` — vérifier `database: true` |
| 401 sur le webhook | `SYCAPAY_WEBHOOK_SECRET` absent ou différent de celui du back-office |
| 409 à l'initiation | `idPartenaire` déjà utilisé ; vérifier que la référence est bien unique |
| Le client paie, la carte ne s'active pas | le webhook n'atteint pas l'URL déclarée ; le rattrapage `/api/sycapay/status` prend le relais |
| `1120` / `1121` | `VITE_APP_URL` n'est pas en https |