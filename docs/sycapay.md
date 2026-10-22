Documentation

Documentation API
Authentification mTLS, génération de CSR, initiation et suivi des transactions, soldes, webhooks et codes d'erreur.

Source

Documentation de référence
Version 1.18 · maintenue par SycaPay
Sur cette page

01
Introduction
02
Authentification
03
Certificats (CSR)
04
Démarrage rapide
05
Transactions
6
06
Parcours de paiement
07
Paiement en masse
2
08
Webhooks
09
Erreurs
10
Codes d'échec
11
Paramètres
12
Journal des modifications
Téléchargements


Documentation en PDF
impression navigateur
Collections Postman
Ce qu'un intégrateur télécharge pour appeler l'API. Une collection importée remplace celle livrée avec le back-office, pour tout le monde.

SycaPay — Essentiel partenaire
Importée
ESSENTIEL_PARTENAIRE · 7 requêtes · 32,9 ko · v2.1 · par abass.diallo · 20/09/2026 20:55:45
Afficher
01
Introduction
Référence
Acceptez les paiements mobile money, gérez vos transactions et développez votre activité en Afrique de l'Ouest.

Environnement	URL de base	Authentification
Production	https://ops.sycapay.com/coresystem/part/api	mTLS
L'API SycaPay utilise l'authentification mutuelle TLS (mTLS). Vous devez configurer votre certificat client pour vous authentifier auprès de nos serveurs.

02
Authentification
Référence
mTLS fournit une authentification bidirectionnelle, garantissant que le client et le serveur vérifient mutuellement leur identité.

1
Demandez vos certificats

Contactez notre équipe support pour recevoir votre certificat CA (ca.crt), votre certificat client (client.crt) et votre clé privée (client.key).

2
Configurez votre client

Configurez votre client HTTP pour utiliser les fichiers de certificat et de clé pour toutes les requêtes API.

3
Effectuez des requêtes authentifiées

Toutes les requêtes doivent inclure le certificat client. Les requêtes sans certificat valide seront rejetées.

curl https://ops.sycapay.com/coresystem/part/api/initiationTransactionV1 \
  --cacert ca.crt --cert client.crt --key client.key \
  -H "Content-Type: application/json" \
  -d '{"loginApi": "...", "transaction": {...}}'
Champ	Description
ca.crt	Certificat CA
client.crt	Certificat client
client.key	Clé privée
03
Certificats (CSR)
Référence
Les appels à l'API SycaPay sont authentifiés par mTLS. Pour obtenir un certificat client, vous devez nous soumettre une demande de signature de certificat (CSR) générée localement. Votre clé privée ne quitte jamais votre infrastructure.

Les valeurs C / O / OU / CN et la durée de validité dépendent de la politique de notre autorité de certification (définie dans nos termes). Confirmez le format exact avec le support avant de nous envoyer le CSR.

1
Générer la clé privée

Une clé RSA 4096 bits, stockée uniquement chez vous et protégée par les permissions fichier.

openssl genrsa -out client.key 4096
chmod 600 client.key
2
Préparer la configuration OpenSSL

Déclarez le sujet (DN) du certificat. Le CN est l'identifiant partenaire — pas un nom de domaine, puisqu'il s'agit d'un certificat client : il est déjà renseigné ci-dessous avec le loginApi de votre structure.

# client.cnf
[ req ]
default_bits       = 2048
default_md         = sha256
prompt             = no
distinguished_name = dn
req_extensions     = v3_req

[ v3_req ]
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
basicConstraints = critical, CA:FALSE

[ dn ]
O  = SycaPay
CN = MIAMS
3
Générer le CSR

Le CSR combine votre clé publique et votre DN ; inspectez-le avant envoi pour vérifier son contenu.

openssl req -new \
  -key client.key \
  -out client.csr \
  -config client.cnf

# à inspecter avant envoi
openssl req -in client.csr -noout -text
4
Envoyer le CSR au support

Transmettez le fichier client.csr à hello@sycapay.com ainsi que votre code partenaire. Ne nous envoyez jamais la clé privée.

5
Installer et vérifier le certificat signé

Nous vous renvoyons client.crt signé par notre AC. Vérifiez la chaîne et les dates avant de passer en production.

# vérifier la chaîne contre l'AC racine SycaPay
openssl verify -CAfile ca.crt client.crt

# inspecter le certificat signé
openssl x509 -in client.crt -noout -subject -issuer -dates
Les certificats ont une durée de validité limitée (selon la politique de l'AC). Générez un nouveau CSR au moins 30 jours avant l'expiration afin d'éviter toute interruption de service.

04
Démarrage rapide
Référence
Soyez opérationnel en quelques minutes. Voici comment effectuer votre première requête API.

cURL
Copier
curl https://ops.sycapay.com/coresystem/part/api/initiationTransactionV1 \
  -X POST \
  --cacert ca.crt --cert client.crt --key client.key \
  -H "Content-Type: application/json" \
  -d '{
    "loginApi": "MIAMS",
    "transaction": {
      "montant": 1000,
      "codeService": "SN_CASHIN_OM",
      "numeroBeneficiaire": "771234567",
      "idPartenaire": "TXN_123456"
    }
  }'
Node.js
Copier
import axios from 'axios';
import https from 'https';
import fs from 'fs';

const httpsAgent = new https.Agent({
  ca: fs.readFileSync('ca.crt'),
  cert: fs.readFileSync('client.crt'),
  key: fs.readFileSync('client.key'),
  rejectUnauthorized: true
});

const response = await axios.post(
  'https://ops.sycapay.com/coresystem/part/api/initiationTransactionV1',
  {
    loginApi: 'MIAMS',
    transaction: {
      montant: 1000,
      codeService: 'SN_CASHIN_OM',
      numeroBeneficiaire: '771234567',
      idPartenaire: 'TXN_123456'
    }
  },
  { httpsAgent, headers: { 'Content-Type': 'application/json' } }
);
Python
Copier
import requests

response = requests.post(
    'https://ops.sycapay.com/coresystem/part/api/initiationTransactionV1',
    verify='ca.crt',
    cert=('client.crt', 'client.key'),
    headers={'Content-Type': 'application/json'},
    json={
        'loginApi': 'MIAMS',
        'transaction': {
            'montant': 1000,
            'codeService': 'SN_CASHIN_OM',
            'numeroBeneficiaire': '771234567',
            'idPartenaire': 'TXN_123456'
        }
    }
)

print(response.json())
PHP
Copier
<?php

$ch = curl_init('https://ops.sycapay.com/coresystem/part/api/initiationTransactionV1');

curl_setopt($ch, CURLOPT_CAINFO, 'ca.crt');
curl_setopt($ch, CURLOPT_SSLCERT, 'client.crt');
curl_setopt($ch, CURLOPT_SSLKEY, 'client.key');

curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'loginApi' => 'MIAMS',
    'transaction' => [
        'montant' => 1000,
        'codeService' => 'SN_CASHIN_OM',
        'numeroBeneficiaire' => '771234567',
        'idPartenaire' => 'TXN_123456',
    ],
]));

$response = curl_exec($ch);
05
Transactions
6 point(s) de terminaison
Créez et gérez des transactions mobile money avec plusieurs opérateurs.

POST
/initiationTransactionV1
Copier l'URL
Créez et gérez des transactions mobile money avec plusieurs opérateurs.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API pour l'authentification
mdpApi	string	Oui	Votre mot de passe API pour l'authentification
transaction.montant	number	Oui	Montant de la transaction en monnaie locale (XOF)
transaction.codeService	string	Oui	Code du service (ex: SN_CASHIN_OM, SN_PM_WAVE)
transaction.numeroBeneficiaire	string	Oui	Numéro de téléphone du bénéficiaire
transaction.idPartenaire	string	Oui	Votre identifiant unique de transaction
transaction.url_success	string	Selon le service	Adresse sur laquelle l'opérateur ramène le client après validation. Obligatoire, en https://, sur SN_PM_WAVE, SN_PM_OM et CI_PM_OM (1118 si absente, 1120 si elle n'est pas en https). Ignorée par les services qui ne redirigent personne
transaction.url_failed	string	Selon le service	Adresse de retour après refus ou abandon. Mêmes règles que url_success (1119 et 1121)
transaction.metadata	object	Non	Vos propres paires clé/valeur texte (numéro de commande, client, canal…), enregistrées et rendues telles quelles : réponse d'initiation, statusV2 et callback v2 (champ data.metadata, absent si vous n'en envoyez pas). 20 clés au plus, 40 caractères par clé, 500 par valeur, sinon refus 1139. L'ordre des clés n'est pas conservé
Requête
Copier
{
  "loginApi": "MIAMS",
  "mdpApi": "********",
  "transaction": {
    "montant": 1000,
    "codeService": "SN_CASHIN_OM",
    "numeroBeneficiaire": "771234567",
    "idPartenaire": "TXN_123456",
    "metadata": { "commande": "CMD-8421", "canal": "web" }
  }
}
Réponse
Copier
{
  "errorCode": "200",
  "errorMessage": "Dépôt effectué avec succès ...",
  "transaction": {
    "tokenTX": "TXGTJCHOO2BWTUQ2I",
    "montant": 1000,
    "codeService": "SN_CASHIN_OM",
    "numeroBeneficiaire": "771234567",
    "idPartenaire": "TXN_123456",
    "metadata": { "commande": "CMD-8421", "canal": "web" }
  }
}
L'exemple ci-dessus est un dépôt (_CASHIN_) : personne n'a rien à valider, donc rien à afficher et nulle part où revenir. Un paiement (_PM_) est l'autre cas — un client doit accepter, puis l'opérateur le ramène chez vous.

Requête — un paiement, avec ses adresses de retour
Copier
{
  "loginApi": "MIAMS",
  "mdpApi": "********",
  "transaction": {
    "montant": 1000,
    "codeService": "SN_PM_WAVE",
    "numeroBeneficiaire": "771234567",
    "idPartenaire": "TXN_123456",
    "url_success": "https://boutique.example.com/commande/8421/merci",
    "url_failed": "https://boutique.example.com/commande/8421/echec"
  }
}
url_success et url_failed sont obligatoires sur SN_PM_WAVE, SN_PM_OM et CI_PM_OM, et doivent commencer par https://. L'appel est refusé avant tout envoi si elles manquent (1118, 1119) ou si elles ne sont pas en https (1120, 1121). Les autres services de paiement poussent une invite sur le téléphone du client et ne redirigent personne : ils les ignorent, et les envoyer quand même ne coûte rien.

