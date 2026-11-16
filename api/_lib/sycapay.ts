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
import type { ClientRequest, IncomingHttpHeaders } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';

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
  /**
   * Proxy HTTP(S) à IP fixe (SYCAPAY_PROXY_URL), facultatif.
   *
   * Sur Vercel, l'IP de sortie est dynamique : l'IP vue par SycaPay peut
   * changer d'une connexion à l'autre ; une entrée unique dans son allowlist
   * ne suffit alors pas. Passer par un proxy à IP fixe donne
   * une adresse stable à déclarer, sans changer le reste du code.
   */
  proxyUrl?: string;
}

/**
 * Lit une variable d'environnement en retirant les guillemets englobants.
 *
 * Le back-office Vercel conserve littéralement
 * les guillemets collés dans le champ valeur. Un mot de passe saisi
 * `"#P@ss"` partait alors avec les guillemets et SycaPay répondait 1110
 * (mot de passe incorrect) sans que rien ne désigne la variable en cause.
 */
export function readEnvValue(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' || first === "'") && last === first) return raw.slice(1, -1).trim();
  }
  return raw;
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
 *
 * Priorité des certificats client :
 *  1. `SYCAPAY_CLIENT_CERT_B64` + `SYCAPAY_CLIENT_KEY_B64` (Vercel Production) ;
 *  2. `SYCAPAY_CLIENT_CRT` + `SYCAPAY_CLIENT_KEY` (anciens déploiements).
 *
 * Les nouvelles variables sont du PEM encodé en base64. Les anciennes sont
 * lues via `readPem`, qui accepte déjà le base64 comme le PEM brut : un
 * déploiement existant continue donc de fonctionner sans changement.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): SycaPayConfig {
  const ca = readPem(readEnvValue(env.SYCAPAY_CA_CRT));
  const certB64 = readEnvValue(env.SYCAPAY_CLIENT_CERT_B64);
  const keyB64 = readEnvValue(env.SYCAPAY_CLIENT_KEY_B64);
  const useB64Credentials = Boolean(certB64 || keyB64);
  const cert = useB64Credentials
    ? readPem(Buffer.from(certB64, 'base64').toString('utf8'))
    : readPem(readEnvValue(env.SYCAPAY_CLIENT_CRT));
  const key = useB64Credentials
    ? readPem(Buffer.from(keyB64, 'base64').toString('utf8'))
    : readPem(readEnvValue(env.SYCAPAY_CLIENT_KEY));
  const certVar = useB64Credentials ? 'SYCAPAY_CLIENT_CERT_B64' : 'SYCAPAY_CLIENT_CRT';
  const keyVar = useB64Credentials ? 'SYCAPAY_CLIENT_KEY_B64' : 'SYCAPAY_CLIENT_KEY';
  const loginApi = readEnvValue(env.SYCAPAY_LOGIN_API);
  const mdpApi = readEnvValue(env.SYCAPAY_MDP_API);
  const proxyUrl = readEnvValue(env.SYCAPAY_PROXY_URL);

  const missing: string[] = [];
  if (!ca) missing.push('SYCAPAY_CA_CRT');
  if (!cert) missing.push(certVar);
  if (!key) missing.push(keyVar);
  if (!loginApi) missing.push('SYCAPAY_LOGIN_API');
  if (!mdpApi) missing.push('SYCAPAY_MDP_API');
  if (missing.length > 0) throw new SycaPayConfigError(missing);

  return {
    baseUrl: (readEnvValue(env.SYCAPAY_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    loginApi,
    mdpApi,
    ca: ca as string,
    cert: cert as string,
    key: key as string,
    ...(proxyUrl ? { proxyUrl } : {}),
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

/**
 * Le certificat client a été refusé, ou le couple cert/clé/CA est invalide.
 * Le message reste volontairement générique : aucun PEM, aucune clé et aucun
 * détail OpenSSL ne doit atteindre les logs ou la réponse HTTP.
 */
export class SycaPayCertificateError extends SycaPayTransportError {
  constructor() {
    super('Certificat client SycaPay refusé ou invalide. Vérifiez la configuration mTLS du serveur.');
    this.name = 'SycaPayCertificateError';
  }
}

const TLS_CERTIFICATE_ERROR =
  /(?:CERT|CERTIFICATE|X509|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|BAD_CERT|CERT_REQUIRED|ALERT_CERTIFICATE|ALERT_BAD_CERTIFICATE|ERR_OSSL|ERR_TLS_CERT|EPROTO)/i;

/** Vrai pour une erreur TLS imputable au certificat ou à sa vérification. */
export function isCertificateError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as NodeJS.ErrnoException).code ?? '');
  const message = String((err as Error).message ?? '');
  return TLS_CERTIFICATE_ERROR.test(`${code} ${message}`);
}

/**
 * Message d'une connexion coupée avant réponse.
 *
 * Cas réel : le handshake TLS réussit (certificat client accepté), puis le
 * pair renvoie un RST dès la requête HTTP, avec ECONNRESET / "socket hang
 * up". C'est le comportement d'un pare-feu applicatif qui filtre l'adresse
 * source : la requête n'atteint jamais le routeur SycaPay. Sans ce message,
 * l'opérateur ne voit qu'un « socket hang up » et cherche au mauvais endroit.
 */
function resetMessage(): string {
  return (
    'La connexion à SycaPay a été coupée avant toute réponse (socket hang up). ' +
    "Le handshake TLS a réussi, donc le certificat n'est pas en cause : " +
    "l'adresse IP publique sortante du serveur n'est probablement pas autorisée. " +
    "Sur Vercel, l'IP de sortie est dynamique (pool AWS) : une IP seule ne suffit pas durablement. " +
    "Ajoutez l'IP courante pour un test immédiat, ou configurez SYCAPAY_PROXY_URL avec un proxy à IP fixe."
  );
}

/** Vrai pour une connexion fermée par le pair avant la moindre réponse HTTP. */
export function isConnectionReset(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as NodeJS.ErrnoException).code ?? '');
  const message = String((err as Error).message ?? '');
  return code === 'ECONNRESET' || code === 'EPIPE' || /socket hang up/i.test(message);
}

