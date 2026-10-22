/**
 * Abonnement par mois : sélection de plusieurs mois consécutifs à payer
 * en une seule opération (le « paiement en 2 fois » — l'année scolaire
 * peut être réglée tranche par tranche).
 *
 * Règles :
 * - UN même mois ne peut être couvert qu'UNE fois pour un enfant donné :
 *   les mois déjà couverts par un abonnement (payé OU demandé non réglé)
 *   sont marqués « Payé / En cours » et interdits ;
 * - le montant vient TOUJOURS de la formule du cycle de la classe de
 *   l'enfant (référentiel schoolCycles), jamais d'une entrée du parent ;
 * - les mois sélectionnés doivent être consécutifs : ils forment un
 *   seul abonnement (start = 1er du premier mois, end = 1er du mois
 *   suivant le dernier mois couvert) réglé par UN seul paiement.
 *   La base protège en plus par contrainte d'exclusion
 *   (supabase-o-resto-final-2026.sql §3) : deux abonnements du même
 *   enfant qui se chevauchent sont refusés par PostgreSQL.
 */
import type { Subscription } from '@/types/menu';

export type MoisCle = string; // 'yyyy-MM'

const MOIS_NOMS: string[] = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Clé du mois d'une date ISO (yyyy-MM, -1 si illisible). */
export function cleMois(iso: string | Date | null | undefined): MoisCle | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « Octobre 2026 » à partir de la clé ; — sinon. */
export function labelMois(yyyyMM: MoisCle | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMM ?? '');
  if (!m) return '—';
  return `${MOIS_NOMS[Number(m[2]) - 1] ?? '—'} ${m[1]}`;
}

/** ISO du 1er jour du mois (UTC) — Dakar = GMT. */
export function debutDeMoisIso(yyyyMM: MoisCle): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMM);
  if (!m) throw new Error('Mois invalide');
  return `${m[1]}-${m[2]}-01T00:00:00Z`;
}

/** Incrémente la clé de n mois (peut passer une année). */
export function moisSuivant(yyyyMM: MoisCle, n: number): MoisCle {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMM);
  if (!m) throw new Error('Mois invalide');
  const d = new Date(`${yyyyMM}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return cleMois(d) as MoisCle;
}

/** Liste des N mois suivants en partant du mois courant : {cle, label}. */
export function prochainsMois(n: number): { cle: MoisCle; label: string }[] {
  const out: { cle: MoisCle; label: string }[] = [];
  const base = cleMois(new Date()) as MoisCle;
  for (let i = 0; i < n; i += 1) {
    const cle = moisSuivant(base, i);
    out.push({ cle, label: labelMois(cle) });
  }
  return out;
}

/** Vrai si l'abonnement couvre le mois donné (chevauchement d'intervalle). */
export function abonnementCouvreMois(sub: Pick<Subscription, 'startDate' | 'endDate' | 'status'>, yyyyMM: MoisCle): boolean {
  if (sub.status === 'cancelled') return false;
  const debut = new Date(`${yyyyMM}-01T00:00:00Z`).getTime();
  const fin = new Date(debutDeMoisIso(moisSuivant(yyyyMM, 1))).getTime();
  const s = new Date(sub.startDate).getTime();
  const e = new Date(sub.endDate).getTime();
  if (![debut, fin, s, e].every(Number.isFinite)) return false;
  // Chevauchement strict : l'abonnement couvre le mois si son intervalle
  // intersecte le mois (les bornes pointent le 1er du mois, incluses).
  return s < fin && e > debut;
}

/** Ensemble des mois couverts par les abonnements de l'enfant. */
export function moisCouverts(subs: Pick<Subscription, 'startDate' | 'endDate' | 'status'>[]): Set<MoisCle> {
  const set = new Set<MoisCle>();
  subs.forEach((s) => {
    // Parcours des limites de mois couverts : du mois de début au mois de fin.
    const debut = cleMois(s.startDate);
    const fin = cleMois(s.endDate);
    if (!debut || !fin) return;
    let cur = debut;
    let garde = 0;
    while (garde < 24 && cur <= fin) {
      if (abonnementCouvreMois(s, cur)) set.add(cur);
      cur = moisSuivant(cur, 1);
      garde += 1;
    }
  });
  return set;
}

/** Les mois sélectionnés sont-ils consécutifs ? */
export function selectionConsecutive(mois: MoisCle[]): boolean {
  if (mois.length <= 1) return true;
  const tries = [...new Set(mois)].sort();
  for (let i = 1; i < tries.length; i += 1) {
    if (moisSuivant(tries[i - 1], 1) !== tries[i]) return false;
  }
  return true;
}
