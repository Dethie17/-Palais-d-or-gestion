/**
 * Historique des paiements (Espace ISM) — lecture paginée côté serveur
 * et helpers de mise en forme. Les contraintes sur les parents/enfants
 * sont transmises par la page : elles viennent des listes déjà chargées
 * (RLS personnel : la page lit tout, le parent ne voit que ses enfants).
 *
 * Hypothèse de périmètre : la période FILTRE sur `created_at` (l'opération
 * est prise dans la période, qu'elle soit réglée ou en attente) ; la
 * colonne « Date » affiche le paiement réel (paid_at ?? settled_at ??
 * created_at). Les recharges de carte restent hors de cet écran :
 * elles ne sont pas des paiements parents ↔ école.
 */
import { supabase } from '@/lib/supabase';

/** Taille de page du tableau (pagination serveur). */
export const HISTO_PAGE_SIZE = 25;
/** Taille des lots de l'export (le total filtré, pas la page affichée). */
export const HISTO_EXPORT_BATCH = 1000;

export interface HistoriqueFiltres {
  /** Date de début incluse (yyyy-mm-dd), vide = sans borne. */
  du?: string;
  /** Date de fin incluse (yyyy-mm-dd), vide = sans borne. */
  au?: string;
  classe?: string;
  /** Recherche : téléphone, nom ou prénom (parent ou enfant). */
  recherche?: string;
}

export interface PaiementBrut {
  id: string;
  subscriptionId: string | null;
  childId: string | null;
  clientUsername: string | null;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  createdAt: string;
  paidAt: string | null;
  settledAt: string | null;
}

/** Date affichée : le règlement réel, sinon la création de l'opération. */
export function paiementDate(p: Pick<PaiementBrut, 'paidAt' | 'settledAt' | 'createdAt'>): string | null {
  return p.paidAt || p.settledAt || p.createdAt || null;
}

export const PAIEMENTS_STATUS_LABEL: Record<string, string> = {
  paid: 'Payé',
  pending: 'En attente',
  failed: 'Échec',
  cancelled: 'Annulé',
  refunded: 'Remboursé',
};

export function paiementsStatusLabel(status: string): string {
  return PAIEMENTS_STATUS_LABEL[status] ?? status;
}

const MOIS_NOMS: string[] = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** yyyy-MM (mois « payé » d'un abonnement = mois de sa date de début). */
export function moisDeIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « Octobre 2026 » à partir de yyyy-MM ; heure du navigateur (Dakar = GMT). */
export function moisLibelle(mois: string | null | undefined): string {
  if (!mois) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(mois);
  if (!m) return '—';
  return `${MOIS_NOMS[Number(m[2]) - 1] ?? mois} ${m[1]}`;
}

/** JJ/MM/AAAA pour l'affichage et les exports. */
export function formatDateJJMMAAAA(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Contrainte `or` PostgREST : la ligne correspond si le paiement porte
 * l'un des enfants, l'un des abonnements, ou le compte du parent.
 * Identifiants simples (UUID, 9 chiffres) : pas d'échappement nécessaire.
 */
export function contraintePaiements(
  childIds: string[],
  subscriptionIds: string[],
  usernames: string[],
): string | null {
  const parts: string[] = [];
  for (const id of childIds) parts.push(`child_id.eq.${id}`);
  for (const id of subscriptionIds) parts.push(`subscription_id.eq.${id}`);
  for (const u of usernames) parts.push(`client_username.eq.${u}`);
  return parts.length > 0 ? parts.join(',') : null;
}

export interface PaiementsConnections {
  /** Identifiants d'enfants retenus (classe et/ou recherche par nom d'enfant). */
  childIds: string[];
  /** Numéros de parents retenus (recherche par nom de parent ou téléphone). */
  usernames: string[];
}

function baseQueryOr(
  colonnes: string,
  filtres: HistoriqueFiltres,
  conn: PaiementsConnections,
  orConstraint: string | null,
) {
  let q = supabase.from('oresto_payments').select(colonnes, { count: 'exact' });
  if (filtres.du) q = q.gte('created_at', `${filtres.du}T00:00:00Z`);
  if (filtres.au) q = q.lte('created_at', `${filtres.au}T23:59:59Z`);
  if (orConstraint) q = q.or(orConstraint);
  void conn;
  return q
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
}

const PAIEMENTS_COLUMNS =
  'id, subscription_id, child_id, client_username, amount, method, status, ' +
  'reference, created_at, paid_at, settled_at';

type RowBrut = Record<string, unknown>;

function mapRow(r: RowBrut): PaiementBrut {
  return {
    id: String(r.id ?? ''),
    subscriptionId: r.subscription_id ? String(r.subscription_id) : null,
    childId: r.child_id ? String(r.child_id) : null,
    clientUsername: r.client_username ? String(r.client_username) : null,
    amount: Number(r.amount) || 0,
    method: String(r.method ?? ''),
    status: String(r.status ?? ''),
    reference: r.reference ? String(r.reference) : null,
    createdAt: String(r.created_at ?? ''),
    paidAt: r.paid_at ? String(r.paid_at) : null,
    settledAt: r.settled_at ? String(r.settled_at) : null,
  };
}

/** Remontée d'erreur lisible, en français. */
export function paiementsErreurMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Erreur inconnue');
  if (/42P01|PGRST205|does not exist/.test(raw)) {
    return 'La table des paiements n’existe pas encore : ouvrez la base Supabase et exécutez la migration (supabase-o-resto-final-2026.sql).';
  }
  if (/JWT|401|403|permission|permission/i.test(raw)) {
    return 'Accès refusé : connectez-vous avec un compte Espace ISM (DAF).';
  }
  return `Impossible de lire l’historique des paiements : ${raw}`;
}

/** Une page du tableau, avec le total filtré (pour la pagination). */
export async function fetchPaiementsPage(opts: {
  filtres: HistoriqueFiltres;
  conn: PaiementsConnections;
  constraint: string | null;
  page: number;
  pageSize?: number;
}): Promise<{ rows: PaiementBrut[]; total: number }> {
  const pageSize = opts.pageSize ?? HISTO_PAGE_SIZE;
  const from = (opts.page - 1) * pageSize;
  const q = baseQueryOr(PAIEMENTS_COLUMNS, opts.filtres, opts.conn, opts.constraint).range(from, from + pageSize - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const dataRows: RowBrut[] = Array.isArray(data) ? (data as unknown as RowBrut[]) : [];
  const total = count ?? dataRows.length;
  return { rows: dataRows.map(mapRow), total };
}

/** TOUTES les lignes filtrées (export), par lots. */
export async function fetchTousPaiements(opts: {
  filtres: HistoriqueFiltres;
  conn: PaiementsConnections;
  constraint: string | null;
  maxRows?: number;
}): Promise<PaiementBrut[]> {
  const max = opts.maxRows ?? 20000;
  const all: PaiementBrut[] = [];
  while (all.length < max) {
    const q = baseQueryOr(PAIEMENTS_COLUMNS, opts.filtres, opts.conn, opts.constraint).range(
      all.length,
      all.length + HISTO_EXPORT_BATCH - 1,
    );
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rowsRaw: RowBrut[] = Array.isArray(data) ? (data as unknown as RowBrut[]) : [];
    const rows = rowsRaw.map(mapRow);
    all.push(...rows);
    if (rows.length < HISTO_EXPORT_BATCH) break;
  }
  return all.slice(0, max);
}
