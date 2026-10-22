/**
 * Client SycaPay — authentification mTLS.
 *
 * L'API SycaPay n'accepte que mTLS (certificat client + clé privée) : elle
 * n'est joignable que depuis un runtime Node disposant des certificats. Tout
 * ce fichier est donc côté serveur (Vercel Functions), jamais importé par le
 * bundle navigateur.
 *
 * Les certificats sont fournis en base64 dans l'environnement : c'est le seul
 * format fiable sur Vercel, où le système de fichiers de la fonction est
 * éphémère et ne survit pas à un build.
 */

import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';

const DEFAULT_BASE_URL = 'https://ops.sycapay.com/coresystem/part/api';

export interface SycaPayConfig {
  baseUrl: string;
  loginApi: string;
  mdpApi: string;
  /** Certificat CA SycaPay (PEM, pour vérifier le serveur). */
  ca: string;
  /** Certificat client (PEM). */
  cert: string;
  /** Clé privée client (PEM). */
  key: string;
}

export class SycaPayConfigError extends Error {
  constructor(missing: string[]) {
    super(`Configuration SycaPay incomplète : ${missing.join(', ')}`);
    this.name = 'SycaPayConfigError';
  }
}

/**
 * Lit une variable PEM stockée en base64 (ou en PEM brut).
 *
 * Deux pièges courants sont absorbés ici, à la lecture plutôt qu'à la
 * première connexion :
 *
 *  1. Un PEM stocké sur une seule ligne, newlines échappées (\n littéral).
 *     OpenSSL refuse alors la clé avec ERR_OSSL_UNSUPPORTED, sans désigner
 *     la variable en cause.
 *  2. Un PEM tronqué : il contient encore "-----BEGIN", il passe donc un
 *     test naïf, mais il casse la poignée TLS au premier appel. On exige la
 *     balise de fin pour refuser tôt et nommer la variable manquante.
 */
export function readPem(envValue: string | undefined): string | undefined {
  const raw = (envValue ?? '').trim();
  if (!raw) return undefined;
  const decoded = raw.includes('-----BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const pem = decoded
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n');
  return pem.includes('-----BEGIN') && /-----END [A-Z0-9 ]+-----$/m.test(pem) ? pem : undefined;
}

/**
 * Lit la configuration depuis l'environnement.
 * `SYCAPAY_ENABLED=false` désactive la passerelle sans toucher au reste.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): SycaPayConfig {
  const ca = readPem(env.SYCAPAY_CA_CRT);
  const cert = readPem(env.SYCAPAY_CLIENT_CRT);
  const key = readPem(env.SYCAPAY_CLIENT_KEY);
  const loginApi = (env.SYCAPAY_LOGIN_API ?? '').trim();
  const mdpApi = (env.SYCAPAY_MDP_API ?? '').trim();

  const missing: string[] = [];
  if (!ca) missing.push('SYCAPAY_CA_CRT');
  if (!cert) missing.push('SYCAPAY_CLIENT_CRT');
  if (!key) missing.push('SYCAPAY_CLIENT_KEY');
  if (!loginApi) missing.push('SYCAPAY_LOGIN_API');
  if (!mdpApi) missing.push('SYCAPAY_MDP_API');
  if (missing.length > 0) throw new SycaPayConfigError(missing);

  return {
    baseUrl: (env.SYCAPAY_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    loginApi,
    mdpApi,
    ca: ca as string,
    cert: cert as string,
    key: key as string,
  };
}

export function isSycaPayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.SYCAPAY_ENABLED ?? '').toLowerCase() === 'false') return false;
  try {
    readConfig(env);
    return true;
  } catch {
    return false;
  }
}

/** Erreur d'appel : transport TLS, timeout, ou réponse illisible. */
export class SycaPayTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SycaPayTransportError';
  }
}

/** Réponse brute d'un appel SycaPay, telle que rendue par l'API. */
export interface SycaPayEnvelope {
  errorCode?: string;
  errorMessage?: string;
  /**
   * Tout autre champ de la charge utile. `unknown` plutôt que `any` : à la
   * lecture, il faut le convertir explicitement au lieu de le laisser passer
   * comme une valeur.
   */
  [key: string]: unknown;
}

interface CallOptions {
  path: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Appel POST authentifié par mTLS vers l'API SycaPay.
 * Ne lève pas sur un refus métier : l'API répond 200 avec un errorCode, et
 * c'est ce code que l'appelant doit traiter.
 */
export function call<T extends SycaPayEnvelope = SycaPayEnvelope>(
  config: SycaPayConfig,
  { path, body, timeoutMs = 20000, headers = {} }: CallOptions,
): Promise<T> {
  const payload = JSON.stringify(body);
  // Concaténation explicite plutôt que new URL(path, base) : un chemin
  // absolu appliqué à une base qui porte déjà un chemin l'écraserait, et la
  // requête partirait sur /balance au lieu de
  // /coresystem/part/api/balance — un 404 silencieux de l'API.
  const url = new URL(`${config.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`.replace(/^\/+/, '/'),
        method: 'POST',
        ca: config.ca,
        cert: config.cert,
        key: config.key,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Accept: 'application/json',
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.trim()) {
            reject(new SycaPayTransportError(`Réponse SycaPay vide (HTTP ${res.statusCode ?? '?'})`));
            return;
          }
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new SycaPayTransportError(`Réponse SycaPay illisible (HTTP ${res.statusCode ?? '?'})`));
          }
        });
      },
    );

    req.on('timeout', () => req.destroy(new SycaPayTransportError(`Délai dépassé sur ${path}`)));
    req.on('error', (err) => reject(new SycaPayTransportError(`Appel SycaPay impossible : ${err.message}`)));
    req.write(payload);
    req.end();
  });
}

