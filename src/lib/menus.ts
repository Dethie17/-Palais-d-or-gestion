import { WEEK_DAYS, type WeeklyMenuItem } from '@/types/menu';

/** Nombre max de plats par menu du jour (cantine : entrée + plat + dessert + boisson…). */
export const MAX_ITEMS_PER_DAY = 8;

/** Total du menu : somme des prix, montants négatifs ignorés (robuste aux vieux stocks). */
export function weeklyMenuTotal(items: WeeklyMenuItem[] | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + Math.max(0, Math.floor(Number(it?.price) || 0)), 0);
}

/**
 * Semaine publiable : les 5 jours (Lun → Ven) ont au moins un plat.
 * Tant que ce n'est pas le cas, la section Menus reste vide (état pro).
 */
export function isWeekComplete(menus: { day: string; items: WeeklyMenuItem[] | null | undefined }[]): boolean {
  return WEEK_DAYS.every((d) => {
    const m = menus.find((x) => x.day === d);
    return !!m && Array.isArray(m.items) && m.items.length > 0;
  });
}

/** Jours composés (au moins un plat) — seuls ceux-là sont affichés aux parents. */
export function publishedDays<T extends { day: string; items: WeeklyMenuItem[] | null | undefined }>(menus: T[]): T[] {
  return menus.filter((m) => Array.isArray(m.items) && m.items.length > 0);
}

/** Normalise un plat saisi par le DG : nom requis, prix entier ≥ 0, sinon null. */
export function sanitizeMenuItem(name: string, price: number): WeeklyMenuItem | null {
  const clean = name.trim().slice(0, 60);
  const amount = Math.floor(Number(price));
  if (!clean || !Number.isFinite(amount) || amount < 0 || amount > 100000) return null;
  return { name: clean, price: amount };
}
