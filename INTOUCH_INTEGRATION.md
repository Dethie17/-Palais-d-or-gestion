# Intégration InTouch - URLs pour le marchand

## 🌐 Domaine : `orestosn.com`

---

## 1. URL de redirection en succès (Success Redirect)
**Où InTouch redirige l'utilisateur après paiement réussi**

```
https://orestosn.com/paiement/success?reference={reference}&transaction_id={transaction_id}
```

**Page React** : `src/pages/PaymentSuccessPage.tsx` → route `paymentsuccess`

**Paramètres attendus** :
- `reference` : votre référence de commande (ex: `WLK-A1B2C3`)
- `transaction_id` : ID transaction InTouch
- `amount` : montant (optionnel)
- `status` : `success` (optionnel)

---

## 2. URL de redirection en échec (Failure Redirect)
**Où InTouch redirige l'utilisateur après paiement échoué/annulé**

```
https://orestosn.com/paiement/echec?reference={reference}&transaction_id={transaction_id}&reason={reason}
```

**Page React** : `src/pages/PaymentFailurePage.tsx` → route `paymentfailure`

**Paramètres attendus** :
- `reference` : votre référence de commande
- `transaction_id` : ID transaction InTouch
- `reason` : motif d'échech (ex: `insufficient_funds`, `cancelled`, `timeout`)
- `error` : code d'erreur (optionnel)

---

## 3. URL de Callback / Webhook (Server-to-Server)
**Appelé par les serveurs InTouch pour notifier le résultat - SÉCURISÉ**

```
https://orestosn.com/.netlify/functions/intouch-callback
```

**Méthode** : `POST`
**Content-Type** : `application/json`
**Headers** : `X-Forwarded-For` (IP client)

**Function Netlify** : `netlify/functions/intouch-callback.ts`

**Payload attendu** :
```json
{
  "transaction_id": "INT-20241005-A1B2C3",
  "reference": "WLK-A1B2C3",
  "amount": 1500,
  "status": "success",
  "phone": "+221771234567",
  "merchant_number": "+221770000000",
  "timestamp": "2024-10-05T14:30:00Z",
  "signature": "hmac_sha256_hex...",
  "operator": "orange",
  "fees": 50,
  "net_amount": 1450
}
```

**Réponse attendue** : `200 OK` avec `{ "success": true, "payment_id": "..." }`

---

## Variables d'environnement Netlify (OBLIGATOIRES)

Configurez dans **Netlify Dashboard > Site settings > Environment variables** :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `SUPABASE_URL` | URL projet Supabase | `https://abc123.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (côté serveur) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `INTOUCH_CALLBACK_SECRET` | Secret InTouch pour vérif HMAC | `votre_secret_32_chars_min` |

⚠️ **Jamais** `SUPABASE_SERVICE_ROLE_KEY` dans `VITE_*` (exposé client)

---

## Tables Supabase utilisées par le callback

Le callback écrit/ma à jour ces tables :

1. **`oresto_payments`** : mise à jour `status` → `paid`/`failed`
2. **`subscriptions`** : activation abonnement si `payment.subscription_id` existe
3. **`payment_callbacks`** : log d'audit (créer la table si besoin)

```sql
-- Table audit callbacks (optionnelle mais recommandée)
CREATE TABLE IF NOT EXISTS payment_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES oresto_payments(id),
  provider TEXT NOT NULL, -- 'intouch'
  transaction_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  ip INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON payment_callbacks (reference);
CREATE INDEX ON payment_callbacks (transaction_id);
```

---

## Flux complet

```
1. Utilisateur sur POS/Menu Récréation → choisit Wave/InTouch
2. App génère référence (ex: WLK-A1B2C3) + ouvre lien InTouch
3. Utilisateur paie sur son téléphone InTouch
4. InTouch appelle webhook : POST https://orestosn.com/.netlify/functions/intouch-callback
   └─> Vérif signature HMAC
   └─> Met à jour oresto_payments.status = 'paid'
   └─> Active abonnement si lié
5. InTouch redirige utilisateur : https://orestosn.com/paiement/success?reference=WLK-A1B2C3
6. Page success vérifie le paiement en DB → affiche confirmation
```

---

## Test en local (dev)

```bash
# 1. Netlify CLI
npm install -g netlify-cli
netlify login
netlify link

# 2. Variables locales
cp .env.example .env.local
# Ajoutez SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTOUCH_CALLBACK_SECRET

# 3. Dev server + functions
netlify dev
# → http://localhost:8888/.netlify/functions/intouch-callback

# 4. Test webhook avec ngrok (expose local)
ngrok http 8888
# → https://abc123.ngrok-free.app/.netlify/functions/intouch-callback
# Configurez cette URL dans le dashboard InTouch pour tester
```

---

## Vérification post-déploiement

1. **Webhook** : `curl -X POST https://orestosn.com/.netlify/functions/intouch-callback -H "Content-Type: application/json" -d '{"reference":"TEST-123","transaction_id":"INT-TEST","amount":1000,"status":"success","signature":"test"}'`

2. **Success redirect** : Ouvrir `https://orestosn.com/paiement/success?reference=TEST-123`

3. **Failure redirect** : Ouvrir `https://orestosn.com/paiement/echec?reference=TEST-123&reason=cancelled`

---

## Support

- Logs Netlify : Dashboard > Functions > intouch-callback > Invocations
- Supabase Logs : Dashboard > Database > Logs
- En cas d'échec webhook : InTouch réessaie généralement (retry policy selon leur config)