// ---------- Types des charges utiles documentées ----------

/** Réponse d'initiation d'un paiement (_PM_). Trois formes, selon le service. */
export interface InitiateResponse extends SycaPayEnvelope {
  urlRedirection?: string;
  qrCode?: string;
  deepLinks?: Record<string, string>;
  validFor?: { startDateTime?: string; endDateTime?: string };
  transaction?: {
    tokenTX?: string;
    idPartenaire?: string;
    codeService?: string;
    montant?: number;
    metadata?: Record<string, string>;
  };
}

/** Réponse de création d'une session de paiement par carte. */
export interface CheckoutSessionResponse extends SycaPayEnvelope {
  token?: string;
  checkoutUrl?: string;
}

/** Objet transaction rendu par statusV2 et par le webhook v2. */
export interface StatusTransaction extends SycaPayEnvelope {
  tokenTX?: string;
  idPartenaire?: string;
  codeService?: string;
  typeService?: string;
  typeTransaction?: string;
  tag?: 'SUCCESS' | 'FAILED' | 'CANCELED' | string;
  statut?: 'PENDING' | 'FINISHED' | string;
  montant?: number;
  frais?: number;
  commission?: number;
  devise?: string;
  codePays?: string;
  dateCreation?: string;
  dateValidation?: string | null;
  metadata?: Record<string, string>;
  erreur?: { code?: string; message?: string } | null;
  /** Motif d'échec, sur les transactions qui en portent un (webhook v1). */
  reasonForFailure?: string | null;
}

export interface StatusResponse extends SycaPayEnvelope {
  data?: StatusTransaction;
}

/** Enveloppe webhook v2. */
export interface WebhookEvent extends SycaPayEnvelope {
  eventId?: string;
  eventType?: string;
  eventDate?: string;
  data?: StatusTransaction;
}

/** Forme du webhook v1 (déprécié, mais encore servi). */
export interface WebhookEventV1 extends SycaPayEnvelope {
  idPartenaire?: string;
  tag?: string;
  codeService?: string;
  reasonForFailure?: string;
}

/** codes d'appel : « lu dans le contexte de l'appel qui l'a rendu ». */
export function isAccepted(errorCode: unknown): boolean {
  return errorCode === '200' || errorCode === '201';
}

/** Un refus métier : l'appel n'a rien créé, l'argent n'a pas bougé. */
export function isRefused(errorCode: unknown): boolean {
  if (errorCode == null) return false;
  return !isAccepted(errorCode);
}

/** Codes d'appel où aucun transaction n'a été engagée : un nouvel essai peut aboutir. */
const RETRYABLE_CALL_CODES = new Set(['1104', '1110', '1111']);

/** Vrai si l'appel peut être renvoyé tel quel plus tard. */
export function isRetryableCallError(errorCode: unknown): boolean {
  return RETRYABLE_CALL_CODES.has(String(errorCode));
}

/** Extrait un message présentable pour l'utilisateur, en français. */
export function describeError(envelope: SycaPayEnvelope): string {
  const message = typeof envelope.errorMessage === 'string' ? envelope.errorMessage.trim() : '';
  const code = envelope.errorCode != null ? String(envelope.errorCode) : '';
  if (message) return code ? `${message} (${code})` : message;
  if (code) return `SycaPay a refusé l'opération (${code}).`;
  return 'SycaPay n’a pas répondu à la demande.';
}

/** codes d'échec unifiés où un nouvel essai peut aboutir (v1.15+). */
const RETRYABLE_FAILURE_CODES = new Set([
  'service-temporarily-unavailable',
  'provider-unavailable',
  'provider-internal-error',
  'transaction-not-delivered',
]);

/** Vrai si l'échec est de nature passagère : on peut proposer de réessayer. */
export function isRetryableFailure(code: string | null | undefined): boolean {
  if (!code) return false;
  return RETRYABLE_FAILURE_CODES.has(code);
}

/**
 * Un abandon n'est pas un refus : le client n'a rien refusé, il n'a
 * simplement jamais payé dans la fenêtre de validité.
 */
export function isExpiredFailure(code: string | null | undefined): boolean {
  return code === 'expired' || code === 'EXPIRED';
}

/** Nom lisible d'un code d'échec unifié, pour l'écran d'attente. */
export function failureMessage(code: string | null | undefined, fallback?: string | null): string {
  if (isExpiredFailure(code)) return 'Le lien de paiement a expiré sans paiement. Relancez pour obtenir un nouveau lien.';
  if (code === 'card-declined') return 'La banque a refusé la carte.';
  if (code === 'insufficient-funds') return 'Solde insuffisant sur le compte de paiement.';
  if (code === 'service-misconfigured') return 'Ce moyen de paiement est indisponible. Contactez l’établissement.';
  if (code === 'route-disabled' || code === 'service-temporarily-unavailable') {
    return 'Ce moyen de paiement est momentanément fermé. Réessayez dans un instant.';
  }
  if (fallback) return fallback;
  return 'Le paiement n’a pas abouti. Vous pouvez relancer.';
}

/** Types de services retenus : Sénégal, périmètre de l'établissement. */
export type SycaPayCodeService = 'SN_PM_WAVE' | 'SN_PM_OM';

/** Vrai si le service impose url_success / url_failed en https. */
export function requiresReturnUrls(codeService: string): boolean {
  return codeService === 'SN_PM_WAVE' || codeService === 'SN_PM_OM' || codeService === 'CI_PM_OM';
}

/** Lit un en-tête quelle que soit sa casse. */
export function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const found = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = found ? headers[found] : undefined;
  return Array.isArray(value) ? value[0] : value;
}