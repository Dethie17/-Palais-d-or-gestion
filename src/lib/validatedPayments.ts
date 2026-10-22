import type { ORestoPayment } from '@/types/menu';

/**
 * Paiements VALIDÉS : le seul chiffre qui fait foi en comptabilité.
 *
 * Un paiement n'est un encaissement que s'il est payé ET horodaté comme
 * réglé (colonne `settled_at` de `oresto_payments`, posée par le webhook
 * SycaPay ou par l'encaissement au comptoir). La vue
 * `v_paiements_valides` de la base applique exactement la même règle :
 *
 *     status = 'paid' AND settled_at IS NOT NULL
 *
 * Un simple `status = 'paid'` ne suffit pas : une ligne peut être marquée
 * payée par un client (le statut est modifiable côté navigateur) sans
 * qu'aucun argent n'ait été encaissé. C'est pour cela que la comptabilité
 * ne retient que les paiements validés.
 *
 * TRANSITION : tant que la migration SQL (supabase-parents-import.sql) n'est
 * pas appliquée, la colonne `settled_at` n'existe pas et aucun paiement
 * n'est horodaté. Le comptage « validé » ne s'applique alors pas, sinon le
 * chiffre d'affaires retomberait à zéro : `settlementIsSupported` permet de
 * distinguer les deux situations sans jamais masquer un encaissement réel.
 */

export interface SettlementAwarePayment {
  status: string;
  /**
   * Horodatage de règlement.
   *
   *   - une chaîne : le paiement est réglé (cette date fait foi) ;
   *   - `null` : la base a répond et ce paiement N'EST PAS réglé ;
   *   - `undefined` : inconnu (base sans la colonne, ou copie locale).
   */
  settledAt?: string | null;
  paidAt?: string | null;
}

/**
 * Un paiement tel que la comptabilité le consomme : le strict nécessaire
 * pour compter (montant, date, abonnement, formule) et son état de règlement.
 */
export interface AccountablePayment {
  id?: string;
  amount: number;
  status: string;
  createdAt: string;
  subscriptionId?: string | null;
  formulaId?: string | null;
  paidAt?: string | null;
  settledAt?: string | null;
}

/**
 * La base tient-elle la colonne de règlement (migration appliquée) ?
 *
 * Vrai dès qu'un paiement porte un horodatage, ou dès que la base a
 * répondu « non, pas réglé » (`settledAt: null`) : dans les deux cas, on
 * sait de quoi on parle et le repli « statut payé » ne doit pas s'appliquer.
 */
export function settlementIsSupported(payments: readonly SettlementAwarePayment[]): boolean {
  return payments.some(
    (p) => (typeof p.settledAt === 'string' && p.settledAt.length > 0) || p.settledAt === null,
  );
}

/** Le paiement est-il un encaissement validé ? */
export function isValidatedPayment(payment: SettlementAwarePayment): boolean {
  return payment.status === 'paid'
    && typeof payment.settledAt === 'string'
    && payment.settledAt.length > 0;
}

/**
 * Filtre de comptabilité.
 *
 * - Si la base tient l'horodatage de règlement : on ne garde que les
 *   paiements validés.
 * - Sinon (migration pas encore appliquée) : on retombe sur le statut
 *   « payé », pour ne pas faire disparaître un encaissement réel de la
 *   comptabilité. Le résultat est alors celui d'avant la migration.
 */
export function validatedPayments<T extends SettlementAwarePayment>(payments: readonly T[]): T[] {
  if (!settlementIsSupported(payments)) {
    return payments.filter((p) => p.status === 'paid');
  }
  return payments.filter(isValidatedPayment);
}

/** Date de référence d'un paiement : le règlement prime sur la création. */
export function paymentDate(payment: SettlementAwarePayment & { createdAt: string }): number {
  const stamp = payment.settledAt ?? payment.paidAt ?? payment.createdAt;
  const ms = new Date(stamp).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Un paiement de la liste est-il comptabilisé ? (même règle que le filtre) */
export function isCountedPayment(payment: SettlementAwarePayment, all: readonly SettlementAwarePayment[]): boolean {
  if (!settlementIsSupported(all)) return payment.status === 'paid';
  return isValidatedPayment(payment);
}

export type { ORestoPayment };
