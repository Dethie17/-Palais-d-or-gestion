import type { Formula, SchoolCycle } from '@/types/menu';
import { FORMULA_CYCLES } from './schoolCycles';

/**
 * Tarifs officiels de l'abonnement mensuel (flyer 2026) — source de vérité.
 * F2 : préscolaire/élémentaire → 27 000 FCFA · F3 : collège/lycée → 32 000 FCFA.
 * Le montant payé est TOUJOURS ancré ici : une formule personnalisée ou une
 * ancienne donnée en base ne peut pas faire fuiter un autre tarif.
 */
export const ABO_OFFICIAL: Record<string, { name: string; price: number }> = {
  F2: { name: 'Abonnement Mensuel — Préscolaire & Élémentaire', price: 27000 },
  F3: { name: 'Abonnement Mensuel — Collège & Lycée', price: 32000 },
};

/** Les deux seules formules d'abonnement proposées aux parents. */
export const ABO_IDS = ['F2', 'F3'] as const;
export type AboId = (typeof ABO_IDS)[number];

/** Formule officielle d'un cycle : F2 (maternelle/primaire) ou F3 (collège/lycée). */
export function officialAboForCycle(cycle: SchoolCycle): AboId | undefined {
  if (FORMULA_CYCLES.F2.includes(cycle)) return 'F2';
  if (FORMULA_CYCLES.F3.includes(cycle)) return 'F3';
  return undefined;
}

/** Prix ancré du tarif officiel, avec repli sur la formule enregistrée. */
export function officialPrice(formulaId: string, formulas: Formula[] = []): number {
  const official = ABO_OFFICIAL[formulaId]?.price;
  if (official !== undefined) return official;
  return formulas.find((f) => f.id === formulaId)?.price ?? 0;
}
