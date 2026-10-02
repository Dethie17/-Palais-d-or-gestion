import type { WeekDay, WeeklyMenu } from '@/types/menu';

/**
 * Semaine cantine de référence (vitrine parent Lun → Ven).
 * Contenus EXACTS validés (noms, composants, prix, totaux) :
 * - Lundi « Menu Élève » : 100 + 500 + 300 = 900 FCFA
 * - Mardi « Menu Gourmand » : 1500 + 400 + 300 = 2200 FCFA
 * - Mercredi « Menu Petit Budget » : 200 + 150 + 50 = 400 FCFA
 * - Jeudi « Menu Goûter » : 300 + 300 = 600 FCFA
 * - Vendredi « Menu Burger » : 1200 FCFA
 *
 * Le Personnel garde la main : Gestion Menu permet de modifier les composants
 * et les prix puis de publier la semaine (local + Supabase). La base distante,
 * quand elle contient une semaine publiée, prend toujours le dessus.
 */

export const DAY_PHOTOS: Record<WeekDay, string> = {
  Lundi: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=400&fit=crop',
  Mardi: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=400&fit=crop',
  Mercredi: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=400&fit=crop',
  Jeudi: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&h=400&fit=crop',
  Vendredi: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop',
};

export const dayPhoto = (day: string): string | undefined =>
  (DAY_PHOTOS as Record<string, string>)[day];

const WEEK: Array<{ day: WeekDay; name: string; description: string; items: Array<{ name: string; price: number }> }> = [
  {
    day: 'Lundi',
    name: 'Menu Élève',
    description: 'Léger et équilibré pour bien démarrer la semaine',
    items: [
      { name: 'Mini Fataya', price: 100 },
      { name: 'Chandwitch Poulet', price: 500 },
      { name: 'Jus Naturel', price: 300 },
    ],
  },
  {
    day: 'Mardi',
    name: 'Menu Gourmand',
    description: 'Le généreux : tacos complet + dessert',
    items: [
      { name: 'Tacos', price: 1500 },
      { name: 'Boisson Gazeuse', price: 400 },
      { name: 'Cake', price: 300 },
    ],
  },
  {
    day: 'Mercredi',
    name: 'Menu Petit Budget',
    description: 'Le malin : complet à moins de 500 FCFA',
    items: [
      { name: 'Mini Pizza', price: 200 },
      { name: 'Eau', price: 150 },
      { name: 'Mini Cake', price: 50 },
    ],
  },
  {
    day: 'Jeudi',
    name: 'Menu Goûter',
    description: 'Douceur sucrée de l’après-midi',
    items: [
      { name: 'Crêpe Sucrée', price: 300 },
      { name: 'Lakh', price: 300 },
    ],
  },
  {
    day: 'Vendredi',
    name: 'Menu Burger',
    description: 'On finit la semaine en beauté',
    items: [{ name: 'Burger', price: 1200 }],
  },
];

/** Copie fraîche de la semaine de référence (jamais de mutation partagée). */
export function referenceWeek(): WeeklyMenu[] {
  return WEEK.map((m) => ({
    day: m.day,
    name: m.name,
    description: m.description,
    items: m.items.map((it) => ({ ...it })),
  }));
}
