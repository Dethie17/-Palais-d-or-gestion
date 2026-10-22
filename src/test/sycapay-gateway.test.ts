import { describe, it, expect } from 'vitest';
import { signBody, verifySignature } from '../../api/_lib/webhookHmac';
import { parseAmount, normalizeLocalPhone, sanitizeMetadata } from '../../api/_lib/http';
import { describeError, failureMessage, isAccepted, isExpiredFailure, isRetryableCallError, readConfig, readPem, requiresReturnUrls } from '../../api/_lib/sycapay';
import { isPaymentEvent, readWebhookV1, readWebhookV2 } from '../../api/_lib/settle';

/**
 * Le contrat qui protège l'argent.
 *
 * Deux règles de la doc SycaPay gouvernent tout le reste :
 *   1. rien n'est payé tant que le webhook ne l'a pas dit ;
 *   2. une notification peut être livrée plusieurs fois, et le règlement doit
 *      être rejouable sans jamais créditer deux fois.
 *
 * Ces tests couvrent ce qui peut être vérifié sans réseau ni base : la
 * signature, le refus d'un webhook non authentifié, et la lecture des
 * enveloppes.
 */

describe('Signature HMAC du webhook', () => {
  const secret = 'secret-de-test';
  const env = { SYCAPAY_WEBHOOK_SECRET: secret } as never;

  it('accepte une signature produite sur le corps exact', () => {
    const body = JSON.stringify({ eventId: 'evt_1', eventType: 'decaissement.success' });
    const signature = signBody(body, secret);
    expect(verifySignature(body, signature, env).ok).toBe(true);
  });

  it('refuse un corps modifié après signature', () => {
    const body = JSON.stringify({ eventId: 'evt_1', tag: 'FAILED' });
    const signature = signBody(JSON.stringify({ eventId: 'evt_1', tag: 'SUCCESS' }), secret);
    // Le corps porteur de la signature est celui qui a été modifié.
    expect(verifySignature(body, signature, env).ok).toBe(false);
  });

  it('refuse une signature calculée avec un autre secret', () => {
    const body = '{"eventId":"evt_1"}';
    const signature = signBody(body, 'autre-secret');
    expect(verifySignature(body, signature, env).ok).toBe(false);
  });

  it('refuse un en-tête absent', () => {
    expect(verifySignature('{"eventId":"evt_1"}', undefined, env).ok).toBe(false);
  });

  it('refuse par défaut quand aucun secret n’est configuré', () => {
    // Un webhook non authentifié laisse n'importe qui activer des abonnements :
    // mieux vaut refuser que faire confiance.
    const verdict = verifySignature('{}', 'anything', {} as never);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/SYCAPAY_WEBHOOK_SECRET/);
  });

  it('accepte sans secret seulement en mode test explicite', () => {
    const verdict = verifySignature('{}', undefined, { SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE: 'false' } as never);
    expect(verdict.ok).toBe(true);
  });

  it('accepte l’algorithme SHA512 quand le partenaire l’utilise', () => {
    const body = '{"eventId":"evt_1"}';
    const signature = signBody(body, secret, 'sha512');
    const verdict = verifySignature(body, signature, {
      SYCAPAY_WEBHOOK_SECRET: secret,
      SYCAPAY_WEBHOOK_HMAC_ALGO: 'sha512',
    });
    expect(verdict.ok).toBe(true);
  });
});

