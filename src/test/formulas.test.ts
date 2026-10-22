import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_FORMULA_IDS,
  isOfficialFormula,
  cycleOfFormula,
  cyclesOfFormula,
  validateFormulaPayload,
  pricePerMeal,
  KIND_LABEL,
  type FormulaPayload,
} from '@/lib/formulas';
import { formulaCoversCycle } from '@/lib/schoolCycles';

const base: FormulaPayload = {
  name: 'Abonnement Mensuel — Lycée',
  description: '1 repas le midi, jours d’école',
  price: 32000,
  oldPrice: 35000,
  durationDays: 30,
  mealsIncluded: 20,
  rules: '1 repas / jour, service du midi uniquement',
  kind: 'subscription',
};

describe('formules cantine (espace DG)', () => {
  it('officielles du flyer 2026 protégées, perso libres', () => {
    expect(OFFICIAL_FORMULA_IDS).toEqual(['F1', 'F2', 'F3', 'T1', 'C10']);
    for (const id of OFFICIAL_FORMULA_IDS) expect(isOfficialFormula(id)).toBe(true);
    expect(isOfficialFormula('F-perso')).toBe(false);
  });

  it('une formule peut couvrir plusieurs cycles (F2 : maternelle + primaire)', () => {
    expect(cyclesOfFormula({ id: 'F2' })).toEqual(['maternelle', 'primaire']);
    expect(cyclesOfFormula({ id: 'F3' })).toEqual(['college', 'lycee']);
    // Formule transverse : aucun cycle imposé.
    expect(cyclesOfFormula({ id: 'F1' })).toEqual([]);
    expect(cyclesOfFormula({ id: 'F-perso' })).toEqual([]);
    expect(cycleOfFormula({ id: 'F2' })).toBe('maternelle');
    expect(cycleOfFormula({ id: 'F3' })).toBe('college');
    expect(cycleOfFormula({ id: 'F1' })).toBe(undefined);
  });

  it('une formule ne s’applique qu’aux cycles qu’elle couvre', () => {
    expect(formulaCoversCycle('F2', 'maternelle')).toBe(true);
    expect(formulaCoversCycle('F2', 'primaire')).toBe(true);
    expect(formulaCoversCycle('F2', 'college')).toBe(false);
    expect(formulaCoversCycle('F3', 'lycee')).toBe(true);
    expect(formulaCoversCycle('F3', 'primaire')).toBe(false);
    // Transverse : valable partout.
    expect(formulaCoversCycle('F1', 'lycee')).toBe(true);
    expect(formulaCoversCycle('F-perso', 'primaire')).toBe(true);
  });

  it('validation cantine : nom, prix, durée, repas, prix barré', () => {
    expect(validateFormulaPayload(base)).toEqual({ ok: true, message: '' });
    expect(validateFormulaPayload({ ...base, name: '  ' }).ok).toBe(false);
    expect(validateFormulaPayload({ ...base, price: 0 }).ok).toBe(false);
    expect(validateFormulaPayload({ ...base, durationDays: 0 }).ok).toBe(false);
    expect(validateFormulaPayload({ ...base, mealsIncluded: 0 }).ok).toBe(false);
    expect(validateFormulaPayload({ ...base, oldPrice: 32000 }).ok).toBe(false);
    expect(validateFormulaPayload({ ...base, oldPrice: undefined }).ok).toBe(true);
  });

  it('prix par repas + libellés adaptés cantine', () => {
    expect(pricePerMeal(27000, 20)).toBe(1350);
    expect(pricePerMeal(32000, 20)).toBe(1600);
    expect(pricePerMeal(1900, 1)).toBe(1900);
    expect(KIND_LABEL.subscription).toBe('Abonnement cantine');
    expect(KIND_LABEL.ticket).toBe('Ticket repas');
  });
});
