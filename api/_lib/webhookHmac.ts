/**
 * Vérification de la signature HMAC des notifications SycaPay.
 *
 * La signature est un Base64 brut du HMAC-SHA256 du corps brut, dans
 * l'en-tête X-Sycapay-Signature (nom personnalisable côté partenaire), sans
 * préfixe d'algorithme (v1.6). Une même notification peut être livrée
 * plusieurs fois : c'est l'idempotence, pas la signature, qui protège du
 * double règlement — voir sycapay_events.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function signBody(body: string, secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
  return createHmac(algorithm, secret).update(body, 'utf8').digest('base64');
}

/** Comparaison à temps constant : pas de fuite par le temps de réponse. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface HmacEnv {
  SYCAPAY_WEBHOOK_SECRET?: string;
  SYCAPAY_WEBHOOK_HMAC_ALGO?: string;
  SYCAPAY_WEBHOOK_HMAC_HEADER?: string;
  SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE?: string;
}

/**
 * Vérifie la signature d'un webhook.
 *
 * Sans secret configuré, la vérification est impossible : on l'accepte
 * seulement si SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE est explicitement mis à
 * false (mode test de la doc SycaPay, « none »). En production, le laisser
 * unset refuse le webhook plutôt que de faire confiance à un appelant non
 * authentifié — un webhook non authentifié laisse n'importe qui activer des
 * abonnements.
 */
export function verifySignature(
  body: string,
  provided: string | undefined,
  env: HmacEnv = process.env as HmacEnv,
): { ok: boolean; reason?: string } {
  const secret = (env.SYCAPAY_WEBHOOK_SECRET ?? '').trim();
  const required = (env.SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE ?? 'true').toLowerCase() !== 'false';

  if (!secret) {
    if (required) {
      return { ok: false, reason: 'SYCAPAY_WEBHOOK_SECRET absent — configurez-le pour authentifier les notifications.' };
    }
    return { ok: true, reason: 'signature non vérifiée (mode test SycaPay « none »)' };
  }
  if (!provided) return { ok: false, reason: 'en-tête de signature absent' };

  const algo = (env.SYCAPAY_WEBHOOK_HMAC_ALGO ?? 'sha256').toLowerCase() === 'sha512' ? 'sha512' : 'sha256';
  const expected = signBody(body, secret, algo);
  if (!safeEqual(provided.trim(), expected)) return { ok: false, reason: 'signature invalide' };
  return { ok: true };
}

/** Nom de l'en-tête portant la signature (personnalisable chez SycaPay). */
export function signatureHeaderName(env: HmacEnv = process.env as HmacEnv): string {
  return (env.SYCAPAY_WEBHOOK_HMAC_HEADER ?? 'X-Sycapay-Signature').trim();
}