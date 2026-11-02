import { WEEK_DAYS, type WeeklyMenuItem } from '@/types/menu';

/** Nombre max de plats par menu du jour (cantine : entrée + plat + dessert + boisson…). */
export const MAX_ITEMS_PER_DAY = 8;

/** Total du menu : somme des prix, montants négatifs ignorés (robuste aux vieux stocks). */
export function weeklyMenuTotal(items: WeeklyMenuItem[] | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + Math.max(0, Math.floor(Number(it?.price) || 0)), 0);
}

/**
 * Prix du ticket du jour : le prix UNIQUE saisi par le Personnel quand il est
 * défini (> 0), sinon la somme des prix (compatibilité anciens stocks).
 */
export function menuTicketTotal(menu: { price?: number; items: WeeklyMenuItem[] | null | undefined }): number {
  const solo = Math.floor(Number(menu?.price) || 0);
  if (solo > 0) return solo;
  return weeklyMenuTotal(menu?.items);
}

/**
 * Replie le prix UNIQUE du jour dans la liste des plats.
 *
 * Utilisé en repli quand la colonne `weekly_menus.price` n'existe pas encore
 * en base (installation non migrée) : plutôt que de perdre le prix, on le
 * porte sur le premier plat pour que `menuTicketTotal` (somme des prix) rende
 * le bon total. Invisible à l'écran (les plats s'affichent sans prix) et sans
 * double comptage une fois la colonne `price` présente (elle est prioritaire).
 */
export function foldDayPriceIntoItems(items: WeeklyMenuItem[], price: number): WeeklyMenuItem[] {
  const target = Math.max(0, Math.floor(Number(price) || 0));
  if (target <= 0 || !Array.isArray(items) || items.length === 0) return items;
  const rest = items.slice(1).reduce((s, it) => s + Math.max(0, Math.floor(Number(it?.price) || 0)), 0);
  return [{ ...items[0], price: Math.max(0, target - rest) }, ...items.slice(1)];
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

/**
 * Publication autorisée dès qu'au moins un jour est composé : une semaine
 * partielle (4 jours, jour férié, vendredi sans cantine…) reste publiable.
 */
export function isWeekPublishable(menus: { day: string; items: WeeklyMenuItem[] | null | undefined }[]): boolean {
  return publishedDays(menus).length > 0;
}

/** Normalise un plat saisi par le DG : nom requis, prix entier ≥ 0, sinon null. */
export function sanitizeMenuItem(name: string, price: number): WeeklyMenuItem | null {
  const clean = name.trim().slice(0, 60);
  const amount = Math.floor(Number(price));
  if (!clean || !Number.isFinite(amount) || amount < 0 || amount > 100000) return null;
  return { name: clean, price: amount };
}

/**
 * La table distante n'a pas de colonne `dessert` : on replie le dessert dans
 * `description` avec un marqueur interne, puis on le ressort à la lecture.
 * L'écran ne voit jamais le marqueur (description nettoyée + champ dessert).
 */
const DESSERT_MARKER = '\n[dessert]';

/** Empaquette description + dessert pour la colonne `description` distante. */
export function encodeMenuDescription(description: string, dessert?: string): string {
  const cleanDescription = (description ?? '').trim();
  const cleanDessert = (dessert ?? '').trim().slice(0, 60);
  if (!cleanDessert) return cleanDescription;
  return `${cleanDescription}${DESSERT_MARKER}${cleanDessert}`.slice(0, 500);
}

/** Dépaquette la colonne `description` distante en description + dessert. */
export function decodeMenuDescription(raw: string | null | undefined): { description: string; dessert: string } {
  const text = typeof raw === 'string' ? raw : '';
  const index = text.lastIndexOf(DESSERT_MARKER);
  if (index === -1) return { description: text.trim(), dessert: '' };
  return {
    description: text.slice(0, index).trim(),
    dessert: text.slice(index + DESSERT_MARKER.length).trim(),
  };
}
