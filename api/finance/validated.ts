/**
 * GET /api/finance/validated
 *
 * Source de vérité de la comptabilité : les paiements VALIDÉS.
 *
 * Règle unique, appliquée côté base par la vue `v_paiements_valides` :
 *
 *     status = 'paid' AND settled_at IS NOT NULL
 *
 * Un paiement « payé » sans horodatage de règlement n'est pas comptabilisé :
 * le statut seul est modifiable depuis un navigateur, l'horodatage non.
 *
 * DÉGRADATION
 *
 * Tant que la migration (supabase-parents-import.sql) n'est pas appliquée,
 * la vue et la colonne `settled_at` n'existent pas. La route le signale
 * alors (`validated: false`) au lieu d'renvoyer un chiffre faux : le
 * client garde son calcul local, qui n'est pas encore filtré.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, isMissingFunction } from '../_lib/supabaseAdmin.js';
import { requireRole, STAFF_OR_ADMIN } from '../_lib/session.js';
import { handlePreflight, methodNotAllowed, sendError, sendJson } from '../_lib/http.js';

interface ValidatedPayment {
  id: string;
  reference: string | null;
  amount: number | null;
  method: string | null;
  status: string | null;
  subscriptionId: string | null;
  clientUsername: string | null;
  formulaId: string | null;
  createdAt: string | null;
  paidAt: string | null;
  settledAt: string | null;
}

const MAX_ROWS = 2000;

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  if (error.code === '42703') return true;
  return /does not exist|column/i.test(error.message ?? '');
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toPayment(row: Record<string, unknown>): ValidatedPayment {
  return {
    id: String(row.id ?? ''),
    reference: str(row.reference),
    amount: num(row.amount),
    method: str(row.method),
    status: str(row.status),
    subscriptionId: str(row.subscription_id),
    clientUsername: str(row.client_username),
    formulaId: str(row.formula_id),
    createdAt: str(row.created_at),
    paidAt: str(row.paid_at),
    settledAt: str(row.settled_at),
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  // La comptabilité n'est ni publique ni réservée aux parents.
  const caller = await requireRole(req, res, STAFF_OR_ADMIN);
  if (!caller) return;

  let db;
  try {
    db = adminClient();
  } catch (err) {
    return sendError(res, 503, (err as Error).message);
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const start = url.searchParams.get('from');
  const end = url.searchParams.get('to');

  // 1) Vue de référence : elle porte déjà la règle de validation.
  let source = 'view';
  let rows: Record<string, unknown>[] = [];
  const view = await db
    .from('v_paiements_valides')
    .select('*')
    .order('settled_at', { ascending: false })
    .limit(MAX_ROWS);

  if (!view.error) {
    rows = (view.data ?? []) as Record<string, unknown>[];
  } else if (isMissingRelation(view.error)) {
    // 2) Repli : la vue n'existe pas encore (migration non appliquée).
    //    On lit la table et on applique nous-mêmes la règle.
    source = 'table';
    const table = await db
      .from('oresto_payments')
      .select('id, reference, amount, method, status, subscription_id, client_username, formula_id, created_at, paid_at, settled_at')
      .eq('status', 'paid')
      .limit(MAX_ROWS);
    if (table.error) {
      // La colonne settled_at n'existe pas : rien ne peut être validé.
      if (table.error.code === '42703') {
        return sendJson(res, 200, {
          ok: true,
          validated: false,
          source: 'none',
          reason: 'settlement_columns_missing',
          truncated: false,
          payments: [],
          kpis: null,
        });
      }
      console.error('[finance/validated] lecture impossible :', table.error.message);
      return sendError(res, 503, 'Les paiements validés sont indisponibles pour le moment.', { retryable: true });
    }
    rows = ((table.data ?? []) as Record<string, unknown>[]).filter(
      (r) => typeof r.settled_at === 'string' && r.settled_at.length > 0,
    );
  } else {
    console.error('[finance/validated] lecture impossible :', view.error.message);
    return sendError(res, 503, 'Les paiements validés sont indisponibles pour le moment.', { retryable: true });
  }

  // 3) Restriction de période (la vue est déjà filtrée côté base quand les
  //    RPC existent ; on la refait ici pour un résultat homogène).
  const payments = rows
    .map(toPayment)
    .filter((p) => {
      if (!start) return true;
      const at = p.paidAt ?? p.settledAt ?? p.createdAt;
      if (!at) return false;
      return at.slice(0, 10) >= start;
    })
    .filter((p) => {
      if (!end) return true;
      const at = p.paidAt ?? p.settledAt ?? p.createdAt;
      if (!at) return false;
      return at.slice(0, 10) <= end;
    });

  // 4) KPI : la RPC base est prioritaire, le calcul local sert de repli.
  let kpis: Record<string, unknown> | null = null;
  let kpiSource = 'local';
  const rpc = await db.rpc('rpc_dashboard_kpis');
  if (!rpc.error && rpc.data) {
    kpis = rpc.data as Record<string, unknown>;
    kpiSource = 'sql';
  } else if (rpc.error && !isMissingFunction(rpc.error)) {
    console.warn('[finance/validated] KPI indisponibles :', rpc.error.message);
  }

  if (!kpis) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const sum = (list: ValidatedPayment[]) => list.reduce((s, p) => s + (p.amount ?? 0), 0);
    kpis = {
      ca_jour: sum(payments.filter((p) => (p.paidAt ?? p.settledAt ?? p.createdAt ?? '').slice(0, 10) === today)),
      ca_mois: sum(payments.filter((p) => (p.paidAt ?? p.settledAt ?? p.createdAt ?? '').slice(0, 7) === month)),
      paiements_valides_count: payments.length,
      abonnes_actifs: null,
    };
  }

  return sendJson(res, 200, {
    ok: true,
    validated: true,
    source,
    kpiSource,
    // La lecture est plafonnée : si le plafond est atteint, le client ne
    // doit PAS concluded qu'un paiement absent de la liste n'est pas réglé.
    truncated: rows.length >= MAX_ROWS,
    payments,
    kpis,
  });
}
