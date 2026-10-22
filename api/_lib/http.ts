/**
 * Helpers HTTP des fonctions Vercel : lecture du corps, réponses JSON,
 * CORS. Le webhook SycaPay appelle ces endpoints depuis l'extérieur (sans
 * en-tête Origin) : le CORS n'y sert à rien mais ne doit pas le casser.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const;

/** Sécurité : le webhook est public par nature, on borne le corps lu. */
const MAX_BODY_BYTES = 128 * 1024;

/**
 * Lit le corps de la requête en texte brut.
 *
 * Le BRUT, pas un JSON analysé : la signature HMAC porte sur les octets
 * exacts reçus, pas sur un objet re-sérialisé (dont l'espacement et l'ordre
 * des clés ne survivraient pas au round-trip).
 *
 * Le runtime Vercel peut avoir déjà consommé le flux selon la version ; on
 * accepte donc un corps déjà mis en mémoire (Buffer ou texte) et on ne lit le
 * flux que s'il est encore disponible. Dans les deux cas, c'est l'octet
 * d'origine qui est renvoyé.
 */
export function readRawBody(req: IncomingMessage): Promise<string> {
  const preset = (req as { body?: unknown }).body;
  if (typeof preset === 'string') return Promise.resolve(preset);
  if (Buffer.isBuffer(preset)) return Promise.resolve(preset.toString('utf8'));

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        reject(new Error('Corps de requête trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (!settled) reject(err);
    });
  });
}

/** Lit le corps et le décode en JSON. Lève sur un corps malformé. */
export async function readJson<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const raw = await readRawBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, status: number, message: string, extra?: Record<string, unknown>): void {
  sendJson(res, status, { ok: false, error: message, ...extra });
}

/**
 * Répond 405 + Allow. À appeler au début d'un handler qui n'accepte pas
 * tous les verbes.
 */
export function methodNotAllowed(req: IncomingMessage, res: ServerResponse, allowed: string[]): void {
  res.writeHead(405, { ...JSON_HEADERS, Allow: allowed.join(', ') });
  res.end(JSON.stringify({ ok: false, error: `Méthode non autorisée. Attendu : ${allowed.join(', ')}.` }));
}

/** Vrai si la requête vient d'un navigateur (donc soumise au CORS). */
export function isBrowserRequest(req: IncomingMessage): boolean {
  return Boolean(req.headers.origin);
}

/**
 * Réponse au preflight CORS.
 * L'API SycaPay est publique par nature (le navigateur appelle /initiate,
 * SycaPay appelle /webhook) : la restriction utile est sur la méthode, pas
 * sur l'origine.
 */
export function handlePreflight(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}

/** Montant attendu en XOF : entier, sans décimale, borné par SycaPay. */
export function parseAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  // SycaPay refuse les montants < 100 XOF et attend des francs sans décimale.
  if (rounded < 100) return null;
  if (rounded > 100_000_000) return null;
  return rounded;
}

/**
 * Numéro mobile en format local, sans indicatif pays : SycaPay refuse
 * +221771234567 comme 771234567 (docs §11).
 */
export function normalizeLocalPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  // On retire d'abord le préfixe international (00 ou +), puis l'indicatif
  // pays s'il reste. L'ordre compte : « 00221771234567 » doit devenir
  // « 771234567 », pas « 221771234567 ».
  const withoutIdd = digits.replace(/^00/, '');
  const local = withoutIdd.startsWith('221') ? withoutIdd.slice(3) : withoutIdd.replace(/^0+/, '');
  if (!/^[67]\d{8}$/.test(local)) return null;
  return local;
}

/**
 * Métadonnées SycaPay : objet plat, valeurs texte, 20 clés, 40 caractères
 * par clé, 500 par valeur (1139 sinon). On filtre plutôt que de laisser
 * l'appel être refusé.
 */
export function sanitizeMetadata(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (count >= 20) break;
    const key = String(rawKey).trim().slice(0, 40);
    if (!key) continue;
    if (rawValue == null) continue;
    const value = String(rawValue).slice(0, 500);
    if (!value) continue;
    out[key] = value;
    count += 1;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}