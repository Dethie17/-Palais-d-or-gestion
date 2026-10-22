import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import {
  IMPORT_HEADERS,
  PARENT_IMPORT_HEADERS,
  MAX_FILE_BYTES,
  analyzeImport,
  analyzeParentImport,
  buildParentTemplateBlob,
  buildTemplateBlob,
  duplicateKey,
  normalizePhoneDigits,
  parseImportFile,
  parseParentImportFile,
  type ImportRow,
  type ParentImportRow,
  type RowIssue,
} from '@/lib/excelImport';
import { postAdminJson } from '@/lib/adminApi';
import {
  Upload, FileSpreadsheet, Download, CheckCircle,
  XCircle, Loader2, ShieldCheck, Users, UserPlus, SkipForward,
  UserRound, Phone, Plus, KeyRound,
} from 'lucide-react';

/**
 * Import d'élèves et de parents depuis Excel — administrateur uniquement.
 *
 * Onglet « Import Élèves » : drop → aperçu chiffré → confirmation →
 * écriture vérifiée ligne par ligne → rapport final.
 *
 * Onglet « Import Parent » : la DAF enregistre les parents (nom, prénom,
 * téléphone). Le numéro EST l'identifiant de connexion : aucun mot de passe
 * n'est créé, affiché ni communiqué. Saisie manuelle ou fichier Excel.
 */
interface ReportEntry {
  line: number;
  label: string;
  status: 'created' | 'duplicate' | 'error';
  detail: string;
}

