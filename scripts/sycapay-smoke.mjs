#!/usr/bin/env node
/**
 * Test de connexion mTLS à l'API SycaPay.
 *
 * Appelle POST /balance — une lecture seule, sans risque, exactement comme
 * l'option 1 du test_sycapay.py fourni par SycaPay. Ce que l'on cherche ici
 * n'est pas le solde mais la réponse à une seule question : la poignée de
 * main TLS aboutit-elle ?
 *
 * Distinguer les deux est capital :
 *   - une erreur TLS (ERR_OSSL_*, "mismatch") signifie que client.key ne
 *     correspond pas à client.crt, ou que ca.crt ne vérifie pas le serveur ;
 *     le trio est alors inutilisable et aucune identifiant ne marchera ;
 *   - une réponse HTTP de l'API signifie au contraire que le mTLS est passé
 *     et que seul le mot de passe peut encore poser problème.
 *
 * Aucun secret n'est affiché : ni le mot de passe, ni le contenu de la clé.
 *
 * Usage : node scripts/sycapay-smoke.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env.local');
const DEFAULT_BASE_URL = 'https://ops.sycapay.com/coresystem/part/api';

/** Lit un .env simple : on n'ajoute pas de dépendance pour un script local. */
function readEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    // Retirer un éventuel guillemet englobant.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/** Même décodage que le client de production (api/_lib/sycapay.ts). */
function pemFromEnv(value) {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;
  const decoded = raw.includes('-----BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return decoded.includes('-----BEGIN') ? decoded : undefined;
}

/** Codes d'appel dont la lecture explique la nature du problème. */
const DIAGNOSTIC = {
  200: 'Connexion établie : mTLS valide et identifiants acceptés.',
  1102: 'Service fermé pour ce partenaire (aucun rattachement, ou rattachement suspendu).',
  1103: 'Solde insuffisant sur le compte partenaire.',
  1105: 'Compte partenaire non configuré ou désactivé.',
  1110: 'Mot de passe API incorrect — le mTLS est bon, seul le secret est à corriger.',
  1111: 'Mot de passe API obligatoire — le mTLS est bon, le secret n’est pas transmis.',
  1112: 'Partenaire inconnu : le loginApi ne correspond pas au compte.',
  1113: 'loginApi obligatoire.',
  // 1114 sur /balance signifie « partenaire désactivé » : le compte existe et
  // l'authentification passe, mais SycaPay n'a pas activé le partenaire.
  // C'est un blocage côté back-office, pas une erreur d'intégration.
  1114: 'Partenaire DÉSACTIVÉ chez SycaPay : le compte MIAMS n’a pas été activé. Contactez le support (support@sycapay.com, +225 01 51 40 56 03).',
};

/**
 * Appel POST authentifié par mTLS.
 *
 * On passe par node:https et non fetch : fetch (undici) n'expose pas les
 * certificats client. C'est aussi exactement ce que fera la fonction Vercel,
 * donc ce que ce script valide est bien ce qui tournera en production.
 */
function postMtls(baseUrl, path, body, tls, timeoutMs = 30000) {
  return new Promise((resolvePromise, rejectPromise) => {
    // Concaténation et non new URL(path, base) : un chemin absolu devant une
    // base qui contient déjà un chemin l'écraserait, et la requête partirait
    // sur /balance au lieu de /coresystem/part/api/balance.
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`.replace(/^\/+/, '/'),
        method: 'POST',
        ca: tls.ca,
        cert: tls.cert,
        key: tls.key,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolvePromise({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('Délai dépassé (30 s)')));
    req.on('error', rejectPromise);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const env = readEnv(ENV_PATH);
  const missing = ['SYCAPAY_LOGIN_API', 'SYCAPAY_MDP_API'].filter((k) => !env[k]?.trim());
  const cert = pemFromEnv(env.SYCAPAY_CLIENT_CRT);
  const key = pemFromEnv(env.SYCAPAY_CLIENT_KEY);
  const ca = pemFromEnv(env.SYCAPAY_CA_CRT);

  if (!cert || !key || !ca) {
    console.error('Configuration incomplète. Lancez d\'abord : node scripts/sycapay-env.mjs');
    if (missing.length) console.error('Variables manquantes :', missing.join(', '));
    process.exit(1);
  }
  if (missing.length) {
    console.error('Variables manquantes :', missing.join(', '));
    process.exit(1);
  }

  const baseUrl = (env.SYCAPAY_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  console.log(`Passerelle : ${baseUrl}`);
  console.log(`Partenaire : ${env.SYCAPAY_LOGIN_API}`);
  console.log('Appel POST /balance (lecture seule)…\n');

  let payload;
  try {
    payload = { loginApi: env.SYCAPAY_LOGIN_API, mdpApi: env.SYCAPAY_MDP_API };
  } catch {
    console.error('Impossible de préparer la requête.');
    process.exit(1);
  }

  let res;
  try {
    res = await postMtls(baseUrl, '/balance', payload, { cert, key, ca });
  } catch (err) {
    const message = err?.message ?? String(err);
    console.error(`\n❌ ÉCHEC DE CONNEXION : ${message}`);
    if (/mismatch|PEM|key values|bad decrypt|private key|KEY_VALUES/i.test(message)) {
      console.error('\n   → client.key ne correspond pas à client.crt.');
      console.error('   → Ou ca.crt ne correspond pas à la CA qui a signé le certificat.');
      console.error('   → Le couple fourni par SycaPay est probablement incohérent.');
    } else if (/timeout|ETIMEDOUT/i.test(message)) {
      console.error('\n   → ops.sycapay.com ne répond pas (réseau ou pare-feu).');
    } else if (/self.signed|unable to verify|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(message)) {
      console.error('\n   → La CA fournie ne vérifie pas le serveur SycaPay.');
    } else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(message)) {
      console.error('\n   → Nom d’hôte introuvable ou connexion refusée.');
    }
    process.exit(5);
  }

  try {
    const { status, text } = res;
    console.log(`HTTP ${status}`);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.log('Réponse non-JSON :');
      console.log(text.slice(0, 400));
      process.exit(2);
    }

    const code = body.errorCode != null ? String(body.errorCode) : null;
    console.log(`errorCode : ${code ?? '(absent)'}`);
    if (body.errorMessage) console.log(`message   : ${body.errorMessage}`);

    console.log('\n--- Verdict ---');
    if (code === '200') {
      console.log('✅ mTLS opérationnel, identifiants acceptés.');
      const comptes = Array.isArray(body.comptes) ? body.comptes
        : Array.isArray(body.data?.comptes) ? body.data.comptes
        : Array.isArray(body.data) ? body.data
        : [];
      if (comptes.length) {
        console.log(`\n${comptes.length} compte(s) :`);
        for (const c of comptes) {
          console.log(`  ${c.numeroCompte ?? '(sans numéro)'} — solde ${c.solde ?? '?'} ${c.devise ?? 'XOF'}`);
        }
      }
      console.log('\nProchaine étape : exécuter les 3 scripts SQL, puis déployer.');
      process.exit(0);
    }

    const explication = DIAGNOSTIC[code];
    if (explication) console.log(explication);
    // 11xx = appel traité par l'API : la couche TLS a donc abouti.
    if (code && code.startsWith('11')) {
      console.log('\n✅ Le mTLS fonctionne (l’API a répondu).');
      if (code === '1110' || code === '1111') {
        console.log('   → Corrigez SYCAPAY_MDP_API dans .env.local, puis relancez.');
      }
      process.exit(3);
    }
    console.log('❌ Réponse inattendue — voir le message ci-dessus.');
    process.exit(4);
  } catch (err) {
    console.error('Erreur inattendue :', err.message);
    process.exit(6);
  }
}

main();