Mettez votre propre référence dans ces adresses, comme le 8421 ci-dessus : nous les transmettons telles quelles à l'opérateur, et les paramètres qu'il y ajoute sont les siens. C'est ainsi que vous retrouvez la commande au retour du client — et le retour du client n'est pas un résultat de paiement, voir Parcours de paiement.

Métadonnées : vos propres références

Joignez à la transaction vos propres paires clé/valeur dans transaction.metadata — numéro de commande, client, canal, ce qui vous sert à la retrouver. Nous les enregistrons sans les interpréter et vous les rendons telles quelles : dans la réponse d'initiation, dans data.metadata du webhook v2 et de POST /statusV2, et sur la fiche transaction de votre back-office. Le champ est absent quand vous n'en envoyez pas — jamais un objet vide.

Règles : un objet plat, des valeurs texte uniquement. 20 clés au plus, 40 caractères par clé, 500 par valeur ; une clé vide ou une valeur nulle est refusée. Au-delà, l'appel est refusé avec 1139 avant tout envoi, et errorMessage nomme la clé en cause. L'ordre des clés n'est pas conservé. N'y mettez ni donnée de carte ni secret : elles sont stockées en clair et réaffichées.

Requête — avec des métadonnées
Copier
{
  "loginApi": "MIAMS",
  "mdpApi": "********",
  "transaction": {
    "montant": 1000,
    "codeService": "SN_PM_WAVE",
    "numeroBeneficiaire": "771234567",
    "idPartenaire": "TXN_123456",
    "url_success": "https://boutique.example.com/commande/8421/merci",
    "url_failed": "https://boutique.example.com/commande/8421/echec",
    "metadata": {
      "commande": "8421",
      "client": "C-0042",
      "canal": "web"
    }
  }
}
POST
/checkout/session
Copier l'URL
Créez une session de paiement par carte sur la page hébergée par Sycapay : vous recevez un lien à donner au client, qui saisit sa carte chez nous. Les métadonnées passées ici sont conservées sur la session puis reportées sur la transaction au paiement ; la page de paiement ne les affiche jamais.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API
mdpApi	string	Oui	Votre mot de passe API
montant	number	Oui	Montant à encaisser (XOF)
codeService	string	Non	Service de paiement ; par défaut SN_CARD_GIMUEMOA
urlSuccess	string	Oui	Adresse de retour après paiement réussi
urlFailed	string	Oui	Adresse de retour après échec ou abandon
merchantReference	string	Non	Votre référence ; devient l'idPartenaire de la transaction (CHK-… générée si absente)
payerName	string	Non	Nom du payeur, pour pré-remplir la page
metadata	object	Non	Vos paires clé/valeur texte, mêmes règles qu'à l'initiation (1139). Rendues dans data.metadata du webhook v2 et de POST /statusV2
Requête
Copier
curl -X POST https://ops.sycapay.com/coresystem/part/api/checkout/session \
  --cacert ca.crt --cert client.crt --key client.key \
  -H "Content-Type: application/json" \
  -d '{
    "loginApi": "MIAMS",
    "mdpApi": "********",
    "montant": 15000,
    "urlSuccess": "https://boutique.example.com/commande/8421/merci",
    "urlFailed": "https://boutique.example.com/commande/8421/echec",
    "merchantReference": "CMD-8421",
    "metadata": { "commande": "8421", "canal": "web" }
  }'
Réponse
Copier
{
  "errorCode": "200",
  "token": "3f2b6c1e-8d4a-4b7e-9c2f-1a5d7e9b0c34",
  "checkoutUrl": "https://checkout.sycapay.com/checkout/3f2b6c1e-8d4a-4b7e-9c2f-1a5d7e9b0c34"
}
Les contrôles du service (1102, 1108, 1109, bornes de montant) et des métadonnées (1139) se font à la création de la session : un lien n'est jamais généré pour un paiement qui serait refusé une fois la carte saisie. Attention, sur cet endpoint 1110 signale des identifiants invalides et 1120 un montant invalide — 1120 désigne autre chose sur l'initiation unitaire.

POST
/statusV2
Copier l'URL
Récupérez l'état d'une transaction par son identifiant partenaire. La réponse est mise en cache et expose un ETag pour limiter la bande passante consommée.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API pour l'authentification
mdpApi	string	Oui	Votre mot de passe API pour l'authentification
idPartenaire	string	Oui	Identifiant unique fourni lors de l'initiation (idPartenaire).
Requête
Copier
curl -X POST https://ops.sycapay.com/coresystem/part/api/statusV2 \
  --cacert ca.crt --cert client.crt --key client.key \
  -H "Content-Type: application/json" \
  -d '{
    "loginApi": "MIAMS",
    "mdpApi": "********",
    "idPartenaire": "TXN_123456"
  }'
Réponse
Copier
{
  "errorCode": "200",
  "data": {
    "tokenTX": "TXGTJCHOO2BWTUQ2I",
    "idPartenaire": "TXN_123456",
    "codeService": "SN_PM_WAVE",
    "typeService": "DECAISSEMENT",
    "typeTransaction": "WAVESN",
    "tag": "SUCCESS",
    "statut": "FINISHED",
    "montant": 113173,
    "frais": 1131,
    "commission": 226,
    "devise": "XOF",
    "codePays": "SN",
    "dateCreation": "2026-07-29T13:32:31Z",
    "dateEnvoi": "2026-07-29T13:32:33Z",
    "dateValidation": "2026-07-29T13:32:37Z",
    "metadata": {
      "commande": "8421",
      "canal": "web"
    }
  }
}
Champ	Description
idPartenaire	Identifiant de transaction que vous avez fourni à l'initiation (idPartenaire).
statut	État du cycle de vie : PENDING (en cours) ou FINISHED (finalisée).
tag	Issue d'une transaction finalisée : SUCCESS (réussie), FAILED (échouée) ou CANCELED (annulée). Absent tant que la transaction n'est pas finalisée.
dateValidation	Date et heure de finalisation (null tant que la transaction n'est pas finalisée).
metadata	Vos métadonnées, telles qu'envoyées à l'initiation ou à la création de la session de paiement. Absent si vous n'en avez pas envoyé.
reasonForFailure	Motif de l'échec, renseigné uniquement lorsque la transaction a échoué (tag ECHEC / FAILED).
Version historique, conservée pour les intégrations déjà en place. Toute nouvelle intégration utilise POST /statusV2, qui renvoie le détail complet de la transaction.

GET
/status/{idPartenaire}
Copier l'URL
Version historique, conservée pour les intégrations déjà en place. Toute nouvelle intégration utilise POST /statusV2, qui renvoie le détail complet de la transaction.

Champ	Type	Requis	Description
idPartenaire	string	Oui	Identifiant unique fourni lors de l'initiation (idPartenaire).
If-None-Match	header	Non	Renvoyez la dernière valeur d'ETag reçue pour obtenir un 304 Not Modified si rien n'a changé.
Requête
Copier
curl https://ops.sycapay.com/coresystem/part/api/status/TXN_123456 \
  --cacert ca.crt --cert client.crt --key client.key \
  -H "If-None-Match: \"PENDING-tag-1714752000\"" 
Réponse
Copier
{
  "idPartenaire": "TXN_123456",
  "statut": "FINISHED",
  "tag": "SUCCESS",
  "dateValidation": "2026-04-18T14:41:06.499589"
}
En-tête	Description
ETag	Empreinte de la réponse — à transmettre dans If-None-Match lors du prochain appel.
Cache-Control	max-age=30s pour les transactions en cours, 60s lorsqu'elles sont finalisées (public).
X-RateLimit-Remaining	Nombre d'appels restants dans la fenêtre courante.
Retry-After	Délai en secondes à attendre avant de réessayer (renvoyé avec un 429).
Code	Description
200	Statut renvoyé. Mettez à jour votre cache local avec le nouvel ETag.
304	Pas de changement — réutilisez la dernière valeur reçue.
404	Aucune transaction connue pour cet idPartenaire.
429	Limite de débit dépassée — patientez la durée indiquée par Retry-After.
POST
/balance
Copier l'URL
Renvoie vos comptes avec leur solde courant, ou un seul d'entre eux quand numeroCompte est donné. Les identifiants sont vérifiés contre votre login/mot de passe API. Le solde est lu au moment de la requête ; lastCheckedAt donne l'heure de cette lecture. Un numéro qui n'est pas l'un de vos comptes rend une liste vide.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API pour l'authentification
mdpApi	string	Oui	Votre mot de passe API pour l'authentification
numeroCompte	string	Non	Ne renvoyer que ce compte. Sans lui, tous vos comptes.
Requête
Copier
curl https://ops.sycapay.com/coresystem/part/api/balance \
  -X POST \
  --cacert ca.crt --cert client.crt --key client.key \
  -H "Content-Type: application/json" \
  -d '{
    "loginApi": "MIAMS",
    "mdpApi": "********"
  }'
