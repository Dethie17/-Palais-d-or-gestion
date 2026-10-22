import type { SchoolCycle } from '@/types/menu';
import { normIdentity } from '@/lib/childIdentity';

/**
 * RÉFÉRENTIEL DES CYCLES ET DES CLASSES — source de vérité unique.
 *
 * Utilisé par : inscription des enfants (espace abonné), import élèves,
 * catalogues de formules, galerie QR, badges de cycle.
 *
 * Pourquoi un référentiel centralisé : la classe determine le cycle, donc
 * la formule d'abonnement applicable et le badge affiché. Si chaque écran
 * garde sa propre liste, un élève passe d'un cycle à l'autre d'un écran à
 * l'autre — et l'abonnement facturé ne correspond plus à la classe.
 *
 * Les classes sont data-driven (un simple tableau) : ajouter une classe ou
 * un cycle se fait ici, en un point, et se répercute partout.
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
    id: 'maternelle',
    label: 'Maternelle',
    short: 'Maternelle',
    hint: 'Petites classes (3 → 5 ans) : repas adaptés, 1 repas le midi les jours d’école.',
    classes: [
      'Petite Section',
      'Moyenne Section',
      'Grande Section',
    ],
    formulaIds: ['F2'],
  },
  {
    id: 'primaire',
    label: 'Primaire',
    short: 'Primaire',
    hint: 'Cours d’Initiation (CIA → CID) jusqu’au CM2 : le gros des effectifs de la cantine.',
    classes: [
      'CIA',
      'CIB',
      'CIC',
      'CID',
      'CP',
      'CE1',
      'CE2',
      'CM1',
      'CM2',
    ],
    formulaIds: ['F2'],
  },
  {
    id: 'college',
    label: 'Collège',
    short: 'Collège',
    hint: '6ème → 3ème : second cycle de l’enseignement fundamental.',
    classes: [
      '6ème',
      '5ème',
      '4ème',
      '3ème',
    ],
    formulaIds: ['F3'],
  },
  {
    id: 'lycee',
    label: 'Lycée',
    short: 'Lycée',
    hint: 'Seconde → Terminale : formule costaud du second cycle.',
    classes: [
      'Seconde',
      'Première',
      'Terminale',
    ],
    formulaIds: ['F3'],
  },
];

export const CYCLE_LABEL: Record<SchoolCycle, string> = {
  maternelle: 'Maternelle',
  primaire: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
};

/**
 * Cycles couverts par chaque formule mensuelle officielle.
 * Une formule peut servir plusieurs cycles (F2 = maternelle + primaire,
 * F3 = collège + lycée) : c'est ce qui permet à l'ISM d'appliquer le
 * même tarif à un élève de maternelle et un élève de CM2.
 */
export const FORMULA_CYCLES: Record<string, SchoolCycle[]> = {
  F2: ['maternelle', 'primaire'],
  F3: ['college', 'lycee'],
};

/** Cycle principal d'une formule (le premier). Rétrocompatibilité. */
export const FORMULA_CYCLE: Record<string, SchoolCycle> = {
  F2: 'primaire',
  F3: 'lycee',
};

/** Vrai si la formule s'applique au cycle donné (ou si elle est transverse). */
export function formulaCoversCycle(formulaId: string, cycle: SchoolCycle): boolean {
  const cycles = FORMULA_CYCLES[formulaId];
  if (!cycles) return true;
  return cycles.includes(cycle);
}

/** Alias historiques : le cycle « primaire » absorbait la maternelle. */
const LEGACY_CYCLE_ALIAS: Record<string, SchoolCycle> = {
  maternelle: 'maternelle',
  preschool: 'maternelle',
  'prescolaire': 'maternelle',
  primaire: 'primaire',
  'elementaire': 'primaire',
  college: 'college',
  'collège': 'college',
  lycee: 'lycee',
  'lycée': 'lycee',
};

/** Cycle par identifiant brut, tolérant aux anciennes écritures. */
export function normalizeCycle(value: unknown): SchoolCycle | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return LEGACY_CYCLE_ALIAS[key] ?? null;
}

/** Toutes les classes, tous cycles confondus (ordre du référentiel). */
export function allClasses(): string[] {
  return CYCLES.flatMap((c) => c.classes);
}

/** Classes d'un cycle (liste vide si le cycle est inconnu). */
export function classesOfCycle(cycle: SchoolCycle | undefined): string[] {
  if (!cycle) return [];
  return CYCLES.find((c) => c.id === cycle)?.classes ?? [];
}

/** Vrai si la classe existe au référentiel (comparaison normalisée). */
export function isKnownClass(className: string): boolean {
  const key = normIdentity(className);
  if (!key) return false;
  return allClasses().some((c) => normIdentity(c) === key);
}

/**
 * Classe canonique d'un libellé libre (« ce2 » → « CE2 »).
 * Renvoie le libellé du référentiel si on le reconnaît, sinon la saisie.
 */
export function canonicalClassName(className: string): string {
  const key = normIdentity(className);
  if (!key) return '';
  const found = allClasses().find((c) => normIdentity(c) === key);
  return found ?? className.trim();
}

/**
 * Devine le cycle depuis un libellé de classe (migration des anciens
 * inscrits, et classes hors référentiel).
 */
export function inferCycleFromClass(className: string): SchoolCycle {
  const key = normIdentity(className);
  if (!key) return 'primaire';

  // Cas nominal : la classe figure au référentiel.
  for (const cycle of CYCLES) {
    if (cycle.classes.some((c) => normIdentity(c) === key)) return cycle.id;
  }

  // Cours d'Initiation : CIA → CID (et l'ancien « CI »).
  if (/^(ci|cia|cib|cic|cid)\b/.test(key)) return 'primaire';

  // Secondaire : 6ème → Terminale.
  if (/^(6|5|4|3)\s*(eme|ème|e\b)|seconde|premiere|1ere|terminale/.test(key)) return 'lycee';

  // Maternelle.
  if (/petite|moyenne|grande section/.test(key)) return 'maternelle';

  return 'primaire';
}

/** Cycle effectif d'une classe, avec repli explicite. */
export function cycleOfClass(className: string, fallback: SchoolCycle = 'primaire'): SchoolCycle {
  if (!className.trim()) return fallback;
  return inferCycleFromClass(className);
}

/** Prix moyen par repas, arrondi au franc. */
export function pricePerMeal(price: number, meals: number): number {
  return meals > 0 ? Math.round(price / meals) : price;
}
