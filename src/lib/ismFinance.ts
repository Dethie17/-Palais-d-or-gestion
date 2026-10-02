import type { FinanceSettings, Formula, ORestoPayment, Order, Subscription } from '@/types/menu';
import { FORMULA_CYCLE } from './schoolCycles';

/**
 * Comptabilité ISM 2026 (règle DG) :
 * - 2 000 FCFA fixes sur CHAQUE abonnement payé (lycée comme préscolaire-élémentaire) ;
 * - ismSalesPct % sur les ventes (caisse).
 * Solde mensuel à verser à l'ISM = part abos + part ventes.
 */

export function resolvePaymentFormulaId(p: ORestoPayment, subs: Subscription[]): string | undefined {
  return p.formulaId ?? subs.find((s) => s.id === p.subscriptionId)?.formulaId;
}

/** Un paiement compte comme abonnement (tout sauf ticket connu). */
export function isAboPayment(p: ORestoPayment, subs: Subscription[], formulas: Formula[]): boolean {
  const fid = resolvePaymentFormulaId(p, subs);
  const f = formulas.find((x) => x.id === fid);
  return f ? f.kind !== 'ticket' : true;
}

export interface IsmSplit {
  primaire: number;
  lycee: number;
  hebdo: number;
  autres: number;
}

export interface IsmPeriod {
  aboCount: number;
  split: IsmSplit;
  ismAbo: number;
  salesGross: number;
  ismSales: number;
  /** Solde à verser à l'ISM sur la période. */
  total: number;
}

export function ismPeriod(
  payments: ORestoPayment[],
  orders: Pick<Order, 'status' | 'total' | 'createdAt'>[],
  subscriptions: Subscription[],
  formulas: Formula[],
  settings: FinanceSettings,
  sinceMs: number,
): IsmPeriod {
  const paidAbo = payments.filter(
    (p) => p.status === 'paid' && new Date(p.createdAt).getTime() >= sinceMs && isAboPayment(p, subscriptions, formulas),
  );
  const split: IsmSplit = { primaire: 0, lycee: 0, hebdo: 0, autres: 0 };
  for (const p of paidAbo) {
    const fid = resolvePaymentFormulaId(p, subscriptions);
    if (fid === 'F1') split.hebdo += 1;
    else if (fid && FORMULA_CYCLE[fid] === 'lycee') split.lycee += 1;
    else if (fid && FORMULA_CYCLE[fid] === 'primaire') split.primaire += 1;
    else split.autres += 1;
  }
  const salesGross = orders
    .filter((o) => o.status === 'completed' && o.createdAt.getTime() >= sinceMs)
    .reduce((s, o) => s + o.total, 0);
  const ismAbo = paidAbo.length * settings.ismPerSubscription;
  const ismSales = Math.round((salesGross * settings.ismSalesPct) / 100);
  return { aboCount: paidAbo.length, split, ismAbo, salesGross, ismSales, total: ismAbo + ismSales };
}

export function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { month: 'short' });
}

export type ChartPeriod = 'realtime' | 'day' | 'week' | 'month';

export interface GlobalPoint {
  label: string;
  caisse: number;
  abonnements: number;
  total: number;
}

/**
 * Courbe Performance DG : caisse (commandes vendues) + abonnements
 * (paiements encaissés). Sans les abos, le graphique reste vide dans
 * une cantine scolaire — d'où l'impression qu'il « ne passe pas ».
 */
export function globalChartData(
  orders: { status: string; total: number; createdAt: Date }[],
  payments: ORestoPayment[],
  period: ChartPeriod,
): GlobalPoint[] {
  const now = new Date();
  const buckets: { label: string; start: number; end: number }[] = [];
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  if (period === 'realtime') {
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now);
      end.setHours(now.getHours() - i);
      end.setMinutes(59, 59, 999);
      const start = new Date(end);
      start.setMinutes(0, 0, 0);
      buckets.push({ label: `${start.getHours()}h`, start: start.getTime(), end: end.getTime() });
    }
  } else if (period === 'day') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
      buckets.push({ label: days[d.getDay()], start, end });
    }
  } else {
    const count = period === 'week' ? 4 : 5;
    for (let i = count - 1; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(now.getDate() - i * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      buckets.push({ label: `S${count - i}`, start: start.getTime(), end: end.getTime() });
    }
  }

  const doneOrders = orders.filter((o) => o.status === 'completed');
  const paid = payments.filter((p) => p.status === 'paid');
  return buckets.map((b) => {
    const caisse = doneOrders
      .filter((o) => o.createdAt.getTime() >= b.start && o.createdAt.getTime() <= b.end)
      .reduce((s, o) => s + o.total, 0);
    const abonnements = paid
      .filter((p) => {
        const t = new Date(p.createdAt).getTime();
        return t >= b.start && t <= b.end;
      })
      .reduce((s, p) => s + p.amount, 0);
    return { label: b.label, caisse, abonnements, total: caisse + abonnements };
  });
}

export interface IsmMonth extends IsmPeriod {
  key: string;
  label: string;
}

/** Solde ISM des n derniers mois (mois courant inclus, ordre chronologique). */export function ismLastMonths(
  payments: ORestoPayment[],
  orders: Pick<Order, 'status' | 'total' | 'createdAt'>[],
  subscriptions: Subscription[],
  formulas: Formula[],
  settings: FinanceSettings,
  n = 6,
): IsmMonth[] {
  const now = new Date();
  const out: IsmMonth[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: monthLabel(start), ...ismPeriod(payments, orders, subscriptions, formulas, settings, start.getTime()) });
  }
  return out;
}
