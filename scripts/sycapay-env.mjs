#!/usr/bin/env node
/**
 * Prépare la configuration SycaPay à partir des certificats mTLS.
 *
 * L'API SycaPay s'authentifie par mTLS (certificat client + clé privée) :
 * le navigateur ne peut pas la joindre, seul le runtime serveur le peut.
 * Ce script transforme donc les fichiers PEM en base64 mono-ligne et les
 * écrit dans .env.local, seul format fiable sur Vercel où le système de
 * fichiers d'une fonction est éphémère.
 *
 * Les certificats n'entrent JAMAIS dans le dépôt : seul le base64 atterrit
 * dans .env.local, déjà ignoré par .gitignore.
 *
 * Usage :
 *   node scripts/sycapay-env.mjs [--certs <dossier>] [--env <fichier>]
 *
 *   --certs  dossier contenant client.crt, client.key, ca.crt
 *            (défaut : C:/Users/Niack/Downloads/miams/miams)
 *   --env    fichier à compléter (défaut : .env.local)
 *   --check  n'écrit rien, affiche seulement ce qui manque
 *
 * Le script ne réécrit jamais une variable déjà présente : relancer après
 * avoir-renewé un certificat ne doit pas écraser un secret valide.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_CERTS = 'C:/Users/Niack/Downloads/miams/miams';

/** Variables non-secrètes, constantes de notre déploiement. */
const CONSTANTS = {
  SYCAPAY_BASE_URL: 'https://ops.sycapay.com/coresystem/part/api',
  SYCAPAY_LOGIN_API: 'MIAMS',
  // Les adresses de retour doivent être en https : SycaPay refuse en http
  // (codes 1120 / 1121 sur l'initiation).
  VITE_APP_URL: 'https://orestos.vercel.app',
};

/** Fichier PEM → variable d'environnement correspondante. */
const PEM_TO_VAR = [
  ['client.crt', 'SYCAPAY_CLIENT_CRT'],
  ['client.key', 'SYCAPAY_CLIENT_KEY'],
  ['ca.crt', 'SYCAPAY_CA_CRT'],
];

function parseArgs(argv) {
  const args = { certs: DEFAULT_CERTS, env: '.env.local', check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--certs') args.certs = argv[++i];
    else if (argv[i] === '--env') args.env = argv[++i];
    else if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

/** Normalise en LF et garantit un retour final — un .env sans fin de ligne
 *  voit sa dernière variable ignorée par la plupart des chargeurs. */
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '') + '\n';
}

/** Lit les PEM, vérifie qu'ils le sont vraiment, et renvoie le base64. */
function readPemAsBase64(path, varName, problems) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    problems.push(`${varName} : fichier introuvable (${path})`);
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed.includes('-----BEGIN')) {
    problems.push(`${varName} : ce n'est pas un PEM (${path})`);
    return undefined;
  }
  return Buffer.from(trimmed, 'utf8').toString('base64');
}

/** Remplace la valeur d'une variable si elle existe, sinon l'ajoute en fin. */
function upsert(text, name, value) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  return normalize(text) + line;
}

/** Une variable est-elle présente ET non vide ? */
function hasValue(text, name) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return Boolean(m && m[1].trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage : node scripts/sycapay-env.mjs [--certs <dossier>] [--env <fichier>] [--check]');
    process.exit(0);
  }

  const certsDir = resolve(ROOT, args.certs);
  const envPath = resolve(ROOT, args.env);

  console.log(`Certificats : ${certsDir}`);
  console.log(`Environnement : ${envPath}`);

  if (!existsSync(certsDir)) {
    console.error(`\nERREUR : dossier de certificats introuvable : ${certsDir}`);
    console.error('Indiquez le bon dossier avec --certs.');
    process.exit(1);
  }

  const problems = [];
  const values = {};

  for (const [file, varName] of PEM_TO_VAR) {
    const b64 = readPemAsBase64(join(certsDir, file), varName, problems);
    if (b64 !== undefined) {
      values[varName] = b64;
      console.log(`  ✓ ${file.padEnd(14)} → ${varName} (${b64.length} caractères)`);
    }
  }

  for (const [name, value] of Object.entries(CONSTANTS)) {
    values[name] = value;
  }

  // Le mot de passe API n'est pas dans les certificats : il vient du back-office.
  // On ne l'invente pas et on ne l'affiche pas.
  const currentEnv = existsSync(envPath) ? normalize(readFileSync(envPath, 'utf8')) : '';
  if (!hasValue(currentEnv, 'SYCAPAY_MDP_API')) {
    problems.push('SYCAPAY_MDP_API : à renseigner à la main dans .env.local (back-office SycaPay)');
  }

  if (args.check) {
    console.log('\n--- Mode vérification ---');
    for (const [name] of Object.entries(values)) {
      console.log(`  ${hasValue(currentEnv, name) ? 'déjà défini  ' : 'à écrire    '} ${name}`);
    }
  } else {
    let out = currentEnv;
    let written = 0;
    for (const [name, value] of Object.entries(values)) {
      // Ne jamais écraser un secret déjà présent : le PEM est régénérable,
      // un mot de passe saisi à la main ne l'est pas.
      if (hasValue(out, name)) continue;
      out = upsert(out, name, value);
      written += 1;
    }
    writeFileSync(envPath, out, 'utf8');
    console.log(`\n${written} variable(s) écrite(s) dans ${args.env}.`);
    console.log('Les valeurs ne sont pas affichées : ce sont des secrets.');
  }

  if (problems.length > 0) {
    console.log('\nPoints à traiter :');
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nOK.');
}

main().catch((err) => {
  console.error('ÉCHEC :', err.message);
  process.exit(1);
});