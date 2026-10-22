import { describe, it, expect } from 'vitest';
import {
  cleMois, labelMois, debutDeMoisIso, moisSuivant, prochainsMois,
  abonnementCouvreMois, moisCouverts, selectionConsecutive,
} from '@/lib/aboMois';
import type { Subscription } from '@/types/menu';

const sub = (start: string, end: string, status: Subscription['status'] = 'active'): Pick<Subscription, 'startDate' | 'endDate' | 'status'> => ({ startDate: start, endDate: end, status });

describe('aboMois — clés et libellés', () => {
  it('clé du mois et libellé', () => {
    expect(cleMois('2026-10-05T18:30:00Z')).toBe('2026-10');
    expect(labelMois('2026-10')).toBe('Octobre 2026');
    expect(labelMois(null)).toBe('—');
  });

  it('début de mois ISO et mois suivant', () => {
    expect(debutDeMoisIso('2026-10')).toBe('2026-10-01T00:00:00Z');
    expect(moisSuivant('2026-10', 2)).toBe('2026-12');
    expect(moisSuivant('2026-12', 1)).toBe('2027-01');
  });

  it('liste des N prochains mois (mois courant inclus)', () => {
    const l = prochainsMois(3);
    expect(l).toHaveLength(3);
    expect(l[0].cle).toBe(cleMois(new Date()));
    expect(l[1].cle).toBe(moisSuivant(l[0].cle, 1));
  });
});

describe('aboMois — couverture des mois (règle : un mois payé une fois)', () => {
  it('abonnement mensuel classique (début en cours de mois)', () => {
    const s = sub('2026-10-12T09:00:00Z', '2026-10-31T23:59:59Z');
    expect(abonnementCouvreMois(s, '2026-10')).toBe(true);
    expect(abonnementCouvreMois(s, '2026-11')).toBe(false);
  });

  it('abonnement étendu multi-mois (Octobre → 1er Décembre en borne end)', () => {
    const s = sub('2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z');
    expect(abonnementCouvreMois(s, '2026-10')).toBe(true);
    expect(abonnementCouvreMois(s, '2026-11')).toBe(true);
    expect(abonnementCouvreMois(s, '2026-12')).toBe(false);
  });

  it('deux abonnements consécutifs se rejoignent au 1er : aucun mois double', () => {
    const oct = sub('2026-10-07T00:00:00Z', '2026-10-31T23:59:59Z');
    const nov = sub('2026-11-01T00:00:00Z', '2026-11-30T23:59:59Z');
    const couverts = moisCouverts([oct, nov]);
    expect([...couverts]).toEqual(['2026-10', '2026-11']);
  });

  it('annulé : ne couvre plus rien', () => {
    const s = sub('2026-10-05T00:00:00Z', '2026-10-20T00:00:00Z', 'cancelled');
    expect(moisCouverts([s]).size).toBe(0);
  });

  it('sélection consécutive obligatoire', () => {
    expect(selectionConsecutive(['2026-10'])).toBe(true);
    expect(selectionConsecutive(['2026-10', '2026-11'])).toBe(true);
    expect(selectionConsecutive(['2026-10', '2026-12'])).toBe(false);
    expect(selectionConsecutive(['2026-10', '2026-11', '2026-12'])).toBe(true);
  });
});
