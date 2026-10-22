import { describe, it, expect } from 'vitest';
import { weeklyMenuTotal, menuTicketTotal, sanitizeMenuItem, MAX_ITEMS_PER_DAY, isWeekComplete, publishedDays, foldDayPriceIntoItems } from '@/lib/menus';

describe('composition des menus du jour (DG)', () => {
  it('total = somme des prix (négatifs ignorés)', () => {
    expect(weeklyMenuTotal([])).toBe(0);
    expect(
      weeklyMenuTotal([
        { name: 'Mini Fataya', price: 500 },
        { name: 'Jus Naturel', price: 500 },
      ]),
    ).toBe(1000);
    expect(weeklyMenuTotal([{ name: 'Offert', price: 0 }])).toBe(0);
    expect(weeklyMenuTotal([{ name: 'Erreur', price: -200 }])).toBe(0);
  });

  it('prix du ticket : prix unique du jour, sinon somme (compatibilité)', () => {
    expect(menuTicketTotal({ price: 900, items: [{ name: 'A', price: 0 }] })).toBe(900);
    expect(menuTicketTotal({ price: 0, items: [{ name: 'A', price: 500 }] })).toBe(500);
    expect(menuTicketTotal({ items: [] })).toBe(0);
  });

  it('valide un plat : nom requis, prix entier 0–100 000', () => {
    expect(sanitizeMenuItem('  Tacos  ', 1200)).toEqual({ name: 'Tacos', price: 1200 });
    expect(sanitizeMenuItem('Jus', 499.9)).toEqual({ name: 'Jus', price: 499 });
    expect(sanitizeMenuItem('   ', 500)).toBe(null);
    expect(sanitizeMenuItem('Tacos', -50)).toBe(null);
    expect(sanitizeMenuItem('Tacos', 200000)).toBe(null);
    expect(sanitizeMenuItem('Tacos', Number.NaN)).toBe(null);
  });

  it('plafond de plats par jour raisonnable', () => {
    expect(MAX_ITEMS_PER_DAY).toBe(8);
  });

  it('repli sans colonne price : le total du ticket reste juste', () => {
    const items = [
      { name: 'Tacos', price: 0 },
      { name: 'Jus', price: 0 },
    ];
    const folded = foldDayPriceIntoItems(items, 900);
    // Le prix du jour est reporté sur le premier plat, réparti sur les autres.
    expect(menuTicketTotal({ price: 0, items: folded })).toBe(900);
    // Sans plat : on ne fabrique rien.
    expect(foldDayPriceIntoItems([], 900)).toEqual([]);
    // Prix déjà sur les plats : on ne double pas le total.
    const priced = [
      { name: 'A', price: 400 },
      { name: 'B', price: 100 },
    ];
    expect(weeklyMenuTotal(foldDayPriceIntoItems(priced, 900))).toBe(900);
    expect(foldDayPriceIntoItems(items, 0)).toEqual(items);
  });


  it('semaine complète = 5 jours avec au moins un plat', () => {
    const full = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map((day) => ({
      day,
      items: [{ name: 'Plat', price: 1000 }],
    }));
    expect(isWeekComplete(full)).toBe(true);
    expect(isWeekComplete(full.slice(0, 4))).toBe(false);
    expect(isWeekComplete(full.map((m) => (m.day === 'Mardi' ? { ...m, items: [] } : m)))).toBe(false);
    expect(isWeekComplete([])).toBe(false);
  });

  it('jours publiés = ceux avec au moins un plat', () => {
    const menus = [
      { day: 'Lundi', items: [{ name: 'A', price: 500 }] },
      { day: 'Mardi', items: [] },
      { day: 'Mercredi', items: null as never },
    ];
    expect(publishedDays(menus).map((m) => m.day)).toEqual(['Lundi']);
    expect(publishedDays([])).toEqual([]);
  });
});