/** Recopie les champs de diagnostic (code, syscall, adresse) sans le message. */
function withDetails(target: SycaPayTransportError, source: unknown): SycaPayTransportError {
  const from = source as NodeJS.ErrnoException & { address?: string; port?: number };
  const to = target as unknown as Record<string, unknown>;
  if (from?.code) to.code = from.code;
  if (from?.syscall) to.syscall = from.syscall;
  if (from?.address) to.address = from.address;
  if (from?.port) to.port = from.port;
  return target;
}

/** Ne laisse jamais remonter le détail brut d'une erreur de certificat. */
function asTransportError(err: unknown): SycaPayTransportError {
  if (err instanceof SycaPayTransportError) return err;
  if (isCertificateError(err)) return new SycaPayCertificateError();
  if (isConnectionReset(err)) return withDetails(new SycaPayTransportError(resetMessage()), err);
  const message = err instanceof Error ? err.message : String(err);
  return withDetails(new SycaPayTransportError(`Appel SycaPay impossible : ${message}`), err);
}

/** Agent HTTPS portant le certificat client, la clé privée et la CA serveur. */
export function createMtlsAgent(config: Pick<SycaPayConfig, 'ca' | 'cert' | 'key'>): https.Agent {
  return new https.Agent({
    ca: config.ca,
    cert: config.cert,
    key: config.key,
  });
}

/**
 * Agent de sortie : tunnel via SYCAPAY_PROXY_URL si configuré, sinon mTLS direct.
 * L'agent proxy reçoit les options TLS de la requête (cert/clé/CA) et les
 * applique à la connexion vers la cible, pas vers le proxy.
 */
export function createAgent(config: SycaPayConfig): https.Agent {
  if (config.proxyUrl) return new HttpsProxyAgent<string>(config.proxyUrl) as unknown as https.Agent;
  return createMtlsAgent(config);
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
    let req: ClientRequest;
    try {
      req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`.replace(/^\/+/, '/'),
          method: 'POST',
          agent: createAgent(config),
          // HttpsProxyAgent construit la TLS vers la cible à partir des
          // options de la requête : sans elles, le tunnel n'enverrait pas le
          // certificat client à SycaPay.
          ...(config.proxyUrl
            ? { ca: config.ca, cert: config.cert, key: config.key, servername: url.hostname }
            : {}),
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
    } catch (err) {
      reject(asTransportError(err));
      return;
    }

    const outbound: { remoteAddress?: string; remotePort?: number; localAddress?: string; localPort?: number; tlsProtocol?: string; tlsCipher?: string } = {};
    req.on('socket', (socket) => {
      outbound.remoteAddress = socket.remoteAddress;
      outbound.remotePort = socket.remotePort;
      outbound.localAddress = socket.localAddress;
      outbound.localPort = socket.localPort;
      socket.on('secureConnect', () => {
        const tlsSock = socket as unknown as { getProtocol?: () => string; getCipher?: () => { name?: string } };
        outbound.tlsProtocol = tlsSock.getProtocol?.();
        outbound.tlsCipher = tlsSock.getCipher?.()?.name;
      });
    });
    req.on('timeout', () => {
      console.error('[sycapay] timeout', { path, timeoutMs, ...outbound });
      req.destroy(new SycaPayTransportError(`Délai dépassé sur ${path}`));
    });
    req.on('error', (err) => {
      const e = err as NodeJS.ErrnoException;
      const sock = (req as { socket?: { remoteAddress?: string; remotePort?: number; localAddress?: string; localPort?: number } }).socket;
      if (sock) {
        outbound.remoteAddress = outbound.remoteAddress ?? sock.remoteAddress;
        outbound.remotePort = outbound.remotePort ?? sock.remotePort;
        outbound.localAddress = outbound.localAddress ?? sock.localAddress;
        outbound.localPort = outbound.localPort ?? sock.localPort;
      }
      console.error('[sycapay] transport error', {
        path,
        code: e.code,
        errno: e.errno,
        syscall: e.syscall,
        address: (e as { address?: string }).address,
        port: (e as { port?: number }).port,
        ...outbound,
        message: e.message,
      });
      const transportErr = asTransportError(err);
      (transportErr as unknown as { outbound?: typeof outbound }).outbound = { ...outbound };
      reject(transportErr);
    });
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