Réponse
Copier
{
  "errorCode": "200",
  "loginApi": "MIAMS",
  "comptes": [
    {
      "numero": "SN-OM-001",
      "solde": 152340.5,
      "codePays": "SN",
      "etat": "ACTIF",
      "typeCompte": "PRINCIPAL"
    }
  ],
  "lastCheckedAt": "2026-05-08T10:24:11.482"
}
POST
/verifyRecipient
Copier l'URL
Contrôle synchrone en lecture seule à réaliser avant un payout : SycaPay interroge l'opérateur pour confirmer que le numéro du bénéficiaire existe et que son nom correspond. Aucune transaction n'est créée et aucun callback n'est déclenché. Le service est choisi par codeService, exactement comme pour une transaction — l'opérateur est donc déduit de la route du service.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API pour l'authentification
mdpApi	string	Oui	Votre mot de passe API pour l'authentification
codeService	string	Oui	Code du service (ex: SN_CASHIN_OM, SN_PM_WAVE)
numeroBeneficiaire	string	Oui	Numéro de téléphone du bénéficiaire
Requête
Copier
{
  "loginApi": "MIAMS",
  "mdpApi": "********",
  "codeService": "SN_CASHIN_WAVE",
  "numeroBeneficiaire": "771234567",
  "prenomBeneficiaire": "Awa",
  "nomBeneficiaire": "Diop",
  "nationalId": "1234567890123",
  "montant": 5000
}
Réponse
Copier
{
  "errorCode": "200",
  "errorMessage": "…",
  "codeService": "SN_CASHIN_WAVE",
  "provider": "WAVE",
  "verified": true,
  "details": {
    "within_limits": true,
    "name_match": "MATCH",
    "national_id_match": "MATCH"
  }
}
06
Parcours de paiement
Référence
Deux familles de services, deux parcours. Un service de paiement (_PM_, « Paiement ») encaisse auprès d'un client : quelqu'un doit valider, et c'est ce parcours que décrit cette section. Un service de dépôt (_CASHIN_, « Dépôt ») crédite le portefeuille d'un bénéficiaire : il n'y a pas de payeur, donc rien à afficher — vous initiez, vous attendez le webhook.

1
Vous initiez la transaction

POST /initiationTransactionV1 avec le code de service, le montant, le numéro du client et votre référence. Trois services exigent en plus url_success et url_failed — voir plus bas.

2
Nous répondons 201, avec de quoi faire payer

errorCode 201 veut dire « acceptée, en attente du client ». Ce n'est ni un échec, ni un encaissement : la transaction existe, personne n'a encore payé. La réponse porte ce dont le client a besoin pour le faire — et sa forme dépend du service.

3
Le client paie chez l'opérateur

Sur la page de l'opérateur, dans son application, ou en validant l'invite poussée sur son téléphone. Cette étape se déroule entièrement chez l'opérateur : nous n'y sommes plus, et rien ne nous parvient tant qu'il n'a pas tranché.

4
L'opérateur ramène le client — quand il y a une page à quitter

Les services à lien ou à QR ramènent le client sur url_success ou url_failed. C'est l'opérateur qui redirige, pas nous. Les services à invite téléphonique ne ramènent personne : le client n'a jamais quitté votre page.

5
Nous vous notifions l'issue

Le webhook part dès que la transaction est réglée, et c'est lui qui fait foi. Une notification manquée se rattrape avec POST /statusV2, qui rend le même objet.

La règle : rien n'est payé tant que le webhook ne l'a pas dit

Une transaction ne se conclut ni sur la réponse d'initiation, ni sur le retour du navigateur, ni sur la disparition du client de votre page. Le 201 dit que la demande est partie, pas qu'elle est payée. Le retour sur url_success dit que l'opérateur a redirigé, pas qu'il a débité — un client peut y atterrir sans que l'argent ait bougé, comme il peut payer puis fermer l'onglet avant d'être redirigé. Une seule chose fait foi : data.tag dans le webhook.

N'expédiez donc jamais une commande, ne créditez jamais un compte, n'envoyez jamais de confirmation avant de l'avoir reçu. Ce que vous affichez au retour du client est un écran d'attente, rien de plus.

Et si le webhook n'arrive pas — votre point d'entrée était indisponible, la notification s'est perdue, vous avez répondu autre chose qu'un 2xx — ne restez pas à attendre : interrogez POST /statusV2 avec votre idPartenaire. Il rend exactement le même objet transaction que le webhook, et c'est le rattrapage prévu pour cela. Un appel de statut sur une transaction restée en PENDING au-delà de la fenêtre de validité du lien ou du QR vous dira si elle a expiré.

Lequel est lequel : la réponse d'initiation le dit

Vous n'avez pas à deviner le comportement d'un opérateur ni à lire sa documentation : trois formes de réponse suffisent à couvrir le catalogue, et le code de service détermine laquelle vous recevrez.

Service	La réponse d'initiation porte	Ce que vous en faites
SN_PM_WAVE, CI_PM_WAVE	urlRedirection	Redirigez le client vers cette adresse : c'est la page de paiement Wave.
CI_PM_OM	urlRedirection	Redirigez le client vers cette adresse : c'est la page de paiement Orange Money.
SN_PM_OM	deepLinks, qrCode, validFor	Sur un écran d'ordinateur, affichez le QR à scanner. Sur mobile, ouvrez l'application Orange avec l'un des liens profonds. deepLinks associe une application à son lien : parcourez la table plutôt que d'y coder une clé en dur, elle vient d'Orange et peut s'étoffer.
SN_PM_YAS, CI_PM_MTN, BJ_PM_MTN, CI_PM_MOOV	Rien de plus	Rien à afficher : l'opérateur pousse l'invite de validation sur le téléphone du client. Montrez un écran d'attente et laissez venir le webhook.
201 — service à lien (Wave, Orange Money CI)
Copier
{
  "errorCode": "201",
  "errorMessage": "La transaction est en cours de traitement ...",
  "urlRedirection": "https://pay.wave.com/c/cos-27b43kczg1mhy?a=1000&c=XOF&m=Boutique",
  "transaction": {
    "tokenTX": "TXGTJCHOO2BWTUQ2I",
    "idPartenaire": "TXN_123456",
    "codeService": "SN_PM_WAVE",
    "montant": 1000,
    "url_success": "https://boutique.example.com/commande/8421/merci",
    "url_failed": "https://boutique.example.com/commande/8421/echec"
  }
}
201 — Orange Money Sénégal (QR et liens profonds)
Copier
{
  "errorCode": "201",
  "errorMessage": "La transaction est en cours de traitement ...",
  "qrCode": "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAAAAACIM/FC...",
  "deepLinks": {
    "MAXIT": "https://sugu.orange-sonatel.com/mp/dmeUssa0awPbnqFFBhwg",
    "OM": "https://sugu.orange-sonatel.com/mp/dmeUssa0awPbnqFFBhwg"
  },
  "validFor": {
    "startDateTime": "2026-09-18T12:12:36.350465",
    "endDateTime": "2026-09-18T12:27:36.350465"
  },
  "transaction": {
    "tokenTX": "TXGTJCHOO2BWTUQ2I",
    "idPartenaire": "TXN_123456",
    "codeService": "SN_PM_OM",
    "montant": 1000,
    "url_success": "https://boutique.example.com/commande/8421/merci",
    "url_failed": "https://boutique.example.com/commande/8421/echec"
  }
}
201 — service à invite téléphonique (YAS, MTN, Moov)
Copier
{
  "errorCode": "201",
  "errorMessage": "La transaction est en cours de traitement ...",
  "transaction": {
    "tokenTX": "TXGTJCHOO2BWTUQ2I",
    "idPartenaire": "TXN_123456",
    "codeService": "CI_PM_MTN",
    "montant": 1000
  }
}
Le bloc transaction reprend celui que vous avez envoyé, augmenté du tokenTX — notre référence de la transaction, celle qui vous servira au support et au rapprochement.

Orange Money Sénégal : ce que portent réellement qrCode et deepLinks

Champ	Ce que c'est	Ce que vous en faites
qrCode	Une image PNG, encodée en base64 — pas une charge utile EMV à tracer vous-même.	Affichez-la directement : <img src="data:image/png;base64,{qrCode}" alt="QR de paiement">. Rien à générer, rien à décoder.
deepLinks	Une table application → adresse. Aujourd'hui deux entrées, MAXIT et OM, qui pointent la même adresse https.	Parcourez la table, n'y codez pas une clé en dur : elle vient d'Orange et peut s'étoffer. Une seule suffit à ouvrir le paiement ; proposez-la en bouton sur mobile, là où le QR ne sert à rien.
validFor	La fenêtre de validité du QR, telle qu'Orange la rend — startDateTime et endDateTime, sans fuseau, au format local de l'opérateur.	Quinze minutes par défaut. Passez-la au client plutôt qu'un compte à rebours inventé ; c'est cette borne qui décide de l'expiration.
Les champs validity, metadata et qrId n'arrivent pas jusqu'à vous : ils sont nuls dans la réponse, donc omis. Ne les attendez pas.

url_success et url_failed : ce que nous en faisons

Nous les transmettons à l'opérateur telles quelles, sans rien y ajouter : success_url et error_url chez Wave, callbackSuccessUrl et callbackCancelUrl chez Orange Money Sénégal, returnUrl et cancelUrl chez Orange Money Côte d'Ivoire. Ce n'est donc pas nous qui ramenons le client, c'est l'opérateur — et les paramètres qu'il ajoute à l'adresse sont les siens : ils diffèrent d'un opérateur à l'autre, peuvent changer sans que nous en soyons avertis, et ne font partie d'aucun contrat que nous puissions tenir.

Pour retrouver votre commande au retour, mettez donc votre propre référence dans l'adresse que vous nous donnez — par exemple https://marchand.com/paiement/ok?ref=CMD-123. Elle vous revient intacte, quel que soit l'opérateur, puisque nous n'y touchons pas.

Le retour du navigateur n'est pas un résultat de paiement. Un client peut fermer l'onglet avant d'être redirigé, revenir en arrière, ou atterrir sur url_success sans que l'argent soit encaissé. N'enregistrez jamais une commande sur ce seul retour : affichez-y un écran d'attente, et laissez le webhook trancher. C'est tag qui fait foi, pas l'adresse sur laquelle le client a atterri.

Champ	Obligatoire pour	Règle
url_success	SN_PM_WAVE, SN_PM_OM, CI_PM_OM	Doit commencer par https://. Absente : erreur 1118. Non https : erreur 1120.
url_failed	SN_PM_WAVE, SN_PM_OM, CI_PM_OM	Doit commencer par https://. Absente : erreur 1119. Non https : erreur 1121.
Sur les autres services de paiement, ces deux champs sont acceptés sans être exigés : Wave Côte d'Ivoire les transmet à l'opérateur s'ils sont fournis, les services à invite téléphonique n'ont personne à rediriger.

Le lien de paiement Wave (urlRedirection) est valable 30 minutes. Passé ce délai, la transaction expire et le client devra recommencer.

