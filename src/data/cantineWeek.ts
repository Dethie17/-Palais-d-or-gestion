import type { WeekDay, WeeklyMenu } from '@/types/menu';
import { menuMonthDays } from '@/lib/menuDates';

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

const WINGS_PHOTO = 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600&h=400&fit=crop';

const DISH_PHOTOS: Array<{ pattern: RegExp; photo: string }> = [
  { pattern: /wings?|chicken/, photo: WINGS_PHOTO },
  { pattern: /tacos?/, photo: DAY_PHOTOS.Mardi },
  { pattern: /pizza/, photo: DAY_PHOTOS.Mercredi },
  { pattern: /crepe|gaufre/, photo: DAY_PHOTOS.Jeudi },
  { pattern: /burger/, photo: DAY_PHOTOS.Vendredi },
  { pattern: /fataya|samossa|samoussa/, photo: DAY_PHOTOS.Lundi },
  { pattern: /thi[eé]b|riz au poisson|riz poisson/, photo: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=400&fit=crop' },
  { pattern: /yassa/, photo: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&h=400&fit=crop' },
  { pattern: /mafe|mafé/, photo: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&h=400&fit=crop' },
  { pattern: /poulet|poulets/, photo: WINGS_PHOTO },
  { pattern: /riz|spaghetti|pâtes|nouilles/, photo: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&h=400&fit=crop' },
];

const normaliser = (texte: string): string =>
  texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function menuPhoto(
  menu: Pick<WeeklyMenu, 'day' | 'description' | 'items' | 'dessert'> & { image?: string },
): string {
  if (menu.image?.trim()) return menu.image.trim();
  const texte = normaliser([
    menu.description,
    menu.dessert,
    ...(menu.items ?? []).map((item) => item.name),
  ].filter(Boolean).join(' '));
  const known = DISH_PHOTOS.find(({ pattern }) => pattern.test(texte))?.photo ?? dayPhoto(menu.day);
  if (known) return known;
  return 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=400&fit=crop';
}

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

/** Menu mensuel vide du 2 au 30 novembre 2026 : seule la cantine publie son contenu. */
export function referenceMonth(): WeeklyMenu[] {
  return menuMonthDays(2026, 10, 2).map((day) => ({
    day,
    name: '',
    description: '',
    dessert: '',
    price: 0,
    items: [],
  }));
}
