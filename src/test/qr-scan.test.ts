import { describe, it, expect } from 'vitest';
import {
  pickBackCameraId,
  isSecureScanContext,
  friendlyScanError,
  scanErrorName,
} from '@/lib/qrScan';

describe('scan QR universel', () => {
  it('choisit la caméra arrière, sinon la dernière, sinon null', () => {
    expect(pickBackCameraId([])).toBe(null);
    expect(pickBackCameraId([{ id: 'a', label: '' }])).toBe('a');
    expect(
      pickBackCameraId([
        { id: 'front', label: 'Front Camera' },
        { id: 'back', label: 'Back Camera' },
      ]),
    ).toBe('back');
    expect(
      pickBackCameraId([{ id: 'x', label: 'Caméra arrière' }]),
    ).toBe('x');
    // Sans label (permission pas encore accordée) : la dernière (souvent l'arrière).
    expect(
      pickBackCameraId([
        { id: 'c1', label: '' },
        { id: 'c2', label: '' },
      ]),
    ).toBe('c2');
  });

  it('contexte sécurisé : HTTPS ou localhost uniquement', () => {
    expect(isSecureScanContext('cantine.local', 'https:')).toBe(true);
    expect(isSecureScanContext('localhost', 'http:')).toBe(true);
    expect(isSecureScanContext('127.0.0.1', 'http:')).toBe(true);
    expect(isSecureScanContext('192.168.1.10', 'http:')).toBe(false);
    expect(isSecureScanContext('monsite.sn', 'http:')).toBe(false);
  });

  it('message HTTP non sécurisé en priorité', () => {
    expect(friendlyScanError('NotAllowedError', false)).toMatch(/HTTPS/);
  });

  it('messages adaptés par type d’échec caméra', () => {
    expect(friendlyScanError('NotAllowedError', true)).toMatch(/autorisez/);
    expect(friendlyScanError('NotFoundError', true)).toMatch(/Aucune caméra/);
    expect(friendlyScanError('NotReadableError', true)).toMatch(/occupée/);
    expect(friendlyScanError('NotSupportedError', true)).toMatch(/non supportée/);
    expect(friendlyScanError('Bizarre', true)).toMatch(/liste des élèves/);
  });

  it('normalise le nom d’erreur', () => {
    const e = new DOMException('denied', 'NotAllowedError');
    expect(scanErrorName(e)).toBe('NotAllowedError');
    expect(scanErrorName('panne')).toBe('UnknownError');
    expect(scanErrorName(null)).toBe('UnknownError');
  });
});