Le QR d'Orange Money Sénégal porte sa propre fenêtre dans validFor (startDateTime et endDateTime) — quinze minutes par défaut. Dans les deux cas, une expiration sans validation revient en tag FAILED avec erreur.code EXPIRED — expired après la bascule vers les codes unifiés : le client n'a rien refusé, il n'a simplement jamais payé, ce qui vous laisse le proposer à nouveau plutôt que de conclure à un refus.

07
Paiement en masse
2 point(s) de terminaison
Soumettez un lot de versements en un seul appel. Le lot est accepté puis traité en arrière-plan : la réponse dit ce qui a été retenu, pas ce qui a été payé. Chaque ligne retenue devient une transaction ordinaire — elle suit son cours et donne lieu à un callback, exactement comme si vous l'aviez initiée seule.

Une ligne de lot porte les champs d'un dépôt : ni url_success, ni url_failed, ni redirection. Le paiement en masse sert à verser — salaires, commissions, remboursements — et le contrôle de solde ne compte que les lignes de dépôt (_CASHIN_), les seules qui engagent votre compte.

Le paiement en masse doit être activé sur votre compte partenaire. Sans cela l'appel répond 1118 et rien n'est créé : demandez l'activation au support avant votre première intégration.

Sur les deux endpoints de cette section, loginApi et mdpApi peuvent être remplacés par les en-têtes X-Partner-Login et X-Partner-Key. Si les deux sont fournis et se contredisent, l'appel est refusé (1110) plutôt qu'arbitré : un appel authentifié pour un partenaire mais dont le corps en nomme un autre tenterait de faire payer ce dernier.

POST
/bulkV2
Copier l'URL
Soumettez un lot de versements. La réponse nomme, ligne par ligne, celles qui ont été retenues et celles qui ont été rejetées d'emblée.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API. Facultatif si l'appel porte l'en-tête X-Partner-Login
mdpApi	string	Oui	Votre mot de passe API. Facultatif si l'appel porte l'en-tête X-Partner-Key
referenceLot	string	Non	Votre référence de lot, qui sert de clé d'idempotence pendant 24 h. Facultative, mais fortement recommandée : sans elle, un réessai après une coupure réseau paie les bénéficiaires deux fois
transactions	array	Oui	Les lignes du lot, 1 000 au plus. Une ligne invalide est rejetée seule, sans faire tomber les autres
transactions[].idPartenaire	string	Oui	Votre référence de ligne, reprise dans la réponse et dans les callbacks
transactions[].codeService	string	Oui	Code du service (ex: SN_CASHIN_WAVE, CI_CASHIN_MTN)
transactions[].montant	number	Oui	Montant de la ligne, dans la devise du service. Doit être supérieur à 0
transactions[].numeroBeneficiaire	string	Oui	Numéro du bénéficiaire, sans indicatif pays (ex: 771234567)
transactions[].prenomBeneficiaire	string	Non	Prénom du bénéficiaire
transactions[].nomBeneficiaire	string	Non	Nom du bénéficiaire
Requête
Copier
{
  "loginApi": "MIAMS",
  "mdpApi": "********",
  "referenceLot": "SALAIRES-2026-09",
  "transactions": [
    {
      "idPartenaire": "SAL-0001",
      "codeService": "SN_CASHIN_WAVE",
      "montant": 150000,
      "numeroBeneficiaire": "771234567",
      "prenomBeneficiaire": "Awa",
      "nomBeneficiaire": "Diop"
    },
    {
      "idPartenaire": "SAL-0002",
      "codeService": "SN_CASHIN_WAVE",
      "montant": 120000,
      "numeroBeneficiaire": "770000000"
    }
  ]
}
Réponse
Copier
{
  "errorCode": "201",
  "errorMessage": "Lot accepté — traitement en cours ...",
  "data": {
    "jobId": "8f3c1b2e-5d6a-4f70-9c11-0a2b3c4d5e6f",
    "statut": "PROCESSING",
    "totalRecu": 2,
    "totalAccepte": 1,
    "totalRejete": 1,
    "transactions": [
      { "idPartenaire": "SAL-0001", "tokenTX": "TXGTJCHOO2BWTUQ2I" },
      { "idPartenaire": "SAL-0002", "erreur": { "code": "1109", "message": "Service invalide ou désactivé ..." } }
    ]
  }
}
errorCode décrit l'issue de l'appel, jamais celle des paiements : 201 signifie que le lot est pris en charge, rien n'est encore réglé. Une ligne portant un tokenTX a été créée et mise en file ; une ligne portant erreur n'existe pas et n'a rien débité.

jobId est aussi le referenceBulk que porteront les transactions du lot — dans les callbacks, dans POST /statusV2 et dans vos rapports. C'est le fil qui relie une transaction à son lot.

Ce qui fait tomber le lot entier. Le refus porte alors sur l'ensemble et non sur une ligne : aucune transaction n'est créée, rien n'est débité, et la réponse ne contient pas de data.

errorCode	Ce que cela veut dire
1103	Solde insuffisant — le total des dépôts du lot, frais compris, augmenté de votre encours déjà engagé, dépasse le solde du compte concerné. Le contrôle porte compte par compte : un lot qui touche plusieurs pays est vérifié sur chacun.
1104	Exception pendant le traitement du lot.
1110	Mot de passe API incorrect, ou loginApi du corps en contradiction avec l'en-tête X-Partner-Login.
1111	Mot de passe API absent.
1112	Partenaire inconnu.
1113	loginApi absent.
1114	Partenaire désactivé.
1117	Adresse IP non autorisée.
1118	Paiement en masse non activé sur ce compte partenaire.
1120	Requête vide, ou liste de transactions vide.
1121	Aucune ligne valide dans le lot. La réponse ne dit pas laquelle a échoué sur quoi : corrigez vos lignes à partir des codes de rejet ci-dessous.
1122	Un autre lot de ce partenaire est en cours de prise en charge. Un seul lot à la fois, pour que deux lots ne se disputent pas le même solde — réessayez dans quelques secondes.
1132	Le lot dépasse le plafond de 1 000 lignes.
Ces codes sont ceux de cet endpoint, et se lisent dans le contexte de l'appel qui les rend. Plusieurs valeurs servent ailleurs à autre chose : sur l'initiation unitaire, 1118 et 1119 signalent une url_success ou une url_failed manquante, 1120 et 1121 une adresse qui ne commence pas par https://, et 1122 un numéro portant son indicatif pays.

Ce qui ne fait tomber qu'une ligne. Les autres lignes du lot suivent leur cours ; la ligne rejetée n'a jamais existé et n'a rien débité.

erreur.code	Ce que cela veut dire
1100	Champ obligatoire manquant sur la ligne : idPartenaire, codeService, numeroBeneficiaire, ou montant absent ou nul.
1102	Service fermé pour votre compte : aucun rattachement partenaire × service, ou rattachement suspendu. Le motif de la ligne le dit ; voir « Services suspendus » dans la section Erreurs.
1105	Aucun compte configuré chez nous pour le pays de ce service.
1109	Service inconnu ou désactivé.
1115	Pays non défini pour ce service.
5501	Cet idPartenaire est déjà enregistré — si le contrôle d'unicité est activé sur votre compte.
Plafond et découpage. Un lot porte au plus 1 000 lignes ; au-delà, l'appel répond 1132 et rien n'est créé. La raison est une durée, pas une préférence : l'acceptation valide chaque ligne, contrôle le solde et enregistre le lot dans la requête HTTP elle-même. Découpez un lot plus gros de votre côté — chaque part reçoit son propre jobId.

referenceLot — rejouer sans payer deux fois. C'est la clé d'idempotence du lot : une seconde requête portant la même valeur ne crée pas un second lot, elle rend le jobId du premier avec son avancement. La référence est conservée 24 heures. Notez qu'un rejeu ne reconstitue pas le détail ligne par ligne, rendu une seule fois à la première réponse — conservez-le.

POST
/bulkV2/status
Copier l'URL
Récapitulatif d'un lot déjà soumis. Restreint au partenaire qui l'a soumis. La réponse est gardée 5 minutes.

Champ	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API. Facultatif si l'appel porte l'en-tête X-Partner-Login
mdpApi	string	Oui	Votre mot de passe API. Facultatif si l'appel porte l'en-tête X-Partner-Key
jobId	string	Oui	Référence Sycapay du lot, telle que rendue à la soumission
Requête
Copier
{
  "loginApi": "MIAMS",
  "mdpApi": "********",
  "jobId": "8f3c1b2e-5d6a-4f70-9c11-0a2b3c4d5e6f"
}
Réponse
Copier
{
  "errorCode": "200",
  "data": {
    "jobId": "8f3c1b2e-5d6a-4f70-9c11-0a2b3c4d5e6f",
    "statut": "PARTIAL",
    "totalRecu": 250,
    "enCours": 0,
    "reussies": 248,
    "echouees": 2,
    "dateCreation": "2026-09-20T09:14:02Z",
    "dateFin": "2026-09-20T09:16:41Z",
    "dateCalcul": "2026-09-20T09:18:00Z",
    "echecs": [
      {
        "idPartenaire": "SAL-0117",
        "tokenTX": "TXR4KP9AA1CZLME7V",
        "tag": "FAILED",
        "erreur": {
          "code": "recipient-limit-exceeded",
          "message": "Plafond du bénéficiaire atteint"
        }
      }
    ]
  }
}
statut	Ce que cela veut dire
PROCESSING	Au moins un paiement est encore en vol : son issue n'est pas connue.
COMPLETED	Tous les paiements ont abouti.
PARTIAL	Toutes les issues sont connues, certaines sont des échecs.
FAILED	Toutes les issues sont connues, aucun paiement n'a abouti.
Ces compteurs portent sur les paiements, pas sur leur envoi. Ils se lisent sur les transactions du lot et suivent donc les issues au fur et à mesure qu'elles arrivent : un paiement que l'opérateur a d'abord accepté, puis refusé, bascule de enCours à echouees. dateFin est la date de la dernière issue du lot ; elle est absente tant qu'un paiement reste en vol.

echecs liste les paiements qui n'ont pas abouti, les plus anciens d'abord et au plus cent — de quoi savoir lesquels reprendre. Il est absent quand aucun n'a échoué. echouees donne le compte exact même quand la liste est tronquée ; pour le détail complet d'un paiement, POST /statusV2 avec son idPartenaire.

