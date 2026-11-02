/**
 * Liste des enfants inscrits — export demandé par le Superviseur depuis
 * « Abonnés & paiements » : nom, prénom et classe, triés pour être
 * directement exploitables (ordre des classes du référentiel, puis nom,
 * puis prénom).
 */
import { allClasses } from '@/lib/schoolCycles';
import { normIdentity } from '@/lib/childIdentity';

export interface EnfantInscrit {
  firstName: string;
  lastName: string;
  className: string;
}

export interface LigneEnfantInscrit {
  nom: string;
  prenom: string;
  classe: string;
}

/** Rang de la classe dans le référentiel (inconnues à la fin). */
const CLASS_ORDER = new Map(allClasses().map((classe, index) => [normIdentity(classe), index]));
const classRank = (classe: string) => CLASS_ORDER.get(normIdentity(classe)) ?? Number.MAX_SAFE_INTEGER;

/** Normalise et trie les enfants inscrits (classe, nom, prénom). */
export function listeEnfantsInscrits(children: EnfantInscrit[]): LigneEnfantInscrit[] {
  return children
    .map((child) => ({
      nom: (child.lastName ?? '').trim(),
      prenom: (child.firstName ?? '').trim(),
      classe: (child.className ?? '').trim(),
    }))
    .sort((a, b) =>
      classRank(a.classe) - classRank(b.classe)
      || a.classe.localeCompare(b.classe, 'fr', { sensitivity: 'base' })
      || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
      || a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' }));
}
