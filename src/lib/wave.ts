import type { ORestoPaymentMethod } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import type { PaymentChallenge } from '@/lib/payments/types';

export type MobileMethod = 'wave';

/**
 * Session de paiement en cours : ce qu'un écran doit afficher pendant qu'un
 * client règle une commande.
 *
 * Historiquement décrivait le seul parcours Wave (numéro marchand + code à 6
 * chiffres). Le champ `challenge` porte aujourd'hui la forme réelle du
 * paiement, décidée par le prestataire : un lien (Wave), un QR et des liens
 * profonds (Orange Money), une page carte hébergée, ou une invite poussée sur
 * le téléphone. Les anciens champs restent renseignés pour que les écrans non
 * migrés continuent de fonctionner, et `demoCode` n'existe qu'en mode démo —
 * aucun argent ne circule dans ce mode.
 */
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
  /** Code à 6 chiffres — mode démo uniquement (jamais en production). */
  demoCode?: string;
  steps: string[];
  /** Identifiant de la commande locale (paiement ou recharge). */
  paymentId?: string;
  /** 'sub' = abonnement/ticket, 'topup' = recharge de carte prépayée. */
  kind?: 'sub' | 'topup';
  /** Fournisseur actif : 'sycapay' en production, 'demo' en démonstration. */
  provider?: string;
  /** Ce que le client doit faire pour payer. Absent tant que l'appel n'est pas revenu. */
  challenge?: PaymentChallenge;
  /** Message d'erreur de l'initiation, quand l'appel a échoué. */
  error?: string;
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

/**
 * Lien de paiement Wave Business (encaissement comptoir / POS).
 * Configurable via VITE_WAVE_BUSINESS_URL / VITE_WAVE_BUSINESS_NAME.
 * Le client paie le montant exact via le lien (ou son QR), le caissier
 * vérifie la notification Wave Business puis confirme l'encaissement.
 */
export const WAVE_BUSINESS_URL =
  (import.meta.env.VITE_WAVE_BUSINESS_URL as string | undefined) ??
  'https://pay.wave.com/m/M_sn_1ZFaHP4di8qG/c/sn/';
export const WAVE_BUSINESS_NAME =
  (import.meta.env.VITE_WAVE_BUSINESS_NAME as string | undefined) ??
  'O RESTO';

/** Expiration d'une demande de paiement mobile : 15 minutes. */
export const WAVE_TTL_MS = 15 * 60 * 1000;

export function isMobileMethod(method: ORestoPaymentMethod): method is MobileMethod {
  return method === 'wave';
}

/**
 * Moyens qui partent en ligne vers l'application du client (Wave,
 * Orange Money / Max it) : le parent choisit, saisit son numéro, et le
 * modal le redirige pour valider. Espèces et carte restent au comptoir.
 */
export function isOnlineMobileMethod(
  method: ORestoPaymentMethod,
): method is Extract<ORestoPaymentMethod, 'wave' | 'mobile_money'> {
  return method === 'wave' || method === 'mobile_money';
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
    case 'balance':
      return 'Solde carte';
    default:
      return method;
  }
}

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Demande de paiement mobile « à l'ancienne » : merchant + code à 6 chiffres.
 *
 * C'est le chemin du fournisseur de DÉMONSTRATION. En production, l'initiation
 * passe par la passerelle SycaPay (voir lib/payments) et cette fonction n'est
 * plus appelée que pour produire l'affichage commun (montant, référence,
 * expiration) — jamais pour solder quoi que ce soit.
 */
export function initiateWavePayment(
  amount: number,
  method: MobileMethod,
  reference: string,
): WavePaymentRequest {
  // Le code de démonstration n'existe qu'en développement. En
  // production, il n'a aucun opérateur derrière lui : sa seule fonction
  // serait de laisser croire qu'un paiement a eu lieu.
  const demoCode = import.meta.env.PROD ? undefined : randomCode();
  if (demoCode) {
    const codes = readCodes();
    codes[reference] = demoCode;
    writeCodes(codes);
  }

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
 * Vérifie le code de DÉMONSTRATION. Exige le code généré à l'initiation sur
 * cet appareil. Sans code attendu (stockage vidé / autre appareil) : refusé.
 *
 * Ce contrôle n'a rien à voir avec une vérification de paiement : en
 * production, seul le webhook SycaPay déclare un encaissement. Il n'existe
 * que pour que le parcours de démonstration soit jouable de bout en bout.
 */
export function checkWaveCode(reference: string, code: string): boolean {
  const clean = code.trim();
  if (!isValidWaveCode(clean)) return false;
  const expected = readCodes()[reference];
  if (!expected) return false;
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