Attention à totalRecu, qui ne compte pas la même chose des deux côtés : à la soumission, les lignes que vous avez envoyées ; ici, les lignes retenues — celles qui ont été créées. Le nombre de rejets ne figure que dans la réponse à la soumission, et ne se retrouve pas ensuite.

errorCode	Ce que cela veut dire
200	Lot trouvé, data renseigné.
1110 / 1111	Mot de passe API incorrect / absent.
1112 / 1113 / 1114	Partenaire inconnu / loginApi absent / partenaire désactivé.
1115	jobId absent.
1133	Aucun lot ne correspond à ce jobId pour votre compte.
Un jobId appartenant à un autre partenaire répond 1133, exactement comme un jobId inconnu : distinguer les deux confirmerait l'existence du lot d'autrui.

La réponse est gardée 5 minutes. Ce récapitulatif agrège les issues de toutes les transactions du lot, puis en relit les échecs ; les appels rapprochés sont donc servis depuis ce cache. Appelez-le autant que vous voulez, rien n'est refusé — mais une réponse peut avoir jusqu'à 5 minutes, et data.dateCalcul dit à quel moment elle a été établie. Mieux vaut le lire que le supposer : un paiement repris à l'instant peut encore figurer en échec dans un récapitulatif calculé quatre minutes plus tôt.

Ce n'est pas le canal pour suivre un lot. Le webhook porte la même information, transaction par transaction et au moment où elle est connue, sans délai ni cache. Réservez ce récapitulatif au rattrapage : une notification manquée, une réconciliation, un écran qu'on ouvre.

08
Webhooks
Référence
Recevez des notifications en temps réel sur les changements de statut des transactions via webhooks.

Enveloppe d'événement : eventId, eventType et eventDate encadrent l'état complet de la transaction dans data.

Un cash-in peut rester en cours plusieurs heures. Quand le service est momentanément indisponible, il n'échoue pas forcément : il reste PENDING, sans notification, et part de lui-même dès que possible. Au bout de vingt-quatre heures sans avoir pu partir, il échoue avec erreur.code = service-temporarily-unavailable — rien n'a été versé. Ne le renvoyez pas tant qu'il est en cours : un second cash-in sous un autre idPartenaire paierait le bénéficiaire deux fois quand le premier partira.

Un échec peut rester en cours le temps d'être nommé. Après la bascule, un échec dont la cause n'est pas encore répertoriée chez Sycapay ne vous est pas annoncé sous unclassified : la transaction reste PENDING — sans notification, et POST /statusV2 la rend en cours — le temps que la cause soit nommée, au plus vingt-quatre heures. Vous recevez alors son callback avec le code qui la dit. Passé ce délai, il vous parvient avec unclassified. Rien n'a été versé : l'opération a échoué, seule son annonce attend.

webhook v2
Copier
{
  "eventId": "evt_5f452ccbe22343cf96a339b35a8e7967",
  "eventType": "decaissement.success",
  "eventDate": "2026-07-29T15:18:45Z",
  "data": {
    "tokenTX": "TXGTJCHOO2BWTUQ2I",
    "idPartenaire": "1567543354332142125129",
    "codeService": "SN_PM_WAVE",
    "typeService": "DECAISSEMENT",
    "typeTransaction": "WAVESN",
    "tag": "SUCCESS",
    "statut": "FINISHED",
    "montant": 113173,
    "frais": 1131,
    "commission": 226,
    "devise": "XOF",
    "codePays": "SN",
    "erreur": null,
    "metadata": {
      "commande": "8421",
      "canal": "web"
    }
  }
}
En échec, data.erreur porte le code et le message du motif. Jusqu'à la bascule, annoncée dans le journal des modifications, ce sont ceux de l'opérateur, tels quels. Ensuite, ce sont les valeurs unifiées de Sycapay : une même cause porte le même code quel que soit l'opérateur, avec le message que Sycapay donne à ce code — jamais celui de l'opérateur. unclassified signifie qu'aucune catégorie ne reconnaît encore l'échec, et message porte alors un message générique ; la liste des codes peut s'allonger, et un code que vous ne connaissez pas se traite comme unclassified. Hors échec — annulation, transaction en cours —, plus de bloc erreur. POST /statusV2 et le récapitulatif d'un lot rendent le même bloc.

data.erreur en échec, après la bascule
Copier
"erreur": {
  "code": "beneficiary-limit-reached",
  "message": "Le bénéficiaire a atteint le plafond de montant que lui applique son opérateur."
}
eventType : ce sur quoi vous routez

Sa forme est <typeService>.<issue>, les deux moitiés étant exactement data.typeService et data.tag. Attention au vocabulaire : il se lit du côté du portefeuille du client, pas du vôtre. Un service de paiement (_PM_) encaisse auprès de lui — son portefeuille est débité, l'événement s'appelle donc decaissement. Un service de dépôt (_CASHIN_) le crédite, et s'appelle encaissement. C'est à rebours de ce qu'on lit depuis sa propre trésorerie : fiez-vous au tableau, pas à l'intuition.

eventType	Ce qui vient de se passer
decaissement.success	Un paiement marchand (_PM_) a abouti : le client a payé.
decaissement.failed	Un paiement marchand a échoué : refus, abandon ou expiration.
encaissement.success	Un dépôt (_CASHIN_) a abouti : le bénéficiaire a été crédité.
encaissement.failed	Un dépôt a échoué : le bénéficiaire n'a rien reçu.
transaction.canceled	Transaction annulée.
transaction.success, transaction.failed	Repli, quand le sens de l'opération n'est pas déterminé.
Charge utile webhook

webhook v1
Copier
{
  "idPartenaire": "1567543354332142125129",
  "tag": "SUCCESS",
  "codeService": "SN_CASHIN_YAS",
  "reasonForFailure": "Vous avez atteint votre plafond journalier"
}
Choisissez le mécanisme adapté à votre infrastructure. Les secrets (mot de passe, token, clé HMAC) sont chiffrés au repos et jamais renvoyés en clair.

Mode	Description
none	Aucune authentification — réservé aux environnements de test.
Basic	En-tête Authorization Basic construit à partir d'un login et d'un mot de passe stockés chiffrés.
Bearer	Jeton porteur statique injecté dans l'en-tête Authorization.
HMAC	Signature HMAC (SHA256 par défaut, SHA512 disponible) du corps brut, transmise dans X-Sycapay-Signature (nom personnalisable).
Vérifier la signature HMAC
Copier
import base64, hmac, hashlib

def verify(body: bytes, header: str, secret: str) -> bool:
    # header = signature Base64 brute, sans prefixe d'algorithme
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(header, expected)
En cas d'échec, le webhook est rejoué selon la configuration du partenaire avec un backoff exponentiel borné.

Champ	Description
timeoutSeconds	Délai maximum (en secondes) accordé à votre serveur pour répondre.
maxRetryAttempts	Nombre maximum de tentatives en cas d'échec (hors 2xx).
retryMinBackoffSeconds	Délai minimum (en secondes) entre deux tentatives.
retryMaxBackoffSeconds	Délai plafond (en secondes) entre deux tentatives.
hmacAlgorithm	Algorithme HMAC utilisé pour signer la charge utile (SHA512 disponible en option).
Une même notification peut être livrée plusieurs fois — utilisez idPartenaireService comme clé d'idempotence côté réception.

09
Erreurs
Référence
Comprendre les réponses d'erreur pour gérer les échecs de manière élégante dans votre application.

Un errorCode se lit dans le contexte de l'appel qui l'a rendu. Le tableau ci-dessous décrit les codes de l'initiation unitaire et de la consultation de statut. Le paiement en masse réutilise plusieurs de ces valeurs avec un autre sens — 1118, 1120, 1121 et 1122 notamment : voir la section Paiement en masse, qui donne ses codes à elle.

200
Succès
Requête acceptée. Pour un paiement asynchrone, le statut final est notifié par callback.
201
En attente
Transaction acceptée, en cours de traitement (asynchrone) — statut final notifié par callback.
202
Échec
La transaction a échoué chez l'opérateur (rejet, délai dépassé ou absence de réponse).
400
Échec
Route du service introuvable ou désactivée — transaction non transmise.
1100
Requête invalide
Ligne d'un lot invalide (idPartenaire, codeService, montant ou numéro bénéficiaire manquant).
1101
Erreur
Erreur de traitement de la requête, ou idPartenaire déjà utilisé.
1102
Échec
Service fermé pour ce partenaire : soit aucun rattachement, soit un rattachement suspendu. errorMessage dit lequel des deux — voir « Services suspendus » plus bas.
1103
Échec
Solde insuffisant pour couvrir le montant et les transactions en attente.
1104
Erreur
Exception pendant le traitement de la transaction.
1105
Échec
Compte partenaire non configuré ou désactivé
1106
Échec
Le montant de la transaction est obligatoire
1107
Échec
Numéro du bénéficiaire obligatoire ou montant doit être supérieur à 0
1108
Échec
Ce service est désactivé
1109
Échec
Ce service n'existe pas
1110
Erreur Auth
Le mot de passe de l'API n'est pas correct
1111
Erreur Auth
Le mot de passe de l'API est obligatoire
1112
Erreur Auth
Ce partenaire n'existe pas
1113
Erreur Auth
Le loginApi est obligatoire
1114
Échec
Partenaire désactivé ou transaction non trouvée
1115
Échec
Identifiant partenaire non renseigné ou pays non configuré
1116
Échec
L'ID Partenaire est obligatoire ou erreur de traitement
1117
Interdit
Adresse IP non autorisée
1118
Échec
L'url_success est obligatoire pour les services Wave Payment et Orange Money Payment
1119
Échec
L'url_failed est obligatoire pour les services Wave Payment et Orange Money Payment
1120
Échec
L'url_success doit commencer par https://
1121
Échec
L'url_failed doit commencer par https://
1122
Échec
Le numéro du destinataire ne doit pas contenir d'indicatif pays — saisir uniquement le numéro local (ex: 771234567)
1123
Échec
Le numéro du destinataire doit contenir uniquement des chiffres, sans indicatif pays (ex: 771234567)
1124
Échec
Le numéro du destinataire n'est pas un numéro valide pour le pays du service (ex: un numéro sénégalais sur un service CI_, ou un numéro local invalide)
1129
Transaction introuvable
Aucune transaction ne correspond à cette référence pour votre compte (POST /statusV2). Renvoyé aussi bien pour une référence inconnue que pour une référence appartenant à un autre partenaire.
1139
Échec
Les metadata dépassent une borne : 20 clés au plus, 40 caractères par clé, 500 par valeur, ni clé vide ni valeur nulle. errorMessage nomme la clé en cause.
5501
Échec
Cet IdPartenaire est déjà enregistré
Services suspendus. Un service peut vous être fermé de deux façons : il ne vous a jamais été rattaché, ou son rattachement a été suspendu. Les deux rendent 1102 — du point de vue de l'intégration ils appellent la même conduite, cesser d'appeler ce service — et c'est errorMessage qui les distingue.