describe('Enveloppes webhook', () => {
  it('lit la référence du webhook v2', () => {
    const parsed = readWebhookV2({
      eventId: 'evt_5f452',
      eventType: 'decaissement.success',
      data: { idPartenaire: 'PAY-ABC123', tag: 'SUCCESS', statut: 'FINISHED' },
    });
    expect(parsed?.reference).toBe('PAY-ABC123');
    expect(parsed?.eventType).toBe('decaissement.success');
  });

  it('lit le webhook v1 déprécié', () => {
    const parsed = readWebhookV1({ idPartenaire: 'PAY-ABC123', tag: 'FAILED', reasonForFailure: 'refus' });
    expect(parsed).toEqual({ reference: 'PAY-ABC123', tag: 'FAILED', reason: 'refus' });
  });

  it('renvoie null quand aucune référence n’est exploitable', () => {
    expect(readWebhookV2({ eventType: 'decaissement.success' })).toBeNull();
  });

  it('distingue un paiement d’un dépôt', () => {
    // Un dépôt (_CASHIN) crédite un bénéficiaire chez nous : hors périmètre
    // de cet écran, qui n'encaisse que des paiements.
    expect(isPaymentEvent('decaissement.success', 'SN_PM_WAVE')).toBe(true);
    expect(isPaymentEvent('encaissement.success', 'SN_CASHIN_OM')).toBe(false);
    expect(isPaymentEvent(undefined, 'SN_PM_WAVE')).toBe(true);
    expect(isPaymentEvent(undefined, 'SN_CASHIN_WAVE')).toBe(false);
  });
});

describe('Codes de sortie', () => {
  it('ne traite que 200 et 201 comme acceptés', () => {
    expect(isAccepted('200')).toBe(true);
    expect(isAccepted('201')).toBe(true);
    expect(isAccepted('202')).toBe(false);
    expect(isAccepted('1110')).toBe(false);
  });

  it('sait quels refus peuvent être réessayés tels quels', () => {
    expect(isRetryableCallError('1110')).toBe(true);
    expect(isRetryableCallError('1111')).toBe(true);
    expect(isRetryableCallError('1103')).toBe(false);
  });

  it('reconnaît une expiration comme un abandon, pas un refus', () => {
    // Le client n'a rien refusé : il n'a simplement jamais payé dans la
    // fenêtre. On peut donc lui proposer de recommencer.
    expect(isExpiredFailure('expired')).toBe(true);
    expect(isExpiredFailure('EXPIRED')).toBe(true);
    expect(isExpiredFailure('card-declined')).toBe(false);
    expect(failureMessage('expired')).toMatch(/Relancez/);
  });

  it('sait quels services imposent des adresses de retour', () => {
    expect(requiresReturnUrls('SN_PM_WAVE')).toBe(true);
    expect(requiresReturnUrls('SN_PM_OM')).toBe(true);
    expect(requiresReturnUrls('CI_PM_OM')).toBe(true);
    expect(requiresReturnUrls('SN_PM_YAS')).toBe(false);
  });

  it('présente le refus de l’opérateur avec son code', () => {
    expect(describeError({ errorCode: '1118', errorMessage: 'url_success obligatoire' }))
      .toBe('url_success obligatoire (1118)');
  });
});

describe('Normalisation des entrées', () => {
  it('convertit un numéro international en format local', () => {
    // SycaPay refuse +221771234567 : seul le format local est accepté.
    expect(normalizeLocalPhone('+221 77 123 45 67')).toBe('771234567');
    expect(normalizeLocalPhone('771234567')).toBe('771234567');
    expect(normalizeLocalPhone('00221771234567')).toBe('771234567');
  });

  it('refuse un numéro hors préfixes sénégalais', () => {
    expect(normalizeLocalPhone('3312345678')).toBeNull();
    expect(normalizeLocalPhone('')).toBeNull();
    expect(normalizeLocalPhone(undefined)).toBeNull();
  });

  it('borne le montant : entier XOF, minimum 100', () => {
    expect(parseAmount(27000)).toBe(27000);
    expect(parseAmount('1900')).toBe(1900);
    expect(parseAmount(99)).toBeNull();
    expect(parseAmount(0)).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('écarte des métadonnées hors bornes plutôt que de laisser 1139', () => {
    const meta = sanitizeMetadata({ commande: 'PAY-1', vide: null, long: 'x'.repeat(600) });
    expect(meta).toBeDefined();
    expect(meta?.commande).toBe('PAY-1');
    expect(meta?.vide).toBeUndefined();
    // 20 clés au plus : le reste est filtré, pas refusé en bloc.
    const many = sanitizeMetadata(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'v'])));
    expect(Object.keys(many ?? {}).length).toBeLessThanOrEqual(20);
  });

  it('ne renvoie pas d’objet vide : SycaPay refuserait les métadonnées vides', () => {
    expect(sanitizeMetadata({ a: null, b: '' })).toBeUndefined();
  });
});

