/**
 * Registre des imports (table `import_batches`).
 *
 * Chaque import d'élèves ou de parents est tracé : qui, quand, combien créés,
 * combien ignorés en doublon, combien en erreur. La DAF garde ainsi une
 * piste auditable sans devoir conserver les fichiers Excel.
 *
 * Dégradation volontaire : tant que le script SQL qui crée la table n'a pas
 * été exécuté côté Supabase, l'enregistrement échoue silencieusement (note en
 * console). L'import lui-même n'en dépend pas — jamais la trace ne doit
 * bloquer une écriture métier.
 */

import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase';

export type ImportBatchKind = 'students' | 'parents';

export interface ImportBatchRow {
  id: string;
  kind: ImportBatchKind;
  total_rows: number;
  created_count: number;
  duplicate_count: number;
  error_count: number;
  created_by: string | null;
  created_at: string;
}

export interface ImportBatchInput {
  kind: ImportBatchKind;
  totalRows: number;
  createdCount: number;
  duplicateCount: number;
  errorCount: number;
  createdBy: string | null;
}

/** Code d'erreur quand la relation n'existe pas encore (table ou colonne). */
const MISSING_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);

function rowId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `IB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

/**
 * Trace un import terminé. Jamais d'exception : un problème de journal ne
 * doit jamais faire échouer un import réussi côté métier.
 */
export async function recordImportBatch(input: ImportBatchInput): Promise<void> {
  if (!isSupabaseConfigured) return;
  const row = {
    id: rowId(),
    kind: input.kind,
    total_rows: Math.max(0, Math.round(input.totalRows)),
    created_count: Math.max(0, Math.round(input.createdCount)),
    duplicate_count: Math.max(0, Math.round(input.duplicateCount)),
    error_count: Math.max(0, Math.round(input.errorCount)),
    created_by: input.createdBy,
  };
  const { error } = await supabase.from('import_batches').insert(row);
  if (error && !MISSING_CODES.has(error.code ?? '')) {
    console.warn('[import_batches] trace non enregistrée :', error.message);
  }
}

/**
 * Derniers imports enregistrés. `missing: true` quand la table n'existe pas
 * encore — l'UI masque alors la section au lieu d'afficher une erreur.
 */
export async function fetchImportBatches(limit = 10): Promise<{ missing: boolean; rows: ImportBatchRow[] }> {
  if (!isSupabaseConfigured) return { missing: true, rows: [] };
  const { data, error } = await supabase
    .from('import_batches')
    .select('id, kind, total_rows, created_count, duplicate_count, error_count, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (MISSING_CODES.has(error.code ?? '')) return { missing: true, rows: [] };
    console.warn('[import_batches] lecture impossible :', error.message);
    return { missing: false, rows: [] };
  }
  return { missing: false, rows: (data ?? []) as ImportBatchRow[] };
}