Le message d'une suspension est choisi par votre gestionnaire au moment où il suspend, puis figé : il dit la situation et ce qu'il faut faire pour en sortir. Les textes ci-dessous sont ceux d'aujourd'hui, donnés pour que vous sachiez ce que vous pouvez recevoir — la liste s'allonge sans préavis et les formulations peuvent être réécrites. Affichez le message à vos équipes, ne l'analysez pas : aucun code de motif ne circule dans la réponse, seul le texte.

Situation	Ce que porte errorMessage
Plus de fonds sur ce service	Ce service est suspendu : il n'y a plus de fonds disponibles pour l'alimenter. Il sera rétabli dès réapprovisionnement.
Arriérés de règlement	Ce service est suspendu en attendant la régularisation de votre situation. Rapprochez-vous de votre gestionnaire.
Opérateur indisponible	Ce service est momentanément suspendu, l'opérateur étant indisponible. Il sera rétabli dès son rétablissement.
Suspension à votre demande	Ce service est suspendu à votre demande. Contactez votre gestionnaire pour le rétablir.
Dossier à régulariser	Ce service est suspendu en attendant la régularisation de votre dossier. Rapprochez-vous de votre gestionnaire.
Paramétrage du service en cours	Ce service est momentanément suspendu le temps de mettre à jour son paramétrage. Il sera rétabli sous peu.
Suspension demandée par l'opérateur	Ce service est suspendu à la demande de l'opérateur. Rapprochez-vous de votre gestionnaire pour connaître les conditions de son rétablissement.
Pièces du dossier expirées	Ce service est suspendu : des pièces de votre dossier ont expiré. Transmettez-en une version à jour à votre gestionnaire pour le rétablir.
Intégration à corriger	Ce service est suspendu le temps de corriger votre intégration : un nombre anormal de requêtes en erreur a été constaté. Rapprochez-vous du support technique.
Plafond contractuel atteint	Ce service est suspendu : le volume prévu par votre contrat pour la période est atteint. Il sera rétabli à la période suivante ou après révision du plafond.
Contrat échu	Ce service est suspendu : le contrat qui le couvre est arrivé à échéance. Rapprochez-vous de votre gestionnaire pour le renouveler.
Service inutilisé	Ce service a été suspendu faute d'activité. Contactez votre gestionnaire pour le réactiver.
Fin de la période d'essai	Ce service est suspendu : la période d'essai est terminée. Rapprochez-vous de votre gestionnaire pour passer en production.
Activité inhabituelle à vérifier	Ce service est momentanément suspendu, le temps de vérifier une activité inhabituelle. Rapprochez-vous de votre gestionnaire.
Identifiants d'accès à renouveler	Ce service est suspendu par précaution : une utilisation inhabituelle de vos identifiants d'accès a été détectée. Renouvelez-les avec votre gestionnaire pour le rétablir.
À voir avec votre gestionnaire	Ce service est momentanément suspendu. Rapprochez-vous de votre gestionnaire.
Décision réglementaire	Ce service est suspendu en application d'une décision réglementaire. Rapprochez-vous de votre gestionnaire.
Aucun motif enregistré	« Ce service est suspendu pour ce partenaire ... » — repli des suspensions posées avant que les motifs n'existent. Il ne dit pas la raison : votre gestionnaire vous la donnera.
Le contrôle est le même partout où un service est engagé : initiation unitaire, ligne de lot, création d'une session de paiement. Une ligne de lot portant un service suspendu est rejetée avec 1102 comme les autres rejets ligne par ligne, sans faire tomber le lot. Un service suspendu se rouvre chez nous, jamais depuis l'API.

10
Codes d'échec
Référence
En échec, data.erreur.code dit pourquoi, dans le webhook v2, POST /statusV2 et le récapitulatif d'un lot. Après la bascule, annoncée dans le journal des modifications, c'est l'un des codes ci-dessous : une même cause porte le même code quel que soit l'opérateur, et data.erreur.message porte le message de sa catégorie, en français. Jusque-là, code et message restent ceux de l'opérateur — voir la section Webhooks.

Aiguillez sur le code, jamais sur le message : sa formulation peut changer, le code non. « Qui doit agir » dit d'où viendra la solution ; « Rejouable » dit si une nouvelle tentative à l'identique peut aboutir. La liste peut s'allonger sans préavis : un code que vous ne connaissez pas se traite comme unclassified. Ces codes nomment l'échec d'une transaction. Un refus qui précède toute transaction — identifiants ou adresse IP refusés, partenaire désactivé, service non souscrit ou suspendu, trop de requêtes — n'en a pas : aucune transaction ne le porte, et l'API le rend sous ses propres codes (section Erreurs), 1114 pour un partenaire désactivé.

Solde et plafonds

Code	Ce que cela veut dire	Qui doit agir	Rejouable
insufficient-funds	Le solde du payeur ne couvre pas l'opération.	Le client	Non
beneficiary-limit-reached	Le bénéficiaire a atteint son plafond de montant (jour, semaine, mois).	Le client	Non
beneficiary-tx-count-reached	Le bénéficiaire a atteint son nombre maximal d'opérations sur la période.	Le client	Non
beneficiary-balance-cap-reached	Le compte du bénéficiaire a atteint son solde maximal autorisé.	Le client	Non
sender-limit-reached	Le payeur a atteint son plafond de montant.	Le client	Non
sender-tx-count-reached	Le payeur a atteint son nombre maximal d'opérations sur la période.	Le client	Non
service-limit-exceeded	Le montant dépasse le maximum autorisé sur ce service.	Vous	Non
amount-below-minimum	Le montant est inférieur au minimum autorisé sur ce service.	Vous	Non
limit-or-balance-unclear	Plafond atteint ou solde insuffisant, sans que l'opérateur précise lequel.	Le client	Non
Comptes du payeur et du bénéficiaire

Code	Ce que cela veut dire	Qui doit agir	Rejouable
recipient-not-found	Le numéro du bénéficiaire ne correspond à aucun compte.	Vous	Non
sender-not-found	Le numéro du payeur ne correspond à aucun compte.	Vous	Non
recipient-unverified	L'opérateur n'a pas pu vérifier le bénéficiaire.	Le client	Non
recipient-blocked	Le compte du bénéficiaire est bloqué.	Le client	Non
recipient-inactive	Le compte du bénéficiaire est inactif et doit être réactivé.	Le client	Non
recipient-not-eligible	Le bénéficiaire n'est pas autorisé à recevoir ce type d'opération.	Le client	Non
recipient-account-closed	Le compte du bénéficiaire est clôturé.	Le client	Non
recipient-name-mismatch	Le nom transmis ne correspond pas au titulaire du compte.	Vous	Non
sender-blocked	Le compte du payeur est bloqué ou suspendu.	Le client	Non
sender-inactive	Le compte du payeur est inactif et doit être réactivé.	Le client	Non
sender-not-eligible	Le payeur n'est pas autorisé à effectuer ce type d'opération.	Le client	Non
cross-border-not-allowed	Les opérations entre le pays du payeur et celui du service ne sont pas autorisées.	Le client	Non
Validation par le payeur

Code	Ce que cela veut dire	Qui doit agir	Rejouable
expired	Le payeur n'a pas validé dans le délai : l'opération a expiré.	Le client	Oui
payer-declined	Le payeur a refusé ou annulé l'opération.	Le client	Oui
wrong-pin	Le payeur a saisi un code secret incorrect.	Le client	Oui
pin-attempts-exceeded	Trop de codes secrets erronés : le compte du payeur est bloqué chez son opérateur.	Le client	Non
otp-invalid	Le code de validation saisi est incorrect ou a expiré.	Le client	Oui
duplicate-transaction	L'opérateur a refusé une opération identique à une précédente.	Vous	Non
Cartes

Code	Ce que cela veut dire	Qui doit agir	Rejouable
card-declined	La banque émettrice a refusé le paiement.	Le client	Non
card-details-invalid	Numéro, date d'expiration ou cryptogramme incorrects.	Le client	Oui
card-authentication-failed	L'authentification 3-D Secure du porteur a échoué.	Le client	Oui
card-not-supported	Cette carte n'est pas acceptée pour ce paiement.	Le client	Non
card-limit-exceeded	La carte a atteint son plafond ou son nombre d'opérations.	Le client	Non
card-expired	La carte est expirée.	Le client	Non
card-issuer-unavailable	La banque émettrice est momentanément injoignable.	L'opérateur	Oui
Requête et paramétrage

Code	Ce que cela veut dire	Qui doit agir	Rejouable
invalid-request	Données transmises incorrectes ou incomplètes pour cet opérateur.	Vous	Non
account-number-invalid	Numéro ou identifiant de compte mal formé.	Vous	Non
amount-invalid	Montant invalide : format, décimales ou valeur nulle.	Vous	Non
currency-not-supported	Devise non prise en charge sur ce service.	Vous	Non
duplicate-reference	Référence de transaction déjà utilisée.	Vous	Non
authorization-failed	L'opérateur a refusé d'autoriser l'opération pour l'un des comptes.	L'opérateur	Non
service-misconfigured	Service indisponible tant que son paramétrage n'est pas corrigé ; rien n'a été engagé.	Sycapay	Non
route-disabled	Ce service est temporairement fermé.	Sycapay	Non
Exploitation

