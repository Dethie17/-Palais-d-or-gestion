import type { Formula, SchoolCycle } from '@/types/menu';
import { FORMULA_CYCLES, pricePerMeal } from './schoolCycles';

/**
 * Règles métier des formules cantine (flyer 2026) — espace DG.
 * - Officielles F1/F2/F3/T1/C10 : tarifs du flyer, réappliqués au chargement
 *   (applyOfficialTariffs) → lecture seule côté DG, non supprimables.
 * - Personnalisées : CRUD libre, « Tous cycles » (aucun cycle imposé).
 */

/** Identifiants des formules officielles du flyer 2026 (lecture seule). */
export const OFFICIAL_FORMULA_IDS = ['F1', 'F2', 'F3', 'T1', 'C10'];

export function isOfficialFormula(id: string): boolean {
  return OFFICIAL_FORMULA_IDS.includes(id);
}

/**
 * Abonnement hebdomadaire (retiré du catalogue à la demande du patron) :
 * tout abonnement de 7 jours ou moins. F1 en est l'identifiant officiel.
 */
export function isHebdoFormula(
  f: Pick<Formula, 'kind' | 'durationDays'> | undefined | null,
): boolean {
  return Boolean(f && f.kind === 'subscription' && f.durationDays <= 7);
}

/** Cycles couverts par une formule (vide = transverse / tous cycles). */
export function cyclesOfFormula(f: Pick<Formula, 'id'>): SchoolCycle[] {
  return FORMULA_CYCLES[f.id] ?? [];
}

/** Cycle imposé par la formule (mensuels), undefined = transverse / tous cycles. */
export function cycleOfFormula(f: Pick<Formula, 'id'>): SchoolCycle | undefined {
  return cyclesOfFormula(f)[0];
}

export const KIND_LABEL: Record<Formula['kind'], string> = {
  subscription: 'Abonnement cantine',
  ticket: 'Ticket repas',
};

export interface FormulaPayload {
  name: string;
  description: string;
  price: number;
  oldPrice?: number;
  durationDays: number;
  mealsIncluded: number;
  rules: string;
  kind: Formula['kind'];
}

/**
 * Validation adaptée cantine : prix > 0, durée ≥ 1 j, repas ≥ 1,
 * prix barré vide ou supérieur au prix (offre de rentrée).
 */
export function validateFormulaPayload(p: FormulaPayload): { ok: boolean; message: string } {
  if (!p.name.trim()) {
    return { ok: false, message: 'Nom de la formule requis (ex : Abonnement Mensuel — Lycée).' };
  }
  if (!(p.price > 0)) {
    return { ok: false, message: 'Prix en FCFA strictement positif requis.' };
  }
  if (!Number.isFinite(p.durationDays) || p.durationDays < 1) {
    return { ok: false, message: 'Durée en jours : 1 minimum (ex : 30 pour le mensuel cantine).' };
  }
  if (!Number.isFinite(p.mealsIncluded) || p.mealsIncluded < 1) {
    return { ok: false, message: 'Repas inclus : 1 minimum (ex : 20 pour le mensuel, 1 repas/jour les jours d’école).' };
  }
  if (p.oldPrice !== undefined && !(p.oldPrice > p.price)) {
    return { ok: false, message: 'Prix barré : laissez vide, ou un montant supérieur au prix (offre de rentrée).' };
  }
  return { ok: true, message: '' };
}

export { pricePerMeal };
