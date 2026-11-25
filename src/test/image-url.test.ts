import { describe, expect, it } from 'vitest';
import { isImageUrl, normalizeImageUrl } from '@/lib/imageUrl';

describe('normalizeImageUrl', () => {
  it('conserve une URL https directe', () => {
    const url = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600';
    expect(normalizeImageUrl(url)).toBe(url);
  });

  it('passe un lien http en https et complète les protocoles relatifs', () => {
    expect(normalizeImageUrl('http://example.com/repas.jpg')).toBe('https://example.com/repas.jpg');
    expect(normalizeImageUrl('//example.com/repas.jpg')).toBe('https://example.com/repas.jpg');
  });

  it('convertit un lien de partage Google Drive en image directe', () => {
    expect(normalizeImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'))
      .toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1600');
    expect(normalizeImageUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'))
      .toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1600');
  });

  it('convertit un lien Dropbox et un lien GitHub blob en image directe', () => {
    expect(normalizeImageUrl('https://www.dropbox.com/s/abc/repas.jpg?dl=0'))
      .toBe('https://www.dropbox.com/s/abc/repas.jpg?raw=1');
    expect(normalizeImageUrl('https://github.com/user/repo/blob/main/images/repas.jpg'))
      .toBe('https://raw.githubusercontent.com/user/repo/main/images/repas.jpg');
  });

  it('garde les chemins locaux et nettoie les espaces', () => {
    expect(normalizeImageUrl('  /images/repas.jpg  ')).toBe('/images/repas.jpg');
    expect(normalizeImageUrl('')).toBe('');
    expect(normalizeImageUrl(null)).toBe('');
  });

  it('reconnaît une URL d’image exploitable', () => {
    expect(isImageUrl('https://example.com/repas.jpg')).toBe(true);
    expect(isImageUrl('/images/repas.jpg')).toBe(true);
    expect(isImageUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageUrl('')).toBe(false);
  });
});