Code	Ce que cela veut dire	Qui doit agir	Rejouable
provider-unavailable	Service de l'opérateur momentanément indisponible ; rien n'a été engagé.	L'opérateur	Oui
provider-maintenance	Opérateur en maintenance ; rien n'a été engagé.	L'opérateur	Oui
provider-internal-error	L'opérateur a rencontré une erreur technique ; l'opération n'a pas été exécutée.	L'opérateur	Oui
service-temporarily-unavailable	Opération impossible pour le moment ; rien n'a été engagé, elle peut être renvoyée plus tard.	Sycapay	Oui
internal-error	Erreur rencontrée chez Sycapay ; la transaction n'a pas été traitée.	Sycapay	Oui
Refus et issues sans motif détaillé

Code	Ce que cela veut dire	Qui doit agir	Rejouable
provider-rejected	L'opérateur a refusé l'opération sans en préciser le motif.	L'opérateur	Non
transaction-not-permitted	L'opération n'est pas autorisée ; aucun détail n'est communiqué.	Sycapay	Non
transaction-cancelled	L'opération a été annulée avant son exécution.	Le client	Non
transaction-not-delivered	Le paiement a été refusé ou n'a pas abouti chez l'opérateur du bénéficiaire.	L'opérateur	Non
transaction-unknown-to-provider	L'opérateur ne retrouve pas l'opération ; elle n'a pas été exécutée.	L'opérateur	Oui
verification-timeout	L'opérateur du bénéficiaire n'a pas répondu à la vérification ; rien n'a été exécuté.	L'opérateur	Oui
Non classé

Code	Ce que cela veut dire	Qui doit agir	Rejouable
unclassified	Aucune catégorie ne reconnaît encore cet échec ; sa cause reste à établir.	À établir	Non
11
Paramètres
Référence
Référence complète de tous les paramètres disponibles pour les requêtes API.

