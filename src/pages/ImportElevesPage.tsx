import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import {
  PARENT_IMPORT_HEADERS,
  MAX_FILE_BYTES,
  analyzeParentImport,
  buildParentTemplateBlob,
  normalizePhoneDigits,
  parseParentImportFile,
  type ParentImportRow,
  type RowIssue,
} from '@/lib/excelImport';
import { postAdminJson } from '@/lib/adminApi';
import { recordImportBatch, fetchImportBatches, type ImportBatchRow } from '@/lib/importBatches';
import { toSheetData } from '@/lib/excelImport';
import { CYCLES, cycleOfClass, CYCLE_LABEL } from '@/lib/schoolCycles';
import writeXlsxFile from 'write-excel-file';
import type { SchoolCycle } from '@/types/menu';
import {
  Upload, FileSpreadsheet, Download, CheckCircle,
  XCircle, Loader2, ShieldCheck, UserPlus, SkipForward,
  Phone, Plus, KeyRound, History,
} from 'lucide-react';

/**
 * Import des parents depuis Excel — administrateur uniquement.
 *
 * La DAF enregistre les parents (nom, prénom, téléphone). Le numéro EST
 * l'identifiant de connexion : aucun mot de passe n'est créé, affiché ni
 * communiqué. Saisie manuelle ou fichier Excel. Les élèves ne sont PAS
 * importés ici : ils sont créés automatiquement avec leur parent.
 */
interface ReportEntry {
  line: number;
  label: string;
  status: 'created' | 'duplicate' | 'error';
  detail: string;
}

interface ParentResultRow {
  phone: string;
  name: string;
  reason?: string;
}

interface CreateParentPayload {
  ok?: boolean;
  error?: string;
  created?: ParentResultRow[];
  activated?: ParentResultRow[];
  duplicates?: ParentResultRow[];
  errors?: ParentResultRow[];
}

interface ParentReportEntry {
  line: number;
  label: string;
  phone: string;
  status: 'created' | 'activated' | 'duplicate' | 'error';
  detail: string;
}

const PARENT_BATCH = 100;

const STATUT_RAPPORT: Record<string, string> = {
  created: 'Créé',
  activated: 'Activé',
  duplicate: 'Doublon ignoré',
  error: 'Erreur',
};

