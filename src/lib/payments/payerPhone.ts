/**
 * Numero du payeur, memorise sur cet appareil.
 *
 * SycaPay exige le numero du payeur a chaque initiation. Un parent qui
 * reprend un paiement commence plus tot (reprise depuis l'historique,
 * renouvellement) n'a plus ce numero sous la main : on le garde donc
 * localement, par reference de commande.
 *
 * Ce n'est pas un secret et rien n'est envoye ailleurs : la reference suffit
 * a le retrouver, et il reste dans ce navigateur.
 */

const KEY = 'o-resto-payer-phones-v1';

function read(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Retient le numero utilise pour une reference. */
export function rememberPayerPhone(reference: string, phone: string): void {
  try {
    const next = read();
    next[reference] = phone;
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Sans memoire, la reprise redemandera simplement le numero.
  }
}

/** Le numero deja utilise pour cette reference, s'il existe. */
export function recallPayerPhone(reference: string): string | undefined {
  return read()[reference];
}