Paramètre	Type	Requis	Description
loginApi	string	Oui	Votre nom d'utilisateur API pour l'authentification
mdpApi	string	Oui	Votre mot de passe API pour l'authentification
montant	number	Oui	Montant de la transaction en monnaie locale (minimum: 100 XOF)
codeService	string	Oui	Code d'identification du service (ex: SN_CASHIN_OM, SN_PM_WAVE)
numeroBeneficiaire	string	Oui	Numéro mobile du bénéficiaire en format local uniquement, sans indicatif pays (ex: 771234567 — ne pas saisir +221771234567 ni 00221771234567). Doit être un numéro valide pour le pays du service (préfixe du code service : SN_ → Sénégal, CI_ → Côte d'Ivoire)
idPartenaire	string	Oui	ID de référence de transaction unique de votre système
Paramètre	Type	Requis	Description
url_success	string	Non	Adresse de retour après validation — obligatoire pour SN_PM_WAVE, SN_PM_OM et CI_PM_OM, doit commencer par https://
url_failed	string	Non	Adresse de retour après refus ou abandon — obligatoire pour SN_PM_WAVE, SN_PM_OM et CI_PM_OM, doit commencer par https://
nomMarchand	string	Non	Nom du marchand à afficher (pour Orange Money)
isSingleUse	boolean	Non	Si le lien de paiement est à usage unique (pour Orange Money)
latitude	string	Non	Coordonnée de latitude géographique pour la localisation de la transaction
longitude	string	Non	Coordonnée de longitude géographique pour la localisation de la transaction
idPartenaireApi	string	Non	Référence de l'opérateur, posée par la plateforme à l'initiation et reprise pour la réconciliation de statut. Vous la lisez, vous ne l'envoyez pas.
Codes de service

Code	Pays	Nom
SN_CASHIN_OM	SN	Dépôt Orange Money
SN_PM_OM	SN	Paiement Orange Money
SN_CASHIN_WAVE	SN	Dépôt Wave
SN_PM_WAVE	SN	Paiement Wave
SN_CASHIN_YAS	SN	Dépôt YAS
SN_PM_YAS	SN	Paiement YAS
CI_CASHIN_OM	CI	Dépôt Orange Money
CI_PM_OM	CI	Paiement Orange Money
CI_CASHIN_WAVE	CI	Dépôt Wave
CI_PM_WAVE	CI	Paiement Wave
CI_CASHIN_MTN	CI	Dépôt MTN Mobile Money
CI_PM_MTN	CI	Paiement MTN Mobile Money
CI_CASHIN_MOOV	CI	Dépôt Moov
CI_PM_MOOV	CI	Paiement Moov
BJ_CASHIN_MTN	BJ	Dépôt MTN Mobile Money
BJ_PM_MTN	BJ	Paiement MTN Mobile Money
BJ_CASHIN_MOOV	BJ	Dépôt Moov
BF_CASHIN_OM	BF	Dépôt Orange Money
ML_CASHIN_OM	ML	Dépôt Orange Money
TG_CASHIN_MIXX	TG	Dépôt Mixx by YAS
Tous les services se règlent en francs CFA (XOF) : les montants d'une requête s'expriment dans cette devise, sans décimale.

12
Journal des modifications
Référence
Historique des versions de l'API et de la documentation.

Version	Date	Modification
v1.18 — Actuelle	8 octobre 2026	Ajout : un échec dont la cause n'est pas encore répertoriée ne vous est plus annoncé sous unclassified une fois la bascule faite. La transaction reste en cours — sans callback, PENDING dans POST /statusV2 et en cours dans le récapitulatif d'un lot — le temps que Sycapay nomme la cause, au plus vingt-quatre heures ; le callback part alors avec le code qui la dit, ou avec unclassified au-delà. · À noter : rien n'est versé pendant cette attente, l'opération a échoué ; seule son annonce attend. Les partenaires restés au callback V1 ne sont pas concernés : leur callback porte le message de l'opérateur.
v1.17	8 octobre 2026	Ajout : le code unifié provider-internal-error — l'opérateur a reçu la demande et l'a refusée sur une erreur de son propre système ; l'opération n'a pas été exécutée, et une nouvelle tentative peut aboutir. À distinguer de provider-unavailable, quand la demande n'a pas reçu de réponse, et de provider-rejected, un refus sans motif. · À noter : une fois la bascule faite, l'erreur technique de la plateforme carte, le dépôt refusé par Orange Money Côte d'Ivoire sous son code 500 et les erreurs internes de PI-SPI ou d'un participant (AB04, AB09, FF10) porteront ce code au lieu de provider-rejected ou provider-unavailable.
v1.16	7 octobre 2026	Ajout : POST /balance accepte numeroCompte pour ne lire qu'un de vos comptes ; un numéro qui n'est pas l'un des vôtres rend une liste vide. · Correction : le solde est lu au moment de la requête, sans cache ; lastCheckedAt donne l'heure de cette lecture.
v1.15	5 octobre 2026	Annonce : data.erreur.code et data.erreur.message passeront des valeurs de l'opérateur aux valeurs unifiées de Sycapay, dans le webhook v2, POST /statusV2 et le récapitulatif d'un lot : une même cause portera le même code quel que soit l'opérateur, avec un message rédigé pour vous ; la date de la bascule sera annoncée ici. Si vous aiguillez sur les codes de l'opérateur (2040, recipient-limit-exceeded, EXPIRED…), adaptez votre intégration dès maintenant ; EXPIRED deviendra expired. · À noter : unclassified signifie qu'aucune catégorie ne reconnaît encore l'échec, et un code inconnu se traite comme lui ; la liste peut s'allonger sans préavis. Le code comme le message sont contrôlés par Sycapay : le message de l'opérateur ne vous parvient plus, pas même pour unclassified, qui porte un message générique, et seul un échec porte un bloc erreur. · Ajout : la section Codes d'échec publie les 54 codes unifiés, regroupés par nature, avec qui doit agir et si une nouvelle tentative peut aboutir ; un refus qui précède toute transaction garde son code d'appel (section Erreurs). · Ajout : la liste des services suspendus passe à dix-sept situations, et son tableau dit désormais la situation plutôt que notre motif interne. · Ajout : quand le service est momentanément indisponible, un cash-in peut rester en cours jusqu'à vingt-quatre heures au lieu d'échouer ; il part de lui-même dès que possible, sinon il échoue avec service-temporarily-unavailable, sans que rien ait été versé. Ne le renvoyez pas tant qu'il est en cours. · À noter : partner-balance-insufficient est réservé — un solde insuffisant est refusé dès l'initiation (1103), avant toute transaction.
v1.14	3 octobre 2026	Ajout : transaction.metadata, vos propres paires clé/valeur jointes à l'initiation, enregistrées sans être interprétées et rendues telles quelles — réponse d'initiation, data.metadata du webhook v2 et de POST /statusV2. Le champ est absent quand vous n'en envoyez pas. · Ajout : la section Transactions documente POST /checkout/session, la création d'une session de paiement par carte hébergée ; elle accepte les mêmes métadonnées, reportées sur la transaction au paiement et jamais montrées au payeur. · Ajout : le code 1139, métadonnées hors bornes (20 clés, 40 caractères par clé, 500 par valeur). · À noter : ce metadata-là est le vôtre et vit dans le bloc transaction. Il n'a rien à voir avec le champ metadata d'Orange Money évoqué en v1.9, qui ne vous parvient toujours pas.
v1.13	29 septembre 2026	Ajout : la section Erreurs documente les services suspendus. 1102 ne disait que « service non rattaché » ; un rattachement suspendu rend le même code, et rien n'annonçait la différence — un intégrateur lisait « service non autorisé » pour un service qu'il utilisait la veille. C'est errorMessage qui porte la raison et la conduite à tenir : plus de fonds sur ce service, arriérés, indisponibilité de l'opérateur, suspension demandée, régularisation de conformité. · À noter : le message est choisi à la suspension puis figé, et les textes donnés sont ceux d'aujourd'hui. La liste s'allonge sans préavis et aucun code de motif ne circule dans la réponse, seul le texte : affichez-le, ne l'analysez pas. · À noter : le contrôle est le même sur les trois chemins qui engagent un service — initiation unitaire, ligne de lot, création d'une session de paiement. Une ligne de lot portant un service suspendu est rejetée avec 1102 sans faire tomber le lot.
v1.12	21 septembre 2026	Correction : les exemples de la section Démarrage n'initiaient qu'un dépôt, si bien qu'url_success et url_failed n'y apparaissaient nulle part — ni dans la liste des paramètres, ni dans aucune requête. Un intégrateur qui partait de là sur SN_PM_WAVE, SN_PM_OM ou CI_PM_OM recevait 1118 sans savoir pourquoi. La section porte désormais une requête de paiement complète, et dit ce qui est exigé, sur quels services, et ce que rend un envoi en http (1120, 1121). · Correction : la liste des paramètres omettait CI_PM_OM parmi les services qui exigent ces adresses ; ils sont trois, pas deux. · Correction : les réponses 201 de Wave et d'Orange Money Sénégal ne renvoyaient pas les adresses reçues, alors que le texte voisin annonce que le bloc transaction reprend ce qui a été envoyé. · À noter : mettez votre propre référence dans ces adresses. Nous les transmettons telles quelles ; les paramètres que l'opérateur y ajoute sont les siens, et c'est ainsi que vous retrouvez la commande au retour du client.
v1.11	20 septembre 2026	Correction : POST /bulkV2/status comptait les envois, non les paiements. Un lot dont les trois lignes étaient parties chez l'opérateur répondait « 3 envoyées, 0 échouée, COMPLETED » alors qu'un des paiements avait été refusé un instant plus tard. Les compteurs se lisent désormais sur les transactions du lot et suivent les issues au fur et à mesure qu'elles arrivent. envoyees disparaît au profit de reussies, echouees et enCours. · Ajout : statut gagne FAILED, pour un lot dont toutes les issues sont connues et dont aucun paiement n'a abouti — PARTIAL s'y lisait de travers. · Ajout : echecs, la liste des paiements qui n'ont pas abouti avec le motif de l'opérateur, les plus anciens d'abord et au plus cent. Savoir combien sans savoir lesquels n'aidait personne à reprendre. · Changement : dateFin est la date de la dernière issue du lot, et non plus la fin de l'envoi ; elle est absente tant qu'un paiement reste en vol. · Changement : la réponse de ce récapitulatif est gardée 5 minutes — il agrège tout le lot puis en relit les échecs, les appels rapprochés sont donc servis depuis ce cache. Rien n'est refusé ; en contrepartie une réponse peut avoir jusqu'à 5 minutes, et dateCalcul, nouveau, dit à quel moment elle a été établie. Le webhook reste le canal pour suivre un lot ; ce récapitulatif sert au rattrapage.
v1.10	20 septembre 2026	Ajout : la section Paiement en masse documente POST /bulkV2 et POST /bulkV2/status — un lot de versements soumis en un appel, accepté puis traité en arrière-plan. Ce que la réponse dit et ne dit pas : elle nomme les lignes retenues et celles rejetées d'emblée, jamais l'issue des paiements, qui arrive par callback comme pour une initiation unitaire. Le jobId rendu est aussi le referenceBulk que portent les transactions du lot. · Ajout : referenceLot, clé d'idempotence conservée 24 h — une seconde requête portant la même valeur rend le jobId du premier lot au lieu de payer les bénéficiaires deux fois. Un rejeu ne reconstitue pas le détail ligne par ligne, rendu une seule fois. · Ajout : les limites du lot — 1 000 lignes au plus (1132), un seul lot en cours à la fois par partenaire (1122), et le paiement en masse à activer au préalable sur le compte (1118). Le contrôle de solde porte sur tout le lot, compte par compte, et ne compte que les lignes de dépôt. · Ajout : les codes de rejet ligne par ligne (1100, 1102, 1105, 1109, 1115, 5501), distincts de ceux qui font tomber le lot entier. · Ajout : sur ces deux endpoints, loginApi et mdpApi peuvent être remplacés par les en-têtes X-Partner-Login et X-Partner-Key ; fournis tous les deux et contradictoires, l'appel est refusé plutôt qu'arbitré. · À noter : un errorCode se lit dans le contexte de l'appel qui l'a rendu. 1118, 1120, 1121 et 1122 désignent autre chose sur l'initiation unitaire, où ils portent les contrôles d'url_success, d'url_failed et du numéro du bénéficiaire. La section Erreurs le signale désormais. · À noter : totalRecu ne compte pas la même chose des deux côtés — à la soumission, les lignes envoyées ; sur le statut, les lignes retenues. Le nombre de rejets ne figure que dans la réponse à la soumission.
v1.9	18 septembre 2026	Ajout : la section Parcours de paiement décrit le trajet complet d'un encaissement, de l'initiation au webhook. Elle répond aux trois questions qui revenaient à l'intégration. Comment savoir ce qu'un service attend du client : la réponse d'initiation le dit, et trois formes couvrent le catalogue — un lien (Wave, Orange Money Côte d'Ivoire), un QR et des liens profonds (Orange Money Sénégal), ou rien du tout quand l'opérateur pousse l'invite sur le téléphone (YAS, MTN, Moov). Un tableau donne le comportement service par service. · Ce que portent url_success et url_failed : nous les transmettons à l'opérateur telles quelles, c'est lui qui redirige, et les paramètres qu'il ajoute sont les siens — mettez votre propre référence dans l'adresse pour retrouver votre commande. Le retour du navigateur n'est pas un résultat de paiement : seul le webhook fait foi. · Ajout : la règle est posée noir sur blanc — rien n'est payé tant que le webhook ne l'a pas dit. Ni le 201 de l'initiation, ni le retour du client sur url_success ne concluent une transaction : seul data.tag fait foi. Et si le webhook n'arrive pas, POST /statusV2 est le rattrapage prévu, il rend le même objet. · Correction : l'exemple de réponse d'Orange Money Sénégal était faux sur trois points. qrCode est une image PNG en base64, à afficher telle quelle en data:image/png;base64 — et non une charge EMV à tracer soi-même. deepLinks porte deux entrées, MAXIT et OM, vers une adresse https, et non un schéma om://. validFor est rendu au format local de l'opérateur, sans fuseau. Les champs validity, metadata et qrId n'arrivent jamais jusqu'au partenaire. · Correction : eventType et typeService étaient donnés à l'envers dans les exemples. Un paiement marchand (_PM_) porte typeService DECAISSEMENT et émet decaissement.success — le vocabulaire se lit du côté du portefeuille du client, dont le paiement débite le compte. Un dépôt (_CASHIN_) le crédite et émet encaissement.success. Une table de routage complète la section Webhooks : une intégration qui routait sur eventType d'après les anciens exemples aiguillait un paiement client vers son traitement de versement. · Correction : l'exemple de réponse de POST /initiationTransactionV1 montrait l'enveloppe de POST /statusV2 (errorCode et data) au lieu de ce que l'endpoint renvoie réellement — errorCode, errorMessage et le bloc transaction, augmenté du tokenTX.
v1.8	16 septembre 2026	Ajout : huit services au catalogue, portant la couverture de deux à six pays. Côte d'Ivoire : CI_CASHIN_MOOV et CI_PM_MOOV (Moov Money). Bénin : BJ_CASHIN_MTN et BJ_PM_MTN (MTN Mobile Money), BJ_CASHIN_MOOV. Burkina Faso : BF_CASHIN_OM. Mali : ML_CASHIN_OM. Togo : TG_CASHIN_MIXX (Mixx by YAS). Les quatre derniers sont des dépôts seuls : aucun paiement n'est proposé sur ces marchés pour l'instant. · Retrait : Wizall n'est plus proposé. Les codes SN_CASHIN_WIZALL et SN_PM_WIZALL quittent le catalogue, avec le paramètre otp qui ne servait qu'à la confirmation Wizall.
v1.7	4 septembre 2026	Ajout : erreur.code peut valoir EXPIRED (webhook v2 et POST /statusV2) lorsque le payeur n'a pas validé avant l'expiration du lien ou du QR. Le tag reste FAILED : rien à changer pour une intégration qui ignore erreur.code, mais l'abandon devient distinguable d'un refus opérateur.
v1.6	29 juillet 2026	Ajout : Webhook v2 : enveloppe d'événement (eventId, eventType, eventDate) portant l'intégralité de la transaction — montants, frais, commission, devise, dates, références opérateur, bénéficiaire et code d'erreur natif de l'opérateur. eventId sert de clé d'idempotence. · Ajout : POST /statusV2 : consultation de statut authentifiée (loginApi/mdpApi) et limitée à vos propres transactions, renvoyant le même détail complet que le webhook v2. · Modification : GET /status/{idPartenaire} et le format de webhook v1 sont dépréciés : toujours servis aux intégrations en place, mais les nouvelles démarrent en v2. · Correction : Vérification HMAC des webhooks : la signature est envoyée en Base64 brut dans X-Sycapay-Signature, sans préfixe d'algorithme. Les exemples de vérification décrivaient un format hexadécimal préfixé.
v1.5	10 juillet 2026	Ajout : Service Côte d'Ivoire : CI_PM_MTN — paiement marchand via MTN Mobile Money.
v1.4	6 juillet 2026	Ajout : Vérification de bénéficiaire (POST /verifyRecipient) : contrôle en lecture seule du numéro et du nom avant un payout, pour Wave (Sénégal et Côte d'Ivoire) et Orange Money (Sénégal).
v1.3	1 juillet 2026	Ajout : Checkout hébergé : création de sessions de paiement par carte sur une page PCI hébergée par Sycapay (le marchand n'a pas besoin d'être certifié PCI). · Ajout : Capture et remboursement (total ou partiel) des transactions carte GIM UEMOA.
v1.2	27 juin 2026	Ajout : Services Orange Money Côte d'Ivoire : CI_CASHIN_OM et CI_PM_OM.
v1.1	24 juin 2026	Ajout : Services Côte d'Ivoire : CI_CASHIN_MTN, CI_CASHIN_WAVE et CI_PM_WAVE. · Ajout : Code d'erreur 1124 — le numéro du destinataire n'est pas valide pour le pays du service. · Modification : Validation du numéro du bénéficiaire selon le pays, déduit du préfixe du code service (SN_, CI_).
v1.0	Version initiale	Ajout : Lancement de l'API : cash-in, paiements marchands, statut de transaction et webhooks (Sénégal).
© 2026 SycaPay. Tous droits réservés.
v2.2.0
Tous les systèmes opérationnels