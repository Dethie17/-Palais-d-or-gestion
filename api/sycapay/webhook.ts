/**
 * POST /api/sycapay/webhook
 *
 * Unique autorité sur l'issue d'un paiement. C'est ce endpoint, et lui seul,
 * qui active un abonnement, credite des repas ou crédite une carte prépayée.
 *
 * Ce qu'il ne faut pas en faire :
 *   - déduire la réussite de l'URL d'arrivée (url_success) — un client peut
 *     y atterrir sans que l'argent ait bougé ;
 *   - rejouer un traitement sur une notification déjà reçue — une même
 *     notification peut être livrée plusieurs fois.
 *
 * Le règlement est fait par SQL (oresto_settle_payment / oresto_settle_topup) :
 * atomique, et idempotent via la table sycapay_events.
 *
 * Réponse : 200 pour tout événement compris — y compris un doublon ou une
 * référence inconnue. Un 4xx/5xx ferait rejouer la notification par SycaPay,
 * alors que la plupart de nos refus sont définitifs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { header, type WebhookEvent, type WebhookEventV1 } from '../_lib/sycapay.js';
import { readJson, readRawBody, sendJson, methodNotAllowed, handlePreflight } from '../_lib/http.js';
import { signatureHeaderName, verifySignature } from '../_lib/webhookHmac.js';
import { isPaymentEvent, readWebhookV1, readWebhookV2, settle, type SettleOutcome } from '../_lib/settle.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  // La signature porte sur les octets exacts reçus : on lit le corps brut,
  // on le vérifie, puis on le décode. Jamais l'inverse.
  const raw = await readRawBody(req);
  const provided = header(req.headers, signatureHeaderName());
  const verdict = verifySignature(raw, provided);
  if (!verdict.ok) {
    // 401 fait rejouer la notification par SycaPay. Une signature invalide
    // n'est pas un incident transitoire : on refuse franchement, et la
    // notification suivante — ou le rattrapage statusV2 — prendra le relais.
    return sendJson(res, 401, { ok: false, error: `Webhook refusé : ${verdict.reason}` });
  }

  let payload: WebhookEvent | WebhookEventV1;
  try {
    payload = JSON.parse(raw) as WebhookEvent | WebhookEventV1;
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Corps JSON illisible.' });
  }

  // v2 porte une enveloppe d'événement ; v1 (déprécié) est plates.
  const v2 = readWebhookV2(payload as WebhookEvent);
  const v1 = v2 ? null : readWebhookV1(payload as WebhookEventV1);

  if (!v2 && !v1) {
    return sendJson(res, 200, { ok: true, ignored: true, reason: 'aucune référence exploitable dans la notification' });
  }

  const reference = v2 ? v2.reference : (v1 as NonNullable<typeof v1>).reference;
  const tx = v2?.tx;
  const eventType = v2?.eventType ?? null;
  const eventId = typeof (payload as WebhookEvent).eventId === 'string' ? (payload as WebhookEvent).eventId! : null;

  // Un dépôt (CASHIN) crédite un bénéficiaire chez nous — hors périmètre de
  // cet écran de caisse, qui n'encaisse que des paiements (_PM_).
  if (!isPaymentEvent(eventType ?? undefined, tx?.codeService)) {
    return sendJson(res, 200, { ok: true, ignored: true, reason: 'événement hors périmètre (dépôt)', reference });
  }

  const tag = tx?.tag ?? v1?.tag ?? null;
  // Pas de tag : la transaction n'est pas finalisée. PENDING reste PENDING.
  const statut = tx?.statut;
  const finalized = statut ? statut.toUpperCase() === 'FINISHED' : Boolean(tag);

  if (!finalized && !tag) {
    return sendJson(res, 200, { ok: true, ignored: true, reason: 'transaction non finalisée', reference });
  }

  try {
    const outcome: SettleOutcome = await settle({
      reference,
      tag,
      providerTx: tx?.tokenTX ?? null,
      // v1 ne connaît pas le bloc erreur : reasonForFailure en tient lieu.
      errorCode: tx?.erreur?.code ?? (v1?.reason ? 'legacy' : null),
      errorMessage: tx?.erreur?.message ?? v1?.reason ?? null,
      eventId,
      finalized,
      eventType,
    });
    return sendJson(res, 200, { ok: true, ...outcome, reference, signature: verdict.reason ?? 'verified' });
  } catch (err) {
    // Ici, 500 est justifié : le règlement n'a pas eu lieu, on veut le rejeu.
    console.error('[sycapay/webhook] règlement impossible :', (err as Error).message);
    return sendJson(res, 500, { ok: false, error: 'Règlement impossible, notification rejouée.', reference });
  }
}
