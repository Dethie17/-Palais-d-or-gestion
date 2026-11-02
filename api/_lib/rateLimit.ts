/**
 * Limitation de débit côté serveur.
 *
 * Les routes de connexion sont des URL publiques : sans borne, un script peut
 * essayer des milliers de mots de passe ou de numéros. Le verrouillage du
 * navigateur ne protège que le navigateur ; il faut une limite côté serveur.
 *
 * Le compteur vit en mémoire de l'instance Vercel. Il n'est donc pas partagé
 * entre toutes les instances (une limite distribuée demanderait Redis/Upstash),
 * mais il arrête déjà les attaques en rafale sur une même instance et ne coûte
 * aucune requête base de données.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendError } from './http.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Consomme une unité du seau `key`. Fonction purement locale (aucune I/O) :
 * testable avec une horloge injectée.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (limit <= 0 || windowMs <= 0) {
    return { allowed: true, remaining: 0, retryAfterMs: 0 };
  }

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterMs: 0 };
}

/** Vide les compteurs (tests uniquement). */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Adresse cliente derrière le proxy Vercel (X-Forwarded-For en premier). */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = (raw ?? '').split(',')[0]?.trim();
  if (first) return first;

  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();

  return req.socket?.remoteAddress ?? 'unknown';
}

function reject(res: ServerResponse, retryAfterMs: number): false {
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  res.setHeader('Retry-After', String(retryAfter));
  res.setHeader('Cache-Control', 'no-store');
  sendError(res, 429, `Trop de tentatives. Réessayez dans ${retryAfter} seconde(s).`);
  return false;
}

/** Limite par adresse IP (protège une route entière). */
export function enforceIpRateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  bucket: string,
  limit: number,
  windowMs: number,
): boolean {
  const result = consumeRateLimit(`${bucket}:ip:${clientIp(req)}`, limit, windowMs);
  return result.allowed ? true : reject(res, result.retryAfterMs);
}

/** Limite par identifiant métier (téléphone, nom d'utilisateur…). */
export function enforceKeyRateLimit(
  res: ServerResponse,
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return true;
  const result = consumeRateLimit(`${bucket}:key:${normalized}`, limit, windowMs);
  return result.allowed ? true : reject(res, result.retryAfterMs);
}
