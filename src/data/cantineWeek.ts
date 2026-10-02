import type { WeekDay, WeeklyMenu } from '@/types/menu';

/**
 * Semaine cantine de référence (vitrine parent Lun → Ven).
 * Prix UNIQUE par jour + plats sans prix unitaires :
 * - Lundi « Menu Élève » : 900 FCFA (Mini Fataya, Chandwitch Poulet, Jus Naturel)
 * - Mardi « Menu Gourmand » : 2200 FCFA (Tacos, Boisson Gazeuse, Cake)
 * - Mercredi « Menu Petit Budget » : 400 FCFA (Mini Pizza, Eau, Mini Cake)
 * - Jeudi « Menu Goûter » : 600 FCFA (Crêpe Sucrée, Lakh)
 * - Vendredi « Menu Burger » : 1200 FCFA (Burger)
 *
 * Le Personnel garde la main : Gestion Menu permet de modifier les plats
 * et le prix unique de chaque jour, puis de publier (local + Supabase).
 * La base distante, quand elle contient une semaine publiée, prend le dessus.
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

const WEEK: Array<{ day: WeekDay; name: string; description: string; price: number; items: Array<{ name: string }> }> = [
  {
    day: 'Lundi',
    name: 'Menu Élève',
    description: 'Léger et équilibré pour bien démarrer la semaine',
    price: 900,
    items: [{ name: 'Mini Fataya' }, { name: 'Chandwitch Poulet' }, { name: 'Jus Naturel' }],
  },
  {
    day: 'Mardi',
    name: 'Menu Gourmand',
    description: 'Le généreux : tacos complet + dessert',
    price: 2200,
    items: [{ name: 'Tacos' }, { name: 'Boisson Gazeuse' }, { name: 'Cake' }],
  },
  {
    day: 'Mercredi',
    name: 'Menu Petit Budget',
    description: 'Le malin : complet à moins de 500 FCFA',
    price: 400,
    items: [{ name: 'Mini Pizza' }, { name: 'Eau' }, { name: 'Mini Cake' }],
  },
  {
    day: 'Jeudi',
    name: 'Menu Goûter',
    description: 'Douceur sucrée de l’après-midi',
    price: 600,
    items: [{ name: 'Crêpe Sucrée' }, { name: 'Lakh' }],
  },
  {
    day: 'Vendredi',
    name: 'Menu Burger',
    description: 'On finit la semaine en beauté',
    price: 1200,
    items: [{ name: 'Burger' }],
  },
];

/** Copie fraîche de la semaine de référence (jamais de mutation partagée). */
export function referenceWeek(): WeeklyMenu[] {
  return WEEK.map((m) => ({
    day: m.day,
    name: m.name,
    description: m.description,
    price: m.price,
    items: m.items.map((it) => ({ name: it.name, price: 0 })),
  }));
}