/** Rapport d'import en Excel (une ligne du rapport = une ligne du fichier). */
const downloadReportXlsx = async (
  fileName: string,
  rows: { line: number; label: string; status: string; detail: string }[],
) => {
  const sheet = toSheetData([
    ['Rapport d’import — O RESTO', new Date().toISOString().slice(0, 10)],
    [],
    ['Ligne', 'Parent / élève', 'Statut', 'Détail'],
    ...rows.map((r) => [r.line, r.label || '—', STATUT_RAPPORT[r.status] ?? r.status, r.detail]),
  ]);
  const blob = await writeXlsxFile(sheet, {
    sheet: 'Rapport',
    columns: [10, 32, 18, 56].map((w) => ({ width: w })),
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/** 771234567 → « 77 123 45 67 » (affichage seulement). */
function formatPhone(value: string): string {
  const d = normalizePhoneDigits(value);
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : value;
}

const ImportElevesPage = () => {
  const { user } = useAuth();
  const {
    parentProfiles, children: allChildren, importStudentRow, refreshRemote,
  } = useResto();
  /** Recharge l'historique après chaque import fini. */
  const [historyKey, setHistoryKey] = useState(0);
  const bumpHistory = () => setHistoryKey((k) => k + 1);

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-red-500" />
          <p className="mt-2 font-bold text-red-800">Réservé à la Direction.</p>
          <p className="mt-1 text-sm text-red-600">L’import d’élèves et de parents est une opération sensible : seul un compte administrateur y accède.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 flex items-center gap-2">
        <FileSpreadsheet className="w-7 h-7 text-emerald-700" /> Import
      </h1>
      <p className="text-sm text-slate-500 mt-1">
        Parents : le numéro de téléphone est l’identifiant de connexion — aucun mot de passe.
        Les élèves sont créés automatiquement avec leur parent.
      </p>

      <ParentsImport
        parentProfiles={parentProfiles}
        children={allChildren}
        refreshRemote={refreshRemote}
        importedBy={user?.username ?? null}
        onFinished={bumpHistory}
        importStudentRow={importStudentRow}
      />

      <ImportHistory refreshKey={historyKey} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Historique des imports (table import_batches)                       */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = {
  students: 'Élèves',
  parents: 'Parents',
};

/**
 * Journal des derniers imports : date, type, effectifs, opérateur.
 * Table absente (migration pas encore exécutée) → section silencieusement
 * masquée : l'historique ne doit jamais gêner le travail.
 */
function ImportHistory({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<ImportBatchRow[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchImportBatches(10).then((res) => {
      if (!alive) return;
      setRows(res.rows);
      setVisible(!res.missing && res.rows.length > 0);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [refreshKey]);

  if (!visible) return loading ? null : null;

  return (
    <section className="mt-10" data-testid="import-history">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <History className="w-5 h-5 text-emerald-700" /> Historique des imports
      </h2>
      <p className="text-sm text-slate-500 mt-1">Derniers imports enregistrés, avec effectifs par statut.</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Lignes</th>
              <th className="px-4 py-3 text-right">Créés</th>
              <th className="px-4 py-3 text-right">Doublons</th>
              <th className="px-4 py-3 text-right">Erreurs</th>
              <th className="px-4 py-3">Par</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-slate-600">
                  {new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-700">{KIND_LABEL[r.kind] ?? r.kind}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.total_rows}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-bold">{r.created_count}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-700">{r.duplicate_count}</td>
                <td className="px-4 py-3 text-right tabular-nums text-red-600">{r.error_count}</td>
                <td className="px-4 py-3 text-slate-500">{r.created_by ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet parents                                                      */
/* ------------------------------------------------------------------ */

function ParentsImport({
  parentProfiles,
  children,
  refreshRemote,
  importedBy,
  onFinished,
  importStudentRow,
}: {
  parentProfiles: { parentUsername: string; firstName: string; lastName: string; phone: string }[];
  children: { parentUsername: string; firstName: string; lastName: string }[];
  refreshRemote: () => Promise<void>;
  /** Compte qui fait l'import (traçabilité du journal). */
  importedBy: string | null;
  onFinished: () => void;
  importStudentRow: (row: {
    parentUsername: string;
    parentNom: string;
    parentPrenom: string;
    parentTel: string;
    prenom: string;
    nom: string;
    classe: string;
    cycle: SchoolCycle;
  }) => Promise<{ childId: string; parentCreated: boolean; duplicate: boolean }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Saisie manuelle
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // « Créer mon enfant » sur une fiche parent (saisie manuelle).
  const [childOf, setChildOf] = useState<string | null>(null);
  const [childFirst, setChildFirst] = useState('');
  const [childLast, setChildLast] = useState('');
  const [childClass, setChildClass] = useState('');
  const [childSaving, setChildSaving] = useState(false);
  const [childNote, setChildNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Fichier Excel
  const [fileName, setFileName] = useState<string | null>(null);
  const [parentRows, setParentRows] = useState<ParentImportRow[]>([]);
  const [parseIssues, setParseIssues] = useState<RowIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<ParentReportEntry[] | null>(null);

  const existingPhones = useMemo(() => {
    const set = new Set<string>();
    for (const p of parentProfiles) {
      const fromName = normalizePhoneDigits(p.parentUsername);
      if (/^[67]\d{8}$/.test(fromName)) set.add(fromName);
      const fromPhone = normalizePhoneDigits(p.phone);
      if (/^[67]\d{8}$/.test(fromPhone)) set.add(fromPhone);
    }
    return set;
  }, [parentProfiles]);

  const analysis = useMemo(
    () => (parentRows.length > 0 ? analyzeParentImport(parentRows, existingPhones) : null),
    [parentRows, existingPhones],
  );

  const childrenOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const child of children) {
      const list = map.get(child.parentUsername) ?? [];
      list.push(`${child.firstName} ${child.lastName}`);
      map.set(child.parentUsername, list);
    }
    return map;
  }, [children]);

  const sortedParents = useMemo(
    () => [...parentProfiles].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')),
    [parentProfiles],
  );

  const downloadTemplate = async () => {
    const url = URL.createObjectURL(await buildParentTemplateBlob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-parents.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const digits = normalizePhoneDigits(phone);
    if (!firstName.trim() || !lastName.trim()) {
      setMessage({ kind: 'error', text: 'Prénom et nom du parent requis.' });
      return;
    }
    if (!/^[67]\d{8}$/.test(digits)) {
      setMessage({ kind: 'error', text: 'Numéro invalide : 9 chiffres (ex : 77 123 45 67).' });
      return;
    }
    setAdding(true);
    try {
      const res = await postAdminJson<CreateParentPayload>('/api/auth/create-parent', {
        parents: [{ firstName: firstName.trim(), lastName: lastName.trim(), phone: digits }],
      });
      if (!res.ok || !res.data) {
        setMessage({ kind: 'error', text: res.error ?? 'Création impossible.' });
        return;
      }
      const created = res.data.created?.[0] ?? res.data.activated?.[0];
      if (created || res.data.duplicates?.[0] || res.data.errors?.[0]) {
        void recordImportBatch({
          kind: 'parents',
          totalRows: 1,
          createdCount: created ? 1 : 0,
          duplicateCount: created ? 0 : res.data.duplicates?.length ?? 0,
          errorCount: created ? 0 : res.data.errors?.length ?? 0,
          createdBy: importedBy,
        });
      }
      if (created) {
        setMessage({
          kind: 'ok',
          text: `Accès ${res.data.created?.[0] ? 'créé' : 'activé'} pour ${created.name} — identifiant : ${formatPhone(created.phone)}. Aucun mot de passe : le parent entre avec ce numéro.`,
        });
        setFirstName('');
        setLastName('');
        setPhone('');
        void refreshRemote();
      } else if (res.data.duplicates?.[0]) {
        setMessage({ kind: 'error', text: 'Ce numéro est déjà enregistré et actif.' });
      } else {
        setMessage({ kind: 'error', text: res.data.errors?.[0]?.reason ?? 'Création impossible.' });
      }
    } finally {
      setAdding(false);
    }
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setReport(null);
    setParentRows([]);
    setParseIssues([]);
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParseError('Fichier trop volumineux (5 Mo maximum).');
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseParentImportFile(file);
      setParentRows(parsed.rows);
      setParseIssues(parsed.issues);
      if (parsed.rows.length === 0 && parsed.issues.length === 0) {
        setParseError('Aucun parent trouvé dans ce fichier.');
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Lecture du fichier impossible.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!analysis || analysis.toCreate.length === 0 || importing) return;
    setImporting(true);
    setReport(null);
    const entries: ParentReportEntry[] = analysis.duplicates.map((d) => ({
      line: d.line, label: '', phone: '', status: 'duplicate' as const, detail: d.reason,
    }));
    const list = analysis.toCreate;
    setProgress({ done: 0, total: list.length });
    let done = 0;
    for (let i = 0; i < list.length; i += PARENT_BATCH) {
      const chunk = list.slice(i, i + PARENT_BATCH);
      const res = await postAdminJson<CreateParentPayload>('/api/auth/create-parent', {
        parents: chunk.map((row) => ({
          firstName: row.prenom,
          lastName: row.nom,
          phone: row.telephone,
        })),
      });
      if (!res.ok || !res.data) {
        chunk.forEach((row) => entries.push({
          line: row.line,
          label: `${row.prenom} ${row.nom}`,
          phone: row.telephone,
          status: 'error',
          detail: res.error ?? 'Écriture impossible.',
        }));
      } else {
        const lineOf = new Map(chunk.map((row) => [row.telephone, row.line]));
        const collect = (rows: ParentResultRow[] | undefined, status: ParentReportEntry['status'], fallback: string) => {
          for (const row of rows ?? []) {
            entries.push({
              line: lineOf.get(row.phone) ?? 0,
              label: row.name,
              phone: row.phone,
              status,
              detail: row.reason ?? fallback,
            });
          }
        };
        collect(res.data.created, 'created', 'Accès créé.');
        collect(res.data.activated, 'activated', 'Accès activé (fiche existante).');
        collect(res.data.duplicates, 'duplicate', 'Compte déjà actif.');
        collect(res.data.errors, 'error', 'Création impossible.');
      }
      done += chunk.length;
      setProgress({ done, total: list.length });
    }
    entries.sort((a, b) => a.line - b.line);
    setReport(entries);
    setImporting(false);
    // Journal : créés = accès créés ou activés (l'effet métier est le même).
    void recordImportBatch({
      kind: 'parents',
      totalRows: analysis.duplicates.length + list.length,
      createdCount: entries.filter((e) => e.status === 'created' || e.status === 'activated').length,
      duplicateCount: entries.filter((e) => e.status === 'duplicate').length,
      errorCount: entries.filter((e) => e.status === 'error').length,
      createdBy: importedBy,
    });
    onFinished();
    if (entries.some((e) => e.status === 'created' || e.status === 'activated')) void refreshRemote();
  };

  const countOf = (status: ParentReportEntry['status']) => report?.filter((r) => r.status === status).length ?? 0;

  const downloadParentReport = () => downloadReportXlsx('rapport-import-parents.xlsx', report ?? []);

  /**
   * « Créer mon enfant » depuis la fiche d'un parent existant : la
   * fonction d'import élèves fait tout (parent déjà présent ici, donc
   * simple enregistrement de l'enfant + génération de sa carte QR).
   */
  const handleAddChild = async (username: string) => {
    setMessage(null);
    if (!childFirst.trim() || !childLast.trim()) {
      setChildNote({ kind: 'error', text: 'Prénom et nom de l’enfant requis.' });
      return;
    }
    if (!childClass) {
      setChildNote({ kind: 'error', text: 'Choisissez la classe de l’enfant.' });
      return;
    }
    setChildSaving(true);
    setChildNote(null);
    try {
      const profile = parentProfiles.find((p) => p.parentUsername === username);
      const res = await importStudentRow({
        parentUsername: username,
        parentNom: profile?.lastName ?? '',
        parentPrenom: profile?.firstName ?? '',
        parentTel: profile?.phone && /^\d{9}$/.test(profile.phone) ? profile.phone : username,
        prenom: childFirst.trim(),
        nom: childLast.trim(),
        classe: childClass,
        cycle: cycleOfClass(childClass),
      });
      if (res.duplicate) {
        setChildNote({ kind: 'ok', text: 'Cet enfant est déjà inscrit — aucune fiche ajoutée.' });
      } else {
        setChildNote({ kind: 'ok', text: 'Enfant inscrit : sa carte QR est prête (voir l’onglet Élèves ou la fiche du prochain scan).' });
        void recordImportBatch({
          kind: 'students',
          totalRows: 1,
          createdCount: 1,
          duplicateCount: 0,
          errorCount: 0,
          createdBy: importedBy,
        });
        onFinished();
        void refreshRemote();
        setChildFirst('');
        setChildLast('');
        setChildClass('');
        setChildOf(null);
      }
    } catch (err) {
      setChildNote({ kind: 'error', text: err instanceof Error ? err.message : 'Création impossible.' });
    } finally {
      setChildSaving(false);
    }
  };

  /**
   * Parents à qui il manque l'ACCÈS par numéro.
   *
   * Ce sont les fiches anciennes : le parent existe (nom, prénom, téléphone,
   * enfants) mais son identifiant est un ancien pseudo (« doudou66 »), pas
   * son numéro. Il ne peut donc pas se connecter à l'Espace Abonné.
   *
   * Un clic les bascule : l'API crée le compte Auth au numéro, rattache les
   * enfants à la nouvelle clé et supprime la fiche héritée.
   */
  const pendingAccess = useMemo(
    () =>
      parentProfiles
        .filter((p) => {
          const identifiant = normalizePhoneDigits(p.parentUsername);
          const tel = normalizePhoneDigits(p.phone);
          return (
            !/^[67]\d{8}$/.test(identifiant) && /^[67]\d{8}$/.test(tel)
          );
        })
        .map((p) => ({
          ancien: p.parentUsername,
          phone: normalizePhoneDigits(p.phone),
          firstName: p.firstName,
          lastName: p.lastName,
        })),
    [parentProfiles],
  );

  const [activating, setActivating] = useState(false);
  const [activateReport, setActivateReport] = useState<string | null>(null);

  const activateAll = async () => {
    if (pendingAccess.length === 0 || activating) return;
    setActivating(true);
    setActivateReport(null);
    let ok = 0;
    let ko = 0;
    for (const p of pendingAccess) {
      const res = await postAdminJson<CreateParentPayload>('/api/auth/create-parent', {
        parents: [{ firstName: p.firstName, lastName: p.lastName, phone: p.phone }],
      });
      if (res.ok && res.data) ok += 1;
      else ko += 1;
    }
    setActivateReport(
      ko === 0
        ? `${ok} accès activé(s) — chaque parent se connecte désormais avec son numéro.`
        : `${ok} accès activé(s), ${ko} en échec. Réessayez pour les parents restants.`,
    );
    setActivating(false);
    void refreshRemote();
  };

  return (
    <>
      {/* ---------- Saisie manuelle ---------- */}
      <form onSubmit={handleAdd} className="mt-4 rounded-3xl bg-white border p-5" data-testid="parent-create-form">
        <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-700" /> Enregistrer un parent
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Le téléphone est l’identifiant de connexion. Aucun mot de passe n’est créé.
        </p>
        <div className="mt-3 grid sm:grid-cols-3 gap-2">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={60}
            autoComplete="family-name"
            placeholder="Nom *"
            className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-emerald-600 outline-none"
            required
          />
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={60}
            autoComplete="given-name"
            placeholder="Prénom *"
            className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-emerald-600 outline-none"
            required
          />
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              maxLength={16}
              autoComplete="tel"
              placeholder="77 123 45 67 *"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-emerald-600 outline-none"
              required
            />
          </div>
        </div>
        {message && (
          <p
            role="status"
            className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${message.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={adding}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Créer l’accès
        </button>
      </form>

      {/* ---------- Accès des parents déjà connus ---------- */}
      {pendingAccess.length > 0 && (
        <div className="mt-4 rounded-3xl border-2 border-amber-200 bg-amber-50/60 p-5" data-testid="activate-pending-access">
          <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-600" />{' '}
            {pendingAccess.length} parent(s) ont une fiche mais pas encore d’accès
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Leurs enfants sont déjà inscrits, mais leur identifiant est un ancien
            pseudo et non leur numéro. Un clic le corrige : l’accès est ouvert
            sur le téléphone, les enfants suivent, la famille se connecte avec
            son numéro.
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {pendingAccess.map((p) => (
              <li
                key={p.ancien}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white border border-amber-200 rounded-full px-2.5 py-1 text-slate-700"
              >
                {p.lastName} {p.firstName}
                <span className="font-mono text-slate-400">({p.ancien})</span>
                <span className="text-emerald-700">→ {formatPhone(p.phone)}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={activateAll}
            disabled={activating}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-40"
          >
            {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Activer les {pendingAccess.length} accès
          </button>
          {activateReport && (
            <p role="status" className="mt-2 text-xs font-semibold text-slate-700">
              {activateReport}
            </p>
          )}
        </div>
      )}

      {/* ---------- Import Excel ---------- */}
      <button onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-sm font-bold text-slate-700 hover:border-emerald-500">
        <Download className="w-4 h-4" /> Télécharger le modèle parents
      </button>
      <p className="mt-2 text-xs text-slate-400">Colonnes : {PARENT_IMPORT_HEADERS.join(' · ')}</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className="mt-4 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-all"
      >
        <Upload className="w-8 h-8 mx-auto text-slate-400" />
        <p className="mt-2 font-bold text-slate-700">{fileName ?? 'Déposez le fichier .xlsx ici, ou cliquez pour choisir'}</p>
        <p className="text-xs text-slate-400 mt-1">Nom, prénom et téléphone — aperçu avant écriture.</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {parsing && (
        <p className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture du fichier…
        </p>
      )}
      {parseError && (
        <p className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 flex gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {parseError}
        </p>
      )}

      {analysis && !report && (
        <div className="mt-4 rounded-3xl bg-white border p-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-2xl font-black text-emerald-700 tabular-nums">{analysis.toCreate.length}</p>
              <p className="text-[11px] font-bold text-emerald-600">À créer</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border p-3">
              <p className="text-2xl font-black text-slate-700 tabular-nums">{analysis.duplicates.length}</p>
              <p className="text-[11px] font-bold text-slate-500">Déjà enregistrés</p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-200 p-3">
              <p className="text-2xl font-black text-red-600 tabular-nums">{parseIssues.length}</p>
              <p className="text-[11px] font-bold text-red-500">Lignes en erreur</p>
            </div>
          </div>

          {analysis.toCreate.length > 0 && (
            <div className="mt-3 rounded-2xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Ligne</th>
                    <th className="px-3 py-2 text-left">Parent</th>
                    <th className="px-3 py-2 text-left">Téléphone (identifiant)</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.toCreate.slice(0, 200).map((row) => (
                    <tr key={row.line} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-400 tabular-nums">{row.line}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-800">{row.prenom} {row.nom}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-700">{formatPhone(row.telephone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {analysis.duplicates.length > 0 && (
            <ul className="mt-3 text-xs text-slate-500 space-y-1 max-h-32 overflow-y-auto">
              {analysis.duplicates.slice(0, 10).map((d, i) => (
                <li key={i} className="flex gap-1.5"><SkipForward className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> Ligne {d.line} : {d.reason}</li>
              ))}
              {analysis.duplicates.length > 10 && <li>… et {analysis.duplicates.length - 10} autres.</li>}
            </ul>
          )}
          {parseIssues.length > 0 && (
            <ul className="mt-3 text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
              {parseIssues.slice(0, 10).map((d, i) => (
                <li key={i}>Ligne {d.line} : {d.message}</li>
              ))}
              {parseIssues.length > 10 && <li>… et {parseIssues.length - 10} autres.</li>}
            </ul>
          )}

          <button
            onClick={handleConfirm}
            disabled={importing || analysis.toCreate.length === 0}
            className="mt-4 w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Création {progress.done}/{progress.total}…</>
              : <><UserPlus className="w-4 h-4" /> Confirmer : créer {analysis.toCreate.length} accès parent{analysis.toCreate.length > 1 ? 's' : ''}</>}
          </button>
        </div>
      )}

      {report && (
        <div className="mt-4 rounded-3xl bg-white border p-5">
          <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" /> Import parents terminé
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">{countOf('created')} accès créés</span>
            {countOf('activated') > 0 && <span className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700">{countOf('activated')} accès activés</span>}
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">{countOf('duplicate')} déjà actifs</span>
            <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-600">{countOf('error')} erreurs</span>
          </div>
          {countOf('error') > 0 && (
            <ul className="mt-3 text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
              {report.filter((r) => r.status === 'error').map((r, i) => (
                <li key={i}>Ligne {r.line} ({r.label || r.phone}) : {r.detail}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3 py-2 flex gap-2">
            <Phone className="w-4 h-4 flex-shrink-0" />
            Les parents se connectent avec leur numéro seul — aucun mot de passe à communiquer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={downloadParentReport} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Télécharger le rapport (Excel)
            </button>
            <button
              onClick={() => { setReport(null); setParentRows([]); setFileName(null); }}
              className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Nouvel import
            </button>
          </div>
        </div>
      )}

      {/* ---------- Parents enregistrés ---------- */}
      <div className="mt-6 rounded-3xl bg-white border overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="font-extrabold text-slate-800 text-sm">Parents enregistrés</h2>
          <span className="text-xs font-bold text-slate-500 tabular-nums">{sortedParents.length}</span>
        </div>
        {sortedParents.length === 0 ? (
          <p className="p-5 text-sm text-slate-400 text-center">Aucun parent enregistré pour le moment.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm" data-testid="parents-table">
              <thead className="text-[11px] uppercase tracking-widest text-slate-500 bg-slate-50/60">
                <tr>
                  <th className="px-4 py-2 text-left">Parent</th>
                  <th className="px-4 py-2 text-left">Identifiant (téléphone)</th>
                  <th className="px-4 py-2 text-left">Enfants</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedParents.map((p) => {
                  const phoneUsername = /^[67]\d{8}$/.test(normalizePhoneDigits(p.parentUsername));
                  const kids = childrenOf.get(p.parentUsername) ?? [];
                  return (
                    <tr key={p.parentUsername} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                        {`${p.lastName} ${p.firstName}`.trim() || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {phoneUsername ? (
                          <span className="tabular-nums text-slate-700">{formatPhone(p.parentUsername)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            {p.parentUsername} · historique
                          </span>
                        )}
                        {p.phone && phoneUsername && (
                          <span className="block text-[11px] text-slate-400">fiche : {formatPhone(p.phone)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {kids.length === 0 ? <span className="text-slate-300">—</span> : (
                          <>
                            {kids.slice(0, 2).join(', ')}
                            {kids.length > 2 && <span className="text-slate-400"> (+{kids.length - 2})</span>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setChildOf(childOf === p.parentUsername ? null : p.parentUsername);
                            setChildFirst('');
                            setChildLast('');
                            setChildClass('');
                            setChildNote(null);
                          }}
                          data-testid={`parent-add-child-${p.parentUsername}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          <Plus className="w-3.5 h-3.5" /> Créer mon enfant
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Créer mon enfant (fiche parent sélectionnée) ---------- */}
      {childOf && (
        <div className="mt-4 rounded-3xl bg-white border border-emerald-200 p-5" data-testid="child-create-panel">
          <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600" /> Créer mon enfant
            <span className="text-xs font-bold text-slate-400">
              — {(() => {
                const selections = parentProfiles.filter((p) => p.parentUsername === childOf);
                const name = selections[0] ? `${selections[0].lastName} ${selections[0].firstName}`.trim() : childOf;
                return name || '—';
              })()}
            </span>
          </h3>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); void handleAddChild(childOf); }}
          >
            <input
              value={childFirst}
              onChange={(e) => setChildFirst(e.target.value)}
              placeholder="Prénom de l’enfant"
              data-testid="child-create-firstname"
              className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-emerald-500 outline-none"
            />
            <input
              value={childLast}
              onChange={(e) => setChildLast(e.target.value)}
              placeholder="Nom de l’enfant"
              data-testid="child-create-lastname"
              className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-emerald-500 outline-none"
            />
            <select
              value={childClass}
              onChange={(e) => setChildClass(e.target.value)}
              data-testid="child-create-classe"
              className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm bg-white focus:border-emerald-500 outline-none"
            >
              <option value="">Classe…</option>
              {CYCLES.map((c) => (
                <optgroup key={c.id} label={CYCLE_LABEL[c.id]}>
                  {c.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
                </optgroup>
              ))}
            </select>
            <button
              type="submit"
              disabled={childSaving || !childFirst.trim() || !childLast.trim() || !childClass}
              data-testid="child-create-save"
              className="sm:col-span-3 mt-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {childSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
                : <><UserPlus className="w-4 h-4" /> Inscrire cet enfant (carte QR automatique)</>}
            </button>
          </form>
          {childNote && (
            <p className={`mt-3 text-xs font-semibold px-3 py-2 rounded-xl border ${childNote.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {childNote.text}
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            L’enfant hérite du compte du parent : son identifiant reste le numéro du parent, sa carte QR est générée automatiquement.
          </p>
        </div>
      )}
    </>
  );
}

export default ImportElevesPage;
