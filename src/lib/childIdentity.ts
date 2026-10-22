/**
 * IDENTITÉ ENFANT — une clé naturelle, stable, anti-doublon.
 *
 * Un enfant est identifié par : parent + prénom + nom + classe.
 *
 * Pourquoi pas l'identifiant technique (`children.id`) : l'import réjoué,
 * le double-clic et la saisie manuelle créent des LIGNES différentes pour le
 * MÊME enfant. Sans clé naturelle, chaque réimport lui refile une nouvelle
 * ligne et un nouveau QR — d'où les doublons d'enfants et de QR Cartes
 * que le personnel voyait apparaître.
 *
 * La clé est normalisée (accents, casse, espaces) : « Amadou  DIOP » et
 * «amadou diop» désignent le même enfant, pas deux.
 */

/** Normalise pour comparaison : sans accents, minuscules, espaces réduits. */
export function normIdentity(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .trim();
}

/**
 * Clé naturelle d'un enfant.
 * @param parentUsername identifiant du parent (le numéro)
 */
export function childNaturalKey(
  parentUsername: string,
  firstName: string,
  lastName: string,
  className: string,
): string {
  return [
    normIdentity(parentUsername),
    normIdentity(firstName),
    normIdentity(lastName),
    normIdentity(className),
  ].join('|');
}

/** Nom lisible d'un enfant (prénom puis nom). */
export function childDisplayName(child: { firstName: string; lastName: string }): string {
  return `${child.firstName} ${child.lastName}`.trim();
}

export interface ChildLike {
  id: string;
  parentUsername: string;
  firstName: string;
  lastName: string;
  className: string;
  qrToken: string;
  createdAt?: string;
}

export interface DedupeResult<T> {
  /** Enfants uniques, à l'ordre d'origine. */
  kept: T[];
  /** Enfants écartés (doublons). */
  duplicates: T[];
}

/**
 * Déduplique une liste d'enfants : pour une même clé naturelle, on ne garde
 * QUE le plus ancien (le premier inscrit), car c'est lui qui porte les
 * écritures comptables (abonnement, carte, validations).
 *
 * On garde le plus ancien PAR ORDRE DE CRÉATION, pas le premier de la liste :
 * une liste rechargée depuis la base est triée par date décroissante, et
 * garder le premier de la liste garderait le doublon le plus récent — celui
 * qui n'a pas d'historique. Les enregistrements sans date sont traités
 * comme les plus anciens.
 */
export function dedupeChildren<T extends ChildLike>(children: T[]): DedupeResult<T> {
  const byKey = new Map<string, T>();
  const duplicates: T[] = [];

  const age = (c: T) => {
    const t = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };

  for (const child of children) {
    const key = childNaturalKey(child.parentUsername, child.firstName, child.lastName, child.className);
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, child);
      continue;
    }
    // On garde le plus ancien ; l'autre est un doublon.
    if (age(child) < age(kept)) {
      byKey.set(key, child);
      duplicates.push(kept);
    } else {
      duplicates.push(child);
    }
  }

  return { kept: [...byKey.values()], duplicates };
}