describe('Lecture des PEM de certificat', () => {
  // Ce qui est arriv\u00e9 en production : une cl\u00e9 stock\u00e9e avec des
  // newlines \u00e9chapp\u00e9es fait passer readPem, puis casse la connexion TLS
  // avec ERR_OSSL_UNSUPPORTED \u2014 un 500 qui ne dit pas quelle variable est
  // en cause. La lecture doit absorber ou refuser, jamais laisser passer.
  const keyPem = [
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7',
    'VyjfJ2vW0YlG2mQ7hZ9p0p1r2s3t4u5v6w7x8y9z0a1b2c3d4e5',
    '-----END PRIVATE KEY-----',
  ].join('\n');
  const keyBase64 = Buffer.from(keyPem, 'utf8').toString('base64');

  it('d\u00e9code une variable stock\u00e9e en base64', () => {
    expect(readPem(keyBase64)).toBe(keyPem);
  });

  it('accepte un PEM stock\u00e9 tel quel', () => {
    expect(readPem(keyPem)).toBe(keyPem);
  });

  it('r\u00e9tablit les vraies lignes quand les newlines sont \u00e9chapp\u00e9es', () => {
    const escaped = keyPem.replace(/\n/g, '\\n');
    const read = readPem(escaped);
    expect(read).toBe(keyPem);
    // Sans cela, tls.createSecureContext refuse la cl\u00e9.
    expect(read).not.toContain('\\n');
  });

  it('accepte un PEM en fins de ligne Windows', () => {
    expect(readPem(keyPem.replace(/\n/g, '\r\n'))).toBe(keyPem);
  });

  it('refuse un PEM tronqu\u00e9 plut\u00f4t que de le laisser casser la connexion', () => {
    const cut = keyPem.slice(0, Math.floor(keyPem.length * 0.8));
    expect(readPem(cut)).toBeUndefined();
    expect(readPem(Buffer.from(cut, 'utf8').toString('base64'))).toBeUndefined();
  });

  it('nomme la variable illisible dans l\u2019erreur de configuration', () => {
    let message = '';
    try {
      readConfig({ SYCAPAY_CLIENT_KEY: keyPem.slice(0, 40) } as never);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/SYCAPAY_CLIENT_KEY/);
  });
});

describe('Nettoyage de la configuration', () => {
  // Le cas reel en production : SYCAPAY_BASE_URL valait "..../part/api " avec
  // une espace traînante, l'endpoint devenait "api /statusV2", et la
  // passerelle repondait {"error":"Unauthorized"} sans rien dire de plus.
  const goodPem = [
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7',
    '-----END PRIVATE KEY-----',
  ].join('\n');
  const env = {
    SYCAPAY_BASE_URL: 'https://ops.sycapay.com/coresystem/part/api ',
    SYCAPAY_LOGIN_API: ' MIAMS ',
    SYCAPAY_MDP_API: ' secret ',
    SYCAPAY_CA_CRT: goodPem,
    SYCAPAY_CLIENT_CRT: goodPem,
    SYCAPAY_CLIENT_KEY: goodPem,
  };

  it('nettoie une URL de base collee avec une espace', () => {
    expect(readConfig(env as never).baseUrl).toBe('https://ops.sycapay.com/coresystem/part/api');
  });

  it('ne laisse aucun espace dans l endpoint appele', () => {
    const { baseUrl } = readConfig(env as never);
    expect(`${baseUrl}/statusV2`).not.toMatch(/\s/);
  });

  it('nettoie aussi les identifiants', () => {
    const config = readConfig(env as never);
    expect(config.loginApi).toBe('MIAMS');
    expect(config.mdpApi).toBe('secret');
  });
});
