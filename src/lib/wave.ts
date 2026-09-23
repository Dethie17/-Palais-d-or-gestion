import type { ORestoPaymentMethod } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';

export type MobileMethod = 'wave';

export interface WavePaymentRequest {
  reference: string;
  amount: number;
  amountLabel: string;
  method: MobileMethod;
  methodLabel: string;
  merchantNumber: string;
  merchantName: string;
  ussdCode: string;
  expiresAt: string;
  demoCode: string;
  steps: string[];
}

const CODES_KEY = 'o-resto-wave-codes';

function readCodes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CODES_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeCodes(codes: Record<string, string>) {
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify(codes));
  } catch {
    /* stockage indisponible */
  }
}

export const WAVE_MERCHANT_NUMBER =
  (import.meta.env.VITE_WAVE_MERCHANT_NUMBER as string | undefined) ?? '+221 77 000 00 00';
export const WAVE_MERCHANT_NAME =
  (import.meta.env.VITE_WAVE_MERCHANT_NAME as string | undefined) ?? 'O RESTO';

/** Expiration d'une demande de paiement mobile : 15 minutes. */
export const WAVE_TTL_MS = 15 * 60 * 1000;

export function isMobileMethod(method: ORestoPaymentMethod): method is MobileMethod {
  return method === 'wave';
}

export function methodLabel(method: ORestoPaymentMethod): string {
  switch (method) {
    case 'wave':
      return 'Wave';
    case 'cash':
      return 'Espèces';
    case 'mobile_money':
      return 'Mobile Money';
    case 'card':
      return 'Carte bancaire';
    default:
      return method;
  }
}

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Crée une demande de paiement mobile.
 * Mode démo / sans clé API : génère un code de confirmation à 6 chiffres
 * (affiché dans l'app pour valider le parcours de bout en bout).
 * Avec un vrai compte marchand Wave/OM : remplacez cet appel par l'API
 * d'initiation (paiement marchand) et la vérification du callback.
 */
export function initiateWavePayment(
  amount: number,
  method: MobileMethod,
  reference: string,
): WavePaymentRequest {
  const demoCode = randomCode();
  const codes = readCodes();
  codes[reference] = demoCode;
  writeCodes(codes);

  return {
    reference,
    amount,
    amountLabel: formatCurrency(amount),
    method,
    methodLabel: methodLabel(method),
    merchantNumber: WAVE_MERCHANT_NUMBER,
    merchantName: WAVE_MERCHANT_NAME,
    ussdCode: '#144#',
    expiresAt: new Date(Date.now() + WAVE_TTL_MS).toISOString(),
    demoCode,
    steps: [
      `Ouvrez Wave et envoyez ${formatCurrency(amount)} au marchand ${WAVE_MERCHANT_NAME} (${WAVE_MERCHANT_NUMBER}).`,
      `Motif / référence : ${reference}.`,
      'Validez avec votre code secret Wave.',
      'Saisissez ci-dessous le code de confirmation à 6 chiffres pour activer votre carte.',
    ],
  };
}

/** Le code de confirmation mobile fait toujours 6 chiffres. */
export function isValidWaveCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/**
 * Vérifie le code saisi. En mode démo : compare au code généré à
 * l'initiation. Repli : tout code à 6 chiffres est accepté (données
 * anciennes ou restauration après vidage du stockage).
 */
export function checkWaveCode(reference: string, code: string): boolean {
  const clean = code.trim();
  if (!isValidWaveCode(clean)) return false;
  const expected = readCodes()[reference];
  if (!expected) return true;
  return clean === expected;
}

export function clearWaveCode(reference: string) {
  const codes = readCodes();
  delete codes[reference];
  writeCodes(codes);
}

/** Numéros SN acceptés : 77/78/76/75/70… (avec ou sans +221 / espaces). */
export function isValidSnPhone(phone: string): boolean {
  const digits = phone.replace(/[\s.-]/g, '');
  return /^(\+221)?[67]\d{8}$/.test(digits);
}

export function normalizeSnPhone(phone: string): string {
  const digits = phone.replace(/[\s.-]/g, '');
  return digits.startsWith('+221') ? digits : `+221${digits.replace(/^0+/, '')}`;
}
