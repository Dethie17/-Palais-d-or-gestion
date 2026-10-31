/**
 * Accès Supabase côté serveur (clé de service).
 *
 * Le webhook SycaPay n'a pas de session utilisateur : il lui faut la clé de
 * service pour écrire dans oresto_payments / wallet_transactions sans être
 * freiné par les politiques RLS. Cette clé ne sort jamais du runtime
 * serveur — ne jamais l'exposer via une variable VITE_*.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class SupabaseAdminConfigError extends Error {
  constructor(missing: string[]) {
    super(`Configuration Supabase serveur incomplète : ${missing.join(', ')}`);
    this.name = 'SupabaseAdminConfigError';
  }
}

let cached: SupabaseClient | null = null;
let cachedKey = '';

/**
 * Client Supabase à clé de service, mémorisé par instance (les functions
 * Vercel sont réutilisées d'un appel à l'autre).
 */
export function adminClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new SupabaseAdminConfigError([!url ? 'SUPABASE_URL' : '', !key ? 'SUPABASE_SERVICE_ROLE_KEY' : ''].filter(Boolean));
  }
  if (cached && cachedKey === `${url}|${key}`) return cached;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Verrouille la clé de service : même si une session utilisateur était
    // posée sur ce client, les requêtes resteraient en service_role et ne
    // passeraient jamais sous RLS.
    global: { headers: { Authorization: `Bearer ${key}` } },
  });
  cachedKey = `${url}|${key}`;
  return cached;
}

/**
 * Client éphémère réservé aux connexions par mot de passe.
 *
 * `signInWithPassword` mémorise la session dans le client. Si on l'exécute sur
 * le client admin partagé, toutes les requêtes suivantes utilisent le jeton du
 * dernier utilisateur connecté (RLS) : les autres fiches deviennent invisibles
 * et les écritures sont refusées. Ce client ne doit donc jamais être partagé.
 */
export function passwordAuthClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new SupabaseAdminConfigError([!url ? 'SUPABASE_URL' : '', !key ? 'SUPABASE_SERVICE_ROLE_KEY' : ''].filter(Boolean));
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Raised par les fonctions SQL quand la ligne visée n'existe pas. */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /does not exist/i.test(error.message ?? '');
}