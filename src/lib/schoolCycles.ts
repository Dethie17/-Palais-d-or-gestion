import type { SchoolCycle } from '@/types/menu';

/**
 * Référentiel unique des 2 cycles scolaires (cantine 2026).
 * Utilisé par : inscription enfants, abonnements client, vente comptoir.
 */
export interface CycleDef {
  id: SchoolCycle;
  label: string;
  short: string;
  hint: string;
  classes: string[];
  /** Formules d'abonnement mensuelles réservées à ce cycle. */
  formulaIds: string[];
}

export const CYCLES: CycleDef[] = [
  {
    id: 'primaire',
    label: 'Préscolaire & Élémentaire',
    short: 'Présco-Élémentaire',
    hint: 'Petites classes : repas adaptés, 1 repas le midi les jours d’école.',
    classes: [
      'Petite Section',
      'Moyenne Section',
      'Grande Section',
      'CI',
      'CP',
      'CE1',
      'CE2',
      'CM1',
      'CM2',
    ],
    formulaIds: ['F2'],
  },
  {
    id: 'lycee',
    label: 'Lycée',
    short: 'Lycée',
    hint: 'Grandes classes (6ème → Terminale) : formule costaud du second cycle.',
    classes: [
      '6ème',
      '5ème',
      '4ème',
      '3ème',
      'Seconde',
      'Première',
      'Terminale',
    ],
    formulaIds: ['F3'],
  },
];

export const CYCLE_LABEL: Record<SchoolCycle, string> = {
  primaire: 'Préscolaire & Élémentaire',
  lycee: 'Lycée',
};

/** Cycle imposé par formule mensuelle (F1 / tickets = transverses). */
export const FORMULA_CYCLE: Record<string, SchoolCycle> = {
  F2: 'primaire',
  F3: 'lycee',
};

/** Devine le cycle depuis un libellé de classe (migration des anciens inscrits). */
export function inferCycleFromClass(className: string): SchoolCycle {
  const c = (className ?? '').toLowerCase();
  if (/6[eè]me|5[eè]me|4[eè]me|3[eè]me|seconde|premi[eè]re|1[eè]re|terminale|coll[eè]ge|lyc[eé]e/.test(c)) {
    return 'lycee';
  }
  return 'primaire';
}

export function cycleOfClass(className: string, fallback: SchoolCycle = 'primaire'): SchoolCycle {
  if (!className.trim()) return fallback;
  return inferCycleFromClass(className);
}

/** Prix moyen par repas, arrondi au franc. */
export function pricePerMeal(price: number, meals: number): number {
  return meals > 0 ? Math.round(price / meals) : price;
}
