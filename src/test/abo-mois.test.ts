import { describe, it, expect } from 'vitest';
import {
  cleMois, labelMois, debutDeMoisIso, moisSuivant, prochainsMois,
  abonnementCouvreMois, moisCouverts, selectionConsecutive, etatMoisPourAbonnements,
} from '@/lib/aboMois';
import type { Subscription } from '@/types/menu';

const sub = (start: string, end: string, status: Subscription['status'] = 'active'): Pick<Subscription, 'startDate' | 'endDate' | 'status'> => ({ startDate: start, endDate: end, status });
const subId = (id: string, start: string, end: string, status: Subscription['status'] = 'active'): Pick<Subscription, 'id' | 'startDate' | 'endDate' | 'status'> =>
  ({ id, startDate: start, endDate: end, status });

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

  it('liste novembre 2026 sans octobre pour les paiements', () => {
    const l = prochainsMois(3, new Date('2026-10-29T12:00:00Z'));
    expect(l).toHaveLength(3);
    expect(l[0].cle).toBe('2026-11');
    expect(l[1].cle).toBe('2026-12');
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

describe('aboMois — état par mois (payé / en attente / libre)', () => {
  const offerts = [
    { cle: '2026-10' as const, label: 'Octobre 2026' },
    { cle: '2026-11' as const, label: 'Novembre 2026' },
    { cle: '2026-12' as const, label: 'Décembre 2026' },
  ];

  it('un mois couvert par un abonnement réglé est « payé »', () => {
    const etats = etatMoisPourAbonnements(
      [subId('S-1', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')],
      new Set(['S-1']),
      offerts,
    );
    expect(etats[0].etat).toBe('paye');
    expect(etats[1].etat).toBe('libre');
    expect(etats[2].etat).toBe('libre');
  });

  it('un abonnement réglé couvre tous les mois de son intervalle (un paiement pour N mois)', () => {
    const etats = etatMoisPourAbonnements(
      [subId('S-N3', '2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z')],
      new Set(['S-N3']),
      offerts,
    );
    expect(etats.map((m) => m.etat)).toEqual(['paye', 'paye', 'paye']);
  });

  it('un mois couvert par une réservation non soldée est en attente, avec l’abonnement à libérer', () => {
    const etats = etatMoisPourAbonnements(
      [
        subId('S-OCT', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'),
        subId('S-DEC', '2026-12-01T00:00:00Z', '2027-01-01T00:00:00Z'),
      ],
      new Set(['S-OCT']),
      offerts,
    );
    expect(etats[0].etat).toBe('paye');
    expect(etats[1].etat).toBe('libre');
    expect(etats[2].etat).toBe('attente');
    expect(etats[2].attenteSubId).toBe('S-DEC');
  });

  it('annulé : le mois redevient libre', () => {
    const etats = etatMoisPourAbonnements(
      [subId('S-C', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', 'cancelled')],
      new Set<string>(),
      offerts,
    );
    expect(etats.map((m) => m.etat)).toEqual(['libre', 'libre', 'libre']);
  });
});
