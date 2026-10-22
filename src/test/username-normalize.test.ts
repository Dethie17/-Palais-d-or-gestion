import { describe, it, expect } from 'vitest';
import { normalizeUsername, isValidUsername } from '@/lib/authSecurity';

/**
 * Un parent doit pouvoir taper son nom tel qu'il le prononce. L'identifiant
 * technique (construit en adresse interne) ne doit jamais être imposé.
 */
describe('Nom d’utilisateur parent — nom propre simple', () => {
  it('accepte un nom propre tel qu’on l’écrit', () => {
    expect(normalizeUsername('Mamadou')).toBe('mamadou');
    expect(normalizeUsername('Awa Diallo')).toBe('awa.diallo');
    expect(normalizeUsername('  Fatou   Ndiaye  ')).toBe('fatou.ndiaye');
  });

  it('retire les accents (l’adresse interne reste ASCII)', () => {
    expect(normalizeUsername('Cissé')).toBe('cisse');
    expect(normalizeUsername('Aïssatou')).toBe('aissatou');
    expect(normalizeUsername('Réné')).toBe('rene');
  });

  it('produit toujours un identifiant validable', () => {
    expect(isValidUsername(normalizeUsername('Mamadou'))).toBe(true);
    expect(isValidUsername(normalizeUsername('awa diallo'))).toBe(true);
    expect(isValidUsername(normalizeUsername('Cheikh.fall-2026'))).toBe(true);
  });

  it('ne rattrape pas les caractères interdits (erreur explicite attendue)', () => {
    expect(isValidUsername(normalizeUsername('awa@diallo'))).toBe(false);
    expect(isValidUsername(normalizeUsername('awa#1'))).toBe(false);
  });

  it('borne la longueur à 24 caractères', () => {
    expect(normalizeUsername('a'.repeat(30)).length).toBe(24);
  });

  it('reste vide si la saisie l’est', () => {
    expect(normalizeUsername('   ')).toBe('');
    expect(isValidUsername('')).toBe(false);
  });
});
