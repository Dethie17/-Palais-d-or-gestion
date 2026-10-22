import { useEffect, useState } from 'react';
import type { ORestoPayment } from '@/types/menu';
import { fetchValidatedFinance, type ValidatedFinance, type ValidatedPaymentRow } from './financeApi';
import type { AccountablePayment } from './validatedPayments';

/**
 * Comptabilité : le règlement fait foi côté BASE, pas dans le navigateur.
 *
 * Le poste de travail garde une copie locale des paiements (500 lignes au
 * plus) : elle est pratique pour l'affichage, mais elle ne peut pas prouver
 * qu'un encaissement a été réglé — le statut « payé » est modifiable depuis
 * un navigateur. La base, elle, porte l'horodatage de règlement posé par le
 * serveur (webhook SycaPay, encaissement au comptoir) et sait dire quels
 * paiements sont validés (`v_paiements_valides`).
 *
 * Ce module croise les deux :
 *   - un paiement listé par la base est réglé, et sa date de règlement fait
 *     foi pour le rattachement à une période ;
 *   - un paiement absent de la base n'est PAS réglé — sauf si la lecture a
 *     été plafonnée, auquel cas on ne conclut rien (mieux vaut un doute
 *     qu'un encaissement effacé d'un chiffre).
 *
 * Sans réponse du serveur (API absente, hors ligne, droits insuffisants),
 * on garde le comportement local : le filtre « validé » ne s'applique que
 * si la base tient déjà l'horodatage (voir `validatedPayments.ts`).
 */

export interface ValidatedFinanceState {
  data: ValidatedFinance | null;
  loading: boolean;
}

/** Charge l'état de règlement tenu par la base (une fois par écran). */
export function useValidatedFinance(): ValidatedFinanceState {
  const [data, setData] = useState<ValidatedFinance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchValidatedFinance().then((payload) => {
      if (cancelled) return;
      setData(payload);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}

/** Traduit une ligne de la base en paiement comptable. */
function toAccountable(row: ValidatedPaymentRow): AccountablePayment {
  const settledAt = row.settledAt ?? undefined;
  return {
    id: row.id,
    amount: row.amount ?? 0,
    status: row.status ?? 'paid',
    createdAt: row.createdAt ?? settledAt ?? row.paidAt ?? '',
    subscriptionId: row.subscriptionId ?? undefined,
    formulaId: row.formulaId ?? undefined,
    paidAt: row.paidAt ?? undefined,
    settledAt,
  };
}

/**
 * Liste des paiements à comptabiliser.
 *
 * - Base disponible (`validated: true`) : la base fait foi. Ses lignes
 *   sont comptées ; les paiements du poste qu'elle ne connaît pas sont
 *   marqués « non réglés » (ils sortent du chiffre) — sauf si la lecture a
 *   été plafonnée, auquel cas leur état local est conservé tel quel.
 * - Base indisponible ou migration pas appliquée : on garde les paiements
 *   du poste, filtrés par la règle locale (`validatedPayments.ts`).
 */
export function accountablePayments(
  local: ORestoPayment[],
  server: ValidatedFinance | null,
): AccountablePayment[] {
  if (!server || server.validated !== true) return local;

  const fromServer = server.payments.map(toAccountable);
  const known = new Set(fromServer.map((p) => p.id));
  const exhaustive = server.truncated !== true;

  const rest = local
    .filter((p) => !known.has(p.id))
    .map((p): AccountablePayment => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      subscriptionId: p.subscriptionId,
      formulaId: p.formulaId,
      paidAt: p.paidAt,
      // La base a répondu et ce paiement n'y est pas : il n'est pas réglé.
      settledAt: exhaustive ? null : p.settledAt,
    }));

  return [...fromServer, ...rest];
}
