import { supabase } from '@/lib/supabase';
import type {
  DangoteApiResponse,
  DangoteAuditLog,
  DangoteBudget,
  DangoteCategorie,
  DangoteDashboard,
  DangoteEmploye,
  DangoteFacture,
  DangoteLedger,
  DangoteMenu,
  DangoteMenuPlat,
  DangotePaiement,
  DangoteParametres,
  DangotePlat,
  DangoteRepas,
  DangoteStats,
} from '@/types/dangote';

export interface DangoteRange {
  debut: string;
  fin: string;
}

interface DbError {
  code?: string;
  message?: string;
}

export function isDangoteSchemaMissing(error: DbError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205'
    || error.code === '42P01'
    || /could not find the table|relation .* does not exist/i.test(error.message ?? '')
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDateFr(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTimeFr(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatMoney(value: number | string | null | undefined, devise = 'FCFA'): string {
  const n = Number(value ?? 0);
  return `${(Number.isFinite(n) ? n : 0).toLocaleString('fr-FR')} ${devise}`;
}

export function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function employeeName(employe: Pick<DangoteEmploye, 'prenom' | 'nom'> | null | undefined): string {
  if (!employe) return 'Employé inconnu';
  return `${employe.prenom ?? ''} ${employe.nom ?? ''}`.trim();
}

export function employeeInitials(employe: Pick<DangoteEmploye, 'prenom' | 'nom'> | null | undefined): string {
  if (!employe) return '?';
  return `${(employe.prenom ?? '').charAt(0)}${(employe.nom ?? '').charAt(0)}`.toUpperCase();
}

/** Appel authentifié de l'API Dangote. */
export async function dangoteApi<T = DangoteApiResponse>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  } catch {
    /* la fonction répondra 401 */
  }

  let response: Response;
  try {
    response = await fetch('/api/dangote', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Module Dangote injoignable. Vérifiez votre connexion et réessayez.');
  }

  let body: DangoteApiResponse = {};
  try {
    body = (await response.json()) as DangoteApiResponse;
  } catch {
    if (!response.ok) throw new Error(`Le serveur a répondu ${response.status}.`);
  }

  if (!response.ok || body.ok === false) {
    const error = new Error(body.error ?? body.message ?? `Opération refusée (${response.status}).`) as Error & {
      outcome?: string;
      payload?: DangoteApiResponse;
    };
    error.outcome = body.outcome;
    error.payload = body;
    throw error;
  }

  return body as T;
}

async function rows<T>(
  query: PromiseLike<{ data: unknown; error: DbError | null }>,
): Promise<{ rows: T[]; error: DbError | null }> {
  const { data, error } = await query;
  return { rows: (data as T[] | null) ?? [], error };
}

async function one<T>(
  query: PromiseLike<{ data: unknown; error: DbError | null }>,
): Promise<{ row: T | null; error: DbError | null }> {
  const { data, error } = await query;
  return { row: (data as T | null) ?? null, error };
}

/**
 * Charge tout ce dont les écrans Dangote ont besoin.
 *
 * Les erreurs de schéma ne sont pas masquées : `schemaReady=false` permet
 * d'afficher un bandeau « exécutez supabase-dangote-pro.sql » au lieu d'une
 * page vide incompréhensible.
 */
export async function fetchDangoteDashboard(
  entiteId: string,
  range?: DangoteRange,
): Promise<DangoteDashboard> {
  const empty: DangoteDashboard = {
    parametres: null,
    budget: null,
    employes: [],
    repas: [],
    ledger: [],
    menus: [],
    menuPlats: [],
    categories: [],
    plats: [],
    paiements: [],
    factures: [],
    audit: [],
    stats: null,
    schemaReady: false,
    error: null,
  };
  if (!entiteId) {
    return { ...empty, error: 'Aucune entité Dangote associée à ce compte.' };
  }

  const debut = range?.debut ?? todayIso();
  const fin = range?.fin ?? todayIso();

  const [params, budget, employes, repas, ledger, menus, categories, plats, paiements, factures, audit] = await Promise.all([
    one<DangoteParametres>(
      supabase.from('dangote_parametres').select('*').eq('entite_id', entiteId).maybeSingle(),
    ),
    one<DangoteBudget>(
      supabase.from('dangote_budget').select('*').eq('entite_id', entiteId).maybeSingle(),
    ),
    rows<DangoteEmploye>(
      supabase.from('dangote_employes').select('*').eq('entite_id', entiteId).order('nom', { ascending: true }),
    ),
    rows<DangoteRepas>(
      supabase
        .from('dangote_repas')
        .select('*')
        .eq('entite_id', entiteId)
        .gte('date_jour', debut)
        .lte('date_jour', fin)
        .order('created_at', { ascending: false }),
    ),
    rows<DangoteLedger>(
      supabase
        .from('dangote_credit_ledger')
        .select('*')
        .eq('entite_id', entiteId)
        .order('created_at', { ascending: false })
        .limit(120),
    ),
    rows<DangoteMenu>(
      supabase
        .from('dangote_menus')
        .select('*')
        .eq('entite_id', entiteId)
        .gte('date_jour', shiftDate(todayIso(), -60))
        .lte('date_jour', shiftDate(todayIso(), 30))
        .order('date_jour', { ascending: false }),
    ),
    rows<DangoteCategorie>(
      supabase.from('dangote_categories').select('*').eq('entite_id', entiteId).order('ordre', { ascending: true }),
    ),
    rows<DangotePlat>(
      supabase.from('dangote_plats').select('*').eq('entite_id', entiteId).order('nom', { ascending: true }),
    ),
    rows<DangotePaiement>(
      supabase
        .from('dangote_paiements')
        .select('*')
        .eq('entite_id', entiteId)
        .order('created_at', { ascending: false })
        .limit(40),
    ),
    rows<DangoteFacture>(
      supabase
        .from('dangote_factures')
        .select('*')
        .eq('entite_id', entiteId)
        .order('created_at', { ascending: false })
        .limit(20),
    ),
    rows<DangoteAuditLog>(
      supabase
        .from('dangote_audit_log')
        .select('*')
        .eq('entite_id', entiteId)
        .order('created_at', { ascending: false })
        .limit(60),
    ),
  ]);

  const firstError = params.error ?? budget.error ?? employes.error ?? repas.error
    ?? ledger.error ?? menus.error ?? categories.error ?? plats.error
    ?? paiements.error ?? factures.error ?? audit.error;
  const schemaReady = !isDangoteSchemaMissing(firstError);

  let menuPlats: DangoteMenuPlat[] = [];
  if (menus.rows.length > 0) {
    const menuIds = menus.rows.map((menu) => menu.id);
    const result = await rows<DangoteMenuPlat>(
      supabase.from('dangote_menu_plats').select('menu_id,plat_id,quantite').in('menu_id', menuIds),
    );
    menuPlats = result.rows;
  }

  let stats: DangoteStats | null = null;
  if (schemaReady) {
    const { data, error } = await supabase.rpc('dangote_stats', {
      p_entite_id: entiteId,
      p_debut: debut,
      p_fin: fin,
    });
    if (!error && data) stats = data as DangoteStats;
  }

  return {
    parametres: params.row,
    budget: budget.row,
    employes: employes.rows,
    repas: repas.rows,
    ledger: ledger.rows,
    menus: menus.rows,
    menuPlats,
    categories: categories.rows,
    plats: plats.rows,
    paiements: paiements.rows,
    factures: factures.rows,
    audit: audit.rows,
    stats,
    schemaReady,
    error: schemaReady ? null : 'Module Dangote Pro non installé. Exécutez supabase-dangote-pro.sql dans Supabase.',
  };
}

/** Recharge uniquement les données utiles après une action. */
export async function reloadDangoteDashboard(
  entiteId: string,
  range?: DangoteRange,
): Promise<DangoteDashboard> {
  return fetchDangoteDashboard(entiteId, range);
}

export interface DangoteEmployeePortal {
  employe: DangoteEmploye | null;
  parametres: DangoteParametres | null;
  repas: DangoteRepas[];
  menus: DangoteMenu[];
  menuPlats: DangoteMenuPlat[];
  plats: DangotePlat[];
  categories: DangoteCategorie[];
  schemaReady: boolean;
  error: string | null;
}

/**
 * Portail employé : ne lit que ce que la RLS autorise (sa fiche, ses repas,
 * les menus et le catalogue). Évite de requêter le budget et les autres
 * employés, que l'employé n'a pas le droit de voir.
 */
export async function fetchDangoteEmployeePortal(
  entiteId: string,
  username?: string,
): Promise<DangoteEmployeePortal> {
  const empty: DangoteEmployeePortal = {
    employe: null,
    parametres: null,
    repas: [],
    menus: [],
    menuPlats: [],
    plats: [],
    categories: [],
    schemaReady: false,
    error: null,
  };
  if (!entiteId) return { ...empty, error: 'Aucune entité Dangote associée à ce compte.' };

  const { data: authData } = await supabase.auth.getUser();
  const uid = authData.user?.id ?? null;

  let employe: DangoteEmploye | null = null;
  let lookupError: DbError | null = null;
  if (uid) {
    const result = await one<DangoteEmploye>(
      supabase.from('dangote_employes').select('*').eq('user_id', uid).maybeSingle(),
    );
    employe = result.row;
    lookupError = result.error;
  }
  if (!employe && username) {
    const result = await one<DangoteEmploye>(
      supabase.from('dangote_employes').select('*').eq('entite_id', entiteId).eq('matricule', username).maybeSingle(),
    );
    employe = result.row;
    lookupError = lookupError ?? result.error;
  }

  if (lookupError && isDangoteSchemaMissing(lookupError)) {
    return {
      ...empty,
      error: 'Module Dangote Pro non installé. Exécutez supabase-dangote-pro.sql dans Supabase.',
    };
  }
  if (!employe) {
    return { ...empty, schemaReady: true, error: 'Aucune fiche employé liée à ce compte.' };
  }

  const [params, repas, menus, categories, plats] = await Promise.all([
    one<DangoteParametres>(
      supabase.from('dangote_parametres').select('*').eq('entite_id', entiteId).maybeSingle(),
    ),
    rows<DangoteRepas>(
      supabase
        .from('dangote_repas')
        .select('*')
        .eq('employe_id', employe.id)
        .gte('date_jour', shiftDate(todayIso(), -90))
        .order('created_at', { ascending: false }),
    ),
    rows<DangoteMenu>(
      supabase
        .from('dangote_menus')
        .select('*')
        .eq('entite_id', entiteId)
        .gte('date_jour', shiftDate(todayIso(), -7))
        .lte('date_jour', shiftDate(todayIso(), 7))
        .order('date_jour', { ascending: true }),
    ),
    rows<DangoteCategorie>(
      supabase.from('dangote_categories').select('*').eq('entite_id', entiteId).order('ordre', { ascending: true }),
    ),
    rows<DangotePlat>(
      supabase.from('dangote_plats').select('*').eq('entite_id', entiteId).order('nom', { ascending: true }),
    ),
  ]);

  let menuPlats: DangoteMenuPlat[] = [];
  if (menus.rows.length > 0) {
    const result = await rows<DangoteMenuPlat>(
      supabase
        .from('dangote_menu_plats')
        .select('menu_id,plat_id,quantite')
        .in('menu_id', menus.rows.map((menu) => menu.id)),
    );
    menuPlats = result.rows;
  }

  const firstError = params.error ?? repas.error ?? menus.error
    ?? categories.error ?? plats.error;
  const schemaReady = !isDangoteSchemaMissing(firstError);

  return {
    employe,
    parametres: params.row,
    repas: repas.rows,
    menus: menus.rows,
    menuPlats,
    plats: plats.rows,
    categories: categories.rows,
    schemaReady,
    error: schemaReady ? null : 'Module Dangote Pro non installé. Exécutez supabase-dangote-pro.sql dans Supabase.',
  };
}

export function downloadCsv(filename: string, lines: string[][]): void {
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = lines.map((line) => line.map(escape).join(';')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function statutRepasLabel(statut: string): string {
  return statut === 'annule' ? 'Annulé' : 'Validé';
}

export function moyenPaiementLabel(methode: string): string {
  switch (methode) {
    case 'wave': return 'Wave';
    case 'mobile_money': return 'Orange Money';
    case 'card': return 'Carte bancaire';
    case 'cash': return 'Espèces';
    case 'virement': return 'Virement';
    default: return methode;
  }
}

export function statutPaiementLabel(statut: string): string {
  switch (statut) {
    case 'paid': return 'Payé';
    case 'failed': return 'Échoué';
    case 'cancelled': return 'Annulé';
    default: return 'En attente';
  }
}
