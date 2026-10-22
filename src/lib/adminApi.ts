/**
 * Appels d'administration - création de compte, réinitialisation, import parents.
 *
 * Ces opérations ne peuvent pas passer par le navigateur : fixer le rôle d'un
 * compte exige la clé de service Supabase, qui ne doit jamais quitter le
 * runtime serveur. On appelle donc /api/auth/*, qui s'authentifie, vérifie
 * que l'appelant est bien la direction, puis agit.
 */

import { supabase } from '@/lib/supabase';

export interface AdminActionResult {
  ok: boolean;
  error?: string;
}

export interface AdminJsonResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Appel d'administration avec la réponse complète.
 *
 * Succès = HTTP 2xx ET `ok: true` dans un corps JSON. Un serveur de dev qui
 * renvoie la page HTML (route /api absente) est donc bien traité comme un
 * échec, jamais comme un succès silencieux.
 */
export async function postAdminJson<T extends { ok?: boolean; error?: string }>(
  path: string,
  body: Record<string, unknown>,
): Promise<AdminJsonResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch {
    /* pas de session : la fonction répondra 401 */
  }

  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'Serveur injoignable. Vérifiez votre connexion.' };
  }

  let payload: { ok?: boolean; error?: string } = {};
  try {
    payload = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    return {
      ok: false,
      error:
        response.status === 404
          ? 'Service indisponible : lancez l’application via Vercel (ou `vercel dev`) pour les opérations de compte.'
          : 'Réponse serveur illisible. Réessayez.',
    };
  }

  if (!response.ok || payload.ok !== true) {
    return { ok: false, error: payload.error ?? `Échec (${response.status}).` };
  }
  return { ok: true, data: payload as T };
}

/** Même traitement d'erreur que les appels de paiement : 401/403 inclus. */
export async function postAdminAction(
  path: string,
  body: Record<string, unknown>,
): Promise<AdminActionResult> {
  const result = await postAdminJson(path, body);
  return { ok: result.ok, error: result.error };
}
