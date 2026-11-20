import { useState, type ChangeEvent } from 'react';
import { Download, FileUp, Loader2, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  DangoteImportRow,
  DangoteImportSummary,
  downloadCsv,
  importEmployees,
} from '@/lib/dangote';
import { DangotePageHeader, Panel, primaryButtonClass, secondaryButtonClass } from '@/components/dangote/DangoteUI';
import { QrEmployeeCard } from '@/components/dangote/QrEmployeeCard';

interface DangoteImportEmployeesProps {
  entiteId?: string;
  onNavigate?: (page: string) => void;
}

function parseCsv(text: string): DangoteImportRow[] {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  if (!normalized) return [];

  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const header = lines[0]
    .split(delimiter)
    .map((column) => column.trim().toLowerCase().replace(/^"|"$/g, ''));

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    header.forEach((column, index) => {
      row[column] = values[index] ?? '';
    });
    return {
      matricule: row.matricule ?? '',
      nom: row.nom ?? '',
      prenom: row.prenom ?? '',
      telephone: row.telephone ?? '',
      photo_url: row.photo_url ?? row.image_url ?? '',
    };
  });
}

export const DangoteImportEmployees = ({ entiteId, onNavigate }: DangoteImportEmployeesProps) => {
  const { user } = useAuth();
  const resolvedEntiteId = entiteId ?? user?.entiteId ?? '';

  const [rows, setRows] = useState<DangoteImportRow[]>([]);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DangoteImportSummary | null>(null);

  const applyCsv = (text: string) => {
    setCsvText(text);
    setRows(parseCsv(text));
    setSummary(null);
    setError(null);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      applyCsv(await file.text());
    } catch {
      setError('Impossible de lire ce fichier.');
    }
  };

  const handleImport = async () => {
    if (!resolvedEntiteId) {
      setError('Aucune entité Dangote associée à ce compte.');
      return;
    }
    if (rows.length === 0) {
      setError('Aucun employé à importer.');
      return;
    }

    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const result = await importEmployees(resolvedEntiteId, rows);
      setSummary(result);
      if (result.imported > 0) {
        setRows([]);
        setCsvText('');
        setFileName(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplate = () => {
    downloadCsv('modele-employes-dangote.csv', [
      ['matricule', 'nom', 'prenom', 'telephone', 'photo_url'],
      ['EMP-001', 'DIOP', 'Awa', '771234567', ''],
    ]);
  };

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <DangotePageHeader
        eyebrow="Direction du Capital Humain"
        title="Import des employés"
        description="Chargez un fichier CSV, vérifiez les cartes QR puis importez dans le registre Dangote."
        icon={<Users className="h-5 w-5" />}
        actions={
          <>
            {onNavigate ? (
              <button className={secondaryButtonClass} onClick={() => onNavigate('dangote-rh')}>
                ← Retour
              </button>
            ) : null}
            <button className={secondaryButtonClass} onClick={handleTemplate}>
              <Download className="h-4 w-4" /> Modèle CSV
            </button>
            <button
              className={primaryButtonClass}
              onClick={() => void handleImport()}
              disabled={loading || rows.length === 0}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Importer {rows.length > 0 ? `(${rows.length})` : ''}
            </button>
          </>
        }
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-bold">
            {summary.imported} importé(s), {summary.skipped} ignoré(s), {summary.failed} échec(s).
          </p>
          {summary.errors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {summary.errors.slice(0, 6).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Fichier CSV" description="Colonnes attendues : matricule, nom, prenom, telephone, photo_url (optionnelle).">
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-sm font-semibold text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50/60">
              <FileUp className="h-5 w-5 text-emerald-700" />
              {fileName ?? 'Choisir un fichier CSV'}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleFileChange(event)} />
            </label>

            <div>
              <label htmlFor="csv-paste" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                ou coller les lignes CSV
              </label>
              <textarea
                id="csv-paste"
                rows={6}
                value={csvText}
                onChange={(event) => applyCsv(event.target.value)}
                placeholder={'matricule,nom,prenom,telephone\nEMP-001,DIOP,Awa,771234567'}
                className="block w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 font-mono text-xs outline-none focus:border-emerald-600"
              />
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              {rows.length === 0
                ? 'Aucune ligne détectée.'
                : `${rows.length} ligne(s) détectée(s). Les matricules déjà présents seront ignorés.`}
            </div>
          </div>
        </Panel>

        <Panel title="Aperçu des cartes" description="Les 8 premières cartes du fichier.">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">L’aperçu apparaîtra après le chargement du fichier.</p>
          ) : (
            <div className="space-y-4">
              {rows.slice(0, 8).map((row, index) => (
                <QrEmployeeCard
                  key={`${row.matricule}-${index}`}
                  employe={row}
                  compact
                />
              ))}
              {rows.length > 8 ? (
                <p className="text-center text-xs font-semibold text-slate-400">
                  + {rows.length - 8} autre(s) carte(s)
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default DangoteImportEmployees;
