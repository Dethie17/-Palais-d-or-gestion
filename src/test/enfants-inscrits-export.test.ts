import { describe, it, expect } from 'vitest';
import { listeEnfantsInscrits } from '@/lib/enfantsInscrits';

/**
 * Export « Abonnés & paiements » : la liste des enfants inscrits doit être
 * triée dans l'ordre des classes du référentiel, puis par nom et prénom.
 */
describe('Liste des enfants inscrits (export Superviseur)', () => {
  it('nettoie les espaces et trie par classe, nom puis prénom', () => {
    const rows = listeEnfantsInscrits([
      { firstName: ' Moussa ', lastName: 'Diallo', className: 'CE2' },
      { firstName: 'Aminata', lastName: 'Ba', className: 'CP' },
      { firstName: 'Ibra', lastName: 'Sow', className: 'CM1' },
      { firstName: 'Awa', lastName: 'Ba', className: 'CP' },
    ]);
    expect(rows).toEqual([
      { nom: 'Ba', prenom: 'Aminata', classe: 'CP' },
      { nom: 'Ba', prenom: 'Awa', classe: 'CP' },
      { nom: 'Diallo', prenom: 'Moussa', classe: 'CE2' },
      { nom: 'Sow', prenom: 'Ibra', classe: 'CM1' },
    ]);
  });

  it('place les classes hors référentiel à la fin, par ordre alphabétique', () => {
    const rows = listeEnfantsInscrits([
      { firstName: 'Awa', lastName: 'Fall', className: 'M4' },
      { firstName: 'Ibra', lastName: 'Ndiaye', className: 'CM2' },
      { firstName: 'Moussa', lastName: 'Ba', className: 'Inconnue' },
    ]);
    expect(rows.map((r) => r.classe)).toEqual(['CM2', 'Inconnue', 'M4']);
  });

  it('accepte une liste vide', () => {
    expect(listeEnfantsInscrits([])).toEqual([]);
  });
});