type Tab = 'students' | 'parents';

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
  const [tab, setTab] = useState<Tab>('students');

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
        {tab === 'students'
          ? 'Élèves depuis un fichier Excel : aperçu chiffré avant écriture, doublons ignorés.'
          : 'Parents : le numéro de téléphone est l’identifiant de connexion — aucun mot de passe.'}
      </p>

      <div className="mt-4 inline-flex p-1 rounded-2xl bg-slate-100" role="tablist" aria-label="Type d’import">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'students'}
          data-testid="import-tab-students"
          onClick={() => setTab('students')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'students' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users className="w-4 h-4" /> Import Élèves
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'parents'}
          data-testid="import-tab-parents"
          onClick={() => setTab('parents')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'parents' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <UserRound className="w-4 h-4" /> Import Parent
        </button>
      </div>

      {tab === 'students'
        ? (
          <StudentsImport
            existingKeys={new Set(
              allChildren.map((c) =>
                duplicateKey({
                  parentUsername: c.parentUsername,
                  prenom: c.firstName,
                  nom: c.lastName,
                  classe: c.className,
                }),
              ),
            )}
            existingParents={new Set(parentProfiles.map((p) => p.parentUsername))}
            importStudentRow={importStudentRow}
          />
        )
        : <ParentsImport parentProfiles={parentProfiles} children={allChildren} refreshRemote={refreshRemote} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Onglet élèves                                                       */
/* ------------------------------------------------------------------ */

function StudentsImport({
  existingKeys,
  existingParents,
  importStudentRow,
}: {
  existingKeys: Set<string>;
  existingParents: Set<string>;
  importStudentRow: (row: {
    parentUsername: string;
    parentNom: string;
    parentPrenom: string;
    parentTel: string;
    prenom: string;
    nom: string;
    classe: string;
    cycle: ImportRow['cycle'];
  }) => Promise<{ childId: string; parentCreated: boolean; duplicate: boolean }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseIssues, setParseIssues] = useState<RowIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<ReportEntry[] | null>(null);

  const analysis = useMemo(
    () => (rows.length > 0 ? analyzeImport(rows, existingKeys, existingParents) : null),
    [rows, existingKeys, existingParents],
  );

  const downloadTemplate = async () => {
    const url = URL.createObjectURL(await buildTemplateBlob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-eleves.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setReport(null);
    setRows([]);
    setParseIssues([]);
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParseError('Fichier trop volumineux (5 Mo maximum).');
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseImportFile(file);
      setRows(parsed.rows);
      setParseIssues(parsed.issues);
      if (parsed.rows.length === 0 && parsed.issues.length === 0) {
        setParseError('Aucune ligne d’élève trouvée dans ce fichier.');
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Lecture du fichier impossible.');
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleConfirm = async () => {
    if (!analysis || analysis.toCreate.length === 0 || importing) return;
    setImporting(true);
    setReport(null);
    const entries: ReportEntry[] = analysis.duplicates.map((d) => ({
      line: d.line, label: '', status: 'duplicate' as const, detail: d.reason,
    }));
    const list = analysis.toCreate;
    setProgress({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      const label = `${row.prenom} ${row.nom} (${row.classe})`;
      try {
        const res = await importStudentRow(row);
        if (res.duplicate) {
          entries.push({
            line: row.line, label, status: 'duplicate' as const,
            detail: 'Déjà inscrit — aucun doublon créé.',
          });
        } else {
          entries.push({
            line: row.line, label, status: 'created' as const,
            detail: res.parentCreated
              ? `Inscrit — parent ${formatPhone(row.parentTel)} créé (identifiant : ${formatPhone(row.parentTel)}).`
              : `Inscrit — parent ${formatPhone(row.parentTel)}.`,
          });
        }
      } catch (err) {
        entries.push({
          line: row.line, label, status: 'error',
          detail: err instanceof Error ? err.message : 'Écriture impossible.',
        });
      }
      setProgress({ done: i + 1, total: list.length });
    }
    entries.sort((a, b) => a.line - b.line);
    setReport(entries);
    setImporting(false);
  };

  /** Exporte le rapport en CSV (cellules neutralisées contre l'injection). */
  const downloadReport = () => {
    if (!report) return;
    const safe = (v: string | number) => {
      const s = String(v);
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };
    const lines = ['ligne;eleve;statut;detail', ...report.map((r) => [r.line, safe(r.label), r.status, safe(r.detail)].join(';'))];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport-import-eleves.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const created = report?.filter((r) => r.status === 'created') ?? [];
  const createdParents = new Set(
    (report ?? [])
      .filter((r) => r.status === 'created')
      .map((r) => rows.find((row) => row.line === r.line)?.parentUsername ?? ''),
  );
  const parentsCreated = analysis
    ? analysis.parentsToCreate.filter((p) => createdParents.has(p.username))
    : [];

  /**
   * Effectifs par classe : l'admin compare avec la liste de l'école AVANT de
   * confirmer. Une coquille (« CE2 » au lieu de « CM2 ») se voit ici, pas après.
   */
  const perClass = (list: ImportRow[]) => {
    const map = new Map<string, number>();
    for (const r of list) map.set(r.classe, (map.get(r.classe) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  };

  return (
    <>
      <button onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-sm font-bold text-slate-700 hover:border-emerald-500">
        <Download className="w-4 h-4" /> Télécharger le modèle Excel
      </button>
      <p className="mt-2 text-xs text-slate-400">Colonnes : {IMPORT_HEADERS.join(' · ')}</p>
      <p className="mt-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-500">parent_tel</span> porte le numéro de téléphone du parent — c’est son identifiant de connexion et la clé de rattachement de ses enfants. Un élève déjà inscrit (même parent, même prénom, nom et classe) n’est pas réinscrit : aucun doublon de QR n’est créé.
      </p>

      {/* ---------- 1. Dépôt ---------- */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="mt-4 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-all"
      >
        <Upload className="w-8 h-8 mx-auto text-slate-400" />
        <p className="mt-2 font-bold text-slate-700">{fileName ?? 'Déposez le fichier .xlsx ici, ou cliquez pour choisir'}</p>
        <p className="text-xs text-slate-400 mt-1">Le fichier est lu dans votre navigateur — rien n’est envoyé avant votre confirmation.</p>
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

      {/* ---------- 2. Aperçu ---------- */}
      {analysis && !report && (
        <div className="mt-4 rounded-3xl bg-white border p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-2xl font-black text-emerald-700 tabular-nums">{analysis.toCreate.length}</p>
              <p className="text-[11px] font-bold text-emerald-600">À inscrire</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border p-3">
              <p className="text-2xl font-black text-slate-700 tabular-nums">{analysis.duplicates.length}</p>
              <p className="text-[11px] font-bold text-slate-500">Doublons ignorés</p>
            </div>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3">
              <p className="text-2xl font-black text-blue-700 tabular-nums">{analysis.parentsToCreate.length}</p>
              <p className="text-[11px] font-bold text-blue-600">Parents inconnus</p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-200 p-3">
              <p className="text-2xl font-black text-red-600 tabular-nums">{parseIssues.length}</p>
              <p className="text-[11px] font-bold text-red-500">Lignes en erreur</p>
            </div>
          </div>

          {analysis.parentsToCreate.length > 0 && (
            <p className="mt-3 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex gap-2">
              <UserPlus className="w-4 h-4 flex-shrink-0" />
              Parents à ouvrir : {analysis.parentsToCreate.map((p) => formatPhone(p.tel)).slice(0, 8).join(', ')}
              {analysis.parentsToCreate.length > 8 ? ` (+${analysis.parentsToCreate.length - 8})` : ''} — leur fiche est créée à l’import, mais leur accès n’existe qu’après l’onglet Import Parent (identifiant = leur numéro).
            </p>
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

          {analysis.toCreate.length > 0 && (
            <div className="mt-3 rounded-2xl border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-50">
                Effectifs par classe — comparez avec la liste de l’école avant de confirmer
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {perClass(analysis.toCreate).map(([classe, n]) => (
                    <tr key={classe} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-bold text-slate-700">{classe}</td>
                      <td className="px-3 py-1.5 text-right font-black tabular-nums text-slate-900">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={importing || analysis.toCreate.length === 0}
            className="mt-4 w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Inscription {progress.done}/{progress.total}…</>
              : <><Users className="w-4 h-4" /> Confirmer : inscrire {analysis.toCreate.length} élève{analysis.toCreate.length > 1 ? 's' : ''}</>}
          </button>
        </div>
      )}

      {/* ---------- 3. Rapport ---------- */}
      {report && (
        <div className="mt-4 rounded-3xl bg-white border p-5">
          <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" /> Import terminé
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">{created.length} inscrits</span>
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">{report.filter((r) => r.status === 'duplicate').length} doublons</span>
            <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-600">{report.filter((r) => r.status === 'error').length} erreurs</span>
            {parentsCreated.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700">{parentsCreated.length} parents sans accès (à activer dans Import Parent)</span>
            )}
          </div>
          {report.filter((r) => r.status === 'error').length > 0 && (
            <ul className="mt-3 text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
              {report.filter((r) => r.status === 'error').map((r, i) => (
                <li key={i}>Ligne {r.line} ({r.label}) : {r.detail}</li>
              ))}
            </ul>
          )}
          {report.filter((r) => r.status === 'error').length === 0 && created.length > 0 && (
            <div className="mt-3 rounded-2xl border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-50">
                Inscrits par classe — contrôle final
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {perClass(
                    created
                      .map((c) => rows.find((row) => row.line === c.line))
                      .filter((r): r is ImportRow => Boolean(r)),
                  ).map(([classe, n]) => (
                    <tr key={classe} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-bold text-slate-700">{classe}</td>
                      <td className="px-3 py-1.5 text-right font-black tabular-nums text-slate-900">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={downloadReport} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Télécharger le rapport (CSV)
            </button>
            <button
              onClick={() => { setReport(null); setRows([]); setFileName(null); }}
              className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Nouvel import
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet parents                                                      */
/* ------------------------------------------------------------------ */

function ParentsImport({
  parentProfiles,
  children,
  refreshRemote,
}: {
  parentProfiles: { parentUsername: string; firstName: string; lastName: string; phone: string }[];
  children: { parentUsername: string; firstName: string; lastName: string }[];
  refreshRemote: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Saisie manuelle
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

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
    if (entries.some((e) => e.status === 'created' || e.status === 'activated')) void refreshRemote();
  };

  const countOf = (status: ParentReportEntry['status']) => report?.filter((r) => r.status === status).length ?? 0;

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
          <button
            onClick={() => { setReport(null); setParentRows([]); setFileName(null); }}
            className="mt-3 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Nouvel import
          </button>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default ImportElevesPage;
