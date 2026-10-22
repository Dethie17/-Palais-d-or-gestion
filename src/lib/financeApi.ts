/**
 * Client des routes de comptabilité « validée ».
 *
 * Deux besoins distincts :
 *
 *   1. POSER l'horodatage de règlement d'un encaissement (serveur seul
 *      habilité) : `settlePaymentOnServer`.
 *   2. LIRE le jeu de données qui fait foi en comptabilité
 *      (paiements validés) : `fetchValidatedFinance`.
 *
 * Aucune clé de service ici : le navigateur ne parle qu'à l'API, qui
 * vérifie la session et le rôle.
 */

import { supabase } from '@/lib/supabase';

export interface ValidatedPaymentRow {
  id: string;
  reference: string | null;
  amount: number | null;
  method: string | null;
  status: string | null;
  subscriptionId: string | null;
  clientUsername: string | null;
  formulaId: string | null;
  createdAt: string | null;
  paidAt: string | null;
  settledAt: string | null;
}

export interface ValidatedFinance {
  ok?: boolean;
  /** false = la base ne tient pas encore l'horodatage de règlement. */
  validated: boolean;
  source: string;
  /** true = la lecture a été plafonnée : la liste n'est pas exhaustive. */
  truncated?: boolean;
  payments: ValidatedPaymentRow[];
  kpis: Record<string, unknown> | null;
}

export interface SettleResult {
  ok: boolean;
  settledAt?: string;
  error?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  } catch {
    /* pas de session : la fonction répondra 401 */
  }
  return headers;
}

/**
 * Demande au serveur d'horodater le règlement d'un encaissement.
 *
 * Renvoie `ok: false` sans lever d'exception quand la route est injoignable
 * (déploiement sans API, hors ligne) : l'encaissement reste fait, mais il
 * n'est pas « validé » — et donc pas comptabilisé. C'est le comportement
 * voulu : mieux vaut un chiffre qui exclut un encaissement non confirmé
 * qu'un chiffre qui invente de l'argent encaissé.
 */
export async function settlePaymentOnServer(paymentId: string): Promise<SettleResult> {
  if (!paymentId) return { ok: false, error: 'Paiement inconnu.' };
  try {
    const response = await fetch('/api/finance/settle-payment', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ paymentId }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      payment?: { settledAt?: string | null };
    };
    if (!response.ok || payload.ok === false) {
      return { ok: false, error: payload.error ?? `Règlement refusé (${response.status}).` };
    }
    return { ok: true, settledAt: payload.payment?.settledAt ?? undefined };
  } catch {
    return { ok: false, error: 'Règlement serveur indisponible.' };
  }
}

/**
 * Lit les paiements validés.
 *
 * Renvoie null quand l'API est injoignable : l'appelant garde alors son
 * calcul local, qui n'est filtré que si la base tient l'horodatage.
 */
export async function fetchValidatedFinance(params?: { from?: string; to?: string }): Promise<ValidatedFinance | null> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  try {
    const response = await fetch(`/api/finance/validated${suffix}`, {
      method: 'GET',
      headers: await authHeaders(),
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as ValidatedFinance | null;
    if (!payload || payload.ok === false) return null;
    return payload;
  } catch {
    return null;
  }
}
