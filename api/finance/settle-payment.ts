/**
 * POST /api/finance/settle-payment
 *
 * Horodate un encaissement au comptoir (espèces, carte, confirmation
 * manuelle du personnel).
 *
 * POURQUOI UNE ROUTE SERVEUR
 *
 * La colonne `oresto_payments.settled_at` est ce qui fait foi en
 * comptabilité : un paiement n'est un encaissement que s'il est payé ET
 * horodaté comme réglé (vue `v_paiements_valides`). Si le navigateur
 * pouvait écrire cette colonne, un parent pourrait s'attribuer un
 * encaissement : la comptabilité garderait une somme d'argent qui n'a
 * jamais été encaissée.
 *
 * Donc : le navigateur ne pose QUE le statut « payé » (l'action de la
 * caissière), et c'est le serveur — clé de service, après vérification du
 * rôle — qui pose l'horodatage de règlement.
 *
 * IDEMPOTENCE
 *
 * Un encaissement déjà soldé n'est jamais re-soldé : on renvoie l'état
 * existant (l'appel est sans danger, même en double-clic ou en cas de
 * reprise réseau). L'opération est atomique en base (SELECT ... FOR UPDATE
 * dans la fonction SQL).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, isMissingFunction } from '../_lib/supabaseAdmin.js';
import { requireRole, STAFF_OR_ADMIN } from '../_lib/session.js';
import { handlePreflight, methodNotAllowed, readJson, sendError, sendJson } from '../_lib/http.js';

interface SettleBody {
  paymentId?: unknown;
}

const MAX_ID_LENGTH = 100;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  // Seuls le personnel et la direction encaissent : un parent ne solde rien.
  const caller = await requireRole(req, res, STAFF_OR_ADMIN);
  if (!caller) return;

  let body: SettleBody;
  try {
    body = await readJson<SettleBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
  if (!paymentId || paymentId.length > MAX_ID_LENGTH) {
    return sendError(res, 400, 'Identifiant de paiement obligatoire.');
  }

  let db;
  try {
    db = adminClient();
  } catch (err) {
    return sendError(res, 503, (err as Error).message);
  }

  // Chemin nominal : la fonction SQL verrouille la ligne, pose les horodatages
  // et n'écrit rien si le paiement est déjà soldé.
  //
  // La ligne peut ne pas être encore visible : un encaissement au comptoir
  // vient d'être écrit par le navigateur, et l'écriture peut « arriver »
  // après l'appel. On réessaie quelques instants avant de conclure à
  // l'absence — sans quoi l'encaissement resterait jamais validé.
  let rpc = await db.rpc('settle_payment', { p_payment_id: paymentId });
  for (let attempt = 0; attempt < 3 && rpc.error?.code === 'P0002'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    rpc = await db.rpc('settle_payment', { p_payment_id: paymentId });
  }

  if (!rpc.error) {
    const row = (rpc.data ?? null) as Record<string, unknown> | null;
    if (!row) return sendError(res, 404, 'Paiement introuvable.');
    return sendJson(res, 200, {
      ok: true,
      settled: true,
      source: 'sql',
      payment: {
        id: String(row.id ?? paymentId),
        status: String(row.status ?? 'paid'),
        reference: row.reference ?? null,
        amount: row.amount ?? null,
        method: row.method ?? null,
        paidAt: row.paid_at ?? null,
        settledAt: row.settled_at ?? null,
      },
    });
  }

  if (rpc.error.code === 'P0002') return sendError(res, 404, 'Paiement introuvable.');

  if (!isMissingFunction(rpc.error)) {
    console.error('[finance/settle-payment] règlement refusé :', rpc.error.message);
    return sendError(res, 500, 'Le règlement de ce paiement a échoué.', { retryable: true });
  }

  // Repli : la fonction SQL n'est pas encore en base (migration non
  // appliquée). On écrit alors l'horodatage à la clé de service, avec la
  // même règle d'idempotence : on ne touche pas un paiement déjà soldé.
  const current = await db
    .from('oresto_payments')
    .select('id, status, reference, amount, method, paid_at, settled_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (current.error) {
    console.error('[finance/settle-payment] lecture impossible :', current.error.message);
    return sendError(res, 500, 'Le règlement de ce paiement a échoué.', { retryable: true });
  }
  if (!current.data) return sendError(res, 404, 'Paiement introuvable.');

  const row = current.data as Record<string, unknown>;
  if (row.status === 'paid' && row.settled_at) {
    return sendJson(res, 200, {
      ok: true,
      settled: true,
      source: 'fallback',
      payment: {
        id: String(row.id ?? paymentId),
        status: 'paid',
        reference: row.reference ?? null,
        amount: row.amount ?? null,
        method: row.method ?? null,
        paidAt: row.paid_at ?? null,
        settledAt: row.settled_at ?? null,
      },
    });
  }

  const now = new Date().toISOString();
  const update = await db
    .from('oresto_payments')
    .update({ status: 'paid', paid_at: row.paid_at ?? now, settled_at: now })
    .eq('id', paymentId);
  if (update.error) {
    console.error('[finance/settle-payment] écriture impossible :', update.error.message);
    return sendError(res, 500, 'Le règlement de ce paiement a échoué.', { retryable: true });
  }

  return sendJson(res, 200, {
    ok: true,
    settled: true,
    source: 'fallback',
    payment: {
      id: paymentId,
      status: 'paid',
      reference: row.reference ?? null,
      amount: row.amount ?? null,
      method: row.method ?? null,
      paidAt: row.paid_at ?? now,
      settledAt: now,
    },
  });
}
