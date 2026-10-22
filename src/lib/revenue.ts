import type { Formula, KioskOrder, Order, Subscription, WalletTx } from '@/types/menu';
import { isAboPayment } from './ismFinance';
import { isCountedPayment, paymentDate, type AccountablePayment } from './validatedPayments';

/**
 * Chiffre d'affaires de O RESTO : uniquement ce qui a été VENDU et les
 * ABONNEMENTS VALIDÉS.
 *
 * Le DAF ne veut pas d'un total gonflé par les recharges de carte : recharger
 * une carte n'est pas une vente, c'est de l'argent déjà encaissé qu'on remet
 * sur un support. Les ventes sont :
 *  - la caisse (commandes terminées) ;
 *  - le kiosque (commandes payées par carte, servies ou en attente) ;
 *  - les tickets repas payés (hors abonnements) ;
 *  - les repas débités directement sur la carte au service (référence DEB-).
 *
 * Un paiement d'abonnement n'est compté que s'il est payé et que sa formule
 * n'est PAS un ticket : les tickets ont leur propre ligne, jamais les deux.
 */

type Stamp = Date | string | number;

export interface RevenueEvent {
  at: number;
  amount: number;
  kind: 'sale' | 'subscription';
}

export interface RevenueSource {
  payments: AccountablePayment[];
  orders: Pick<Order, 'status' | 'total' | 'createdAt'>[];
  kioskOrders?: Pick<KioskOrder, 'status' | 'total' | 'createdAt'>[];
  walletTxs?: Pick<WalletTx, 'kind' | 'status' | 'amount' | 'reference' | 'createdAt'>[];
  subscriptions: Subscription[];
  formulas: Formula[];
}

export interface RevenueBreakdown {
  /** Abonnements validés (payés, hors tickets). */
  subscriptions: number;
  subscriptionCount: number;
  /** Ventes détaillées. */
  salesCaisse: number;
  salesKiosk: number;
  salesTickets: number;
  salesMeals: number;
  sales: number;
  /** Abonnements + ventes : le seul chiffre d'affaires retenu. */
  total: number;
  /** Événements datés, pour les courbes et les périodes. */
  events: RevenueEvent[];
  /** Ventes hors caisse (kiosque, tickets, repas carte), pour les courbes. */
  extraSalesEvents: RevenueEvent[];
}

function at(value: Stamp): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Une vente au service sur la carte est tracée par une référence DEB-. */
export function isDirectMealSale(tx: Pick<WalletTx, 'kind' | 'status' | 'reference'>): boolean {
  return tx.kind === 'debit' && tx.status === 'paid' && (tx.reference ?? '').startsWith('DEB-');
}

export function revenueBreakdown(source: RevenueSource, sinceMs = 0): RevenueBreakdown {
  // CA = ventes réelles (caisse, kiosque, tickets, repas carte) + abonnements validés.
  // Jamais les recharges de carte : ce n'est pas une vente.
  const inPeriod = (value: Stamp) => at(value) >= sinceMs;

  // Seuls les paiements VALIDÉS comptent (statut payé + règlement horodaté).
  const paid = source.payments.filter(
    (p) => isCountedPayment(p, source.payments) && inPeriod(paymentDate(p)) && p.amount > 0,
  );
  const abos = paid.filter((p) => isAboPayment(p, source.subscriptions, source.formulas));
  const tickets = paid.filter((p) => !isAboPayment(p, source.subscriptions, source.formulas));

  const caisse = (source.orders ?? []).filter((o) => o.status === 'completed' && inPeriod(o.createdAt) && o.total > 0);
  const kiosk = (source.kioskOrders ?? []).filter(
    (o) => o.status !== 'cancelled' && inPeriod(o.createdAt) && o.total > 0,
  );
  const meals = (source.walletTxs ?? []).filter((t) => isDirectMealSale(t) && inPeriod(t.createdAt) && t.amount > 0);

  const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
  const salesCaisse = sum(caisse, (o) => o.total);
  const salesKiosk = sum(kiosk, (o) => o.total);
  const salesTickets = sum(tickets, (p) => p.amount);
  const salesMeals = sum(meals, (t) => t.amount);
  const subscriptions = sum(abos, (p) => p.amount);

  const extraSalesEvents: RevenueEvent[] = [
    ...kiosk.map((o) => ({ at: at(o.createdAt), amount: o.total, kind: 'sale' as const })),
    ...tickets.map((p) => ({ at: paymentDate(p), amount: p.amount, kind: 'sale' as const })),
    ...meals.map((t) => ({ at: at(t.createdAt), amount: t.amount, kind: 'sale' as const })),
  ];
  const events: RevenueEvent[] = [
    ...abos.map((p) => ({ at: paymentDate(p), amount: p.amount, kind: 'subscription' as const })),
    ...caisse.map((o) => ({ at: at(o.createdAt), amount: o.total, kind: 'sale' as const })),
    ...extraSalesEvents,
  ];

  return {
    subscriptions,
    subscriptionCount: abos.length,
    salesCaisse,
    salesKiosk,
    salesTickets,
    salesMeals,
    sales: salesCaisse + salesKiosk + salesTickets + salesMeals,
    total: subscriptions + salesCaisse + salesKiosk + salesTickets + salesMeals,
    events,
    extraSalesEvents,
  };
}
