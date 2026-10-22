import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useResto } from '@/context/RestoContext';
import {
  HISTO_PAGE_SIZE,
  fetchPaiementsPage,
  fetchTousPaiements,
  paiementsErreurMessage,
  paiementsStatusLabel,
  paiementDate,
  formatDateJJMMAAAA,
  moisDeIsoDate,
  moisLibelle,
  contraintePaiements,
  type HistoriqueFiltres,
  type PaiementBrut,
  type PaiementsConnections,
} from '@/lib/paiementsHistorique';
import { normKey, toSheetData } from '@/lib/excelImport';
import { formatParentPhone } from '@/lib/parentIdentity';
import { formatCurrency } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/supabase';
import writeXlsxFile from 'write-excel-file';
import {
  ReceiptText, FileSpreadsheet, Download, Search, ChevronLeft, ChevronRight, Loader2, RefreshCw,
} from 'lucide-react';

/** Ligne finalement affichée / exportée (mise en forme une seule fois). */
interface HistoLigne {
  nomParent: string;
  prenomParent: string;
  telephone: string;
  montant: number;
  enfantNom: string;
  enfantPrenom: string;
  classe: string;
  mois: string;
  date: string;
  statut: string;
}

/**
 * Espace ISM — Historique des paiements (parents ↔ école).
 * Lecture paginée CÔTÉ SERVEUR de `oresto_payments`, filtres (période,
 * classe, recherche) et export Excel/PDF de TOUTES les lignes filtrées
 * (pas seulement la page affichée). L'enrichissement (identités des
 * parents et des enfants, mois de l'abonnement) provient des listes déjà
 * chargées par le contexte — la base ne stocke que les identifiants.
 */
const HistoriquePaiementsPage = () => {
  const { children: kids, parentProfiles, parentProfileOf, subscriptions } = useResto();

  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [classe, setClasse] = useState('');
  const [recherche, setRecherche] = useState('');
  const [applied, setApplied] = useState<HistoriqueFiltres>({});
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaiementBrut[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  const classes = useMemo(
    () => Array.from(new Set(kids.map((c) => c.className))).sort((a, b) => a.localeCompare(b, 'fr')),
    [kids],
  );
  const childById = useMemo(() => new Map(kids.map((c) => [c.id, c])), [kids]);
  const subById = useMemo(() => new Map(subscriptions.map((s) => [s.id, s])), [subscriptions]);

  // Enfants / parents retenus par les filtres (l'or PostgREST exige des
  // identifiants : ils sont résolus ici, à partir des listes de contexte).
  const conn: PaiementsConnections = useMemo(() => {
    const brut = (applied.recherche ?? '').trim();
    const digits = brut.replace(/\D/g, '');
    const phoneTerm = digits.length >= 4 ? digits : null;
    const nameTerm = /[\p{L}]/u.test(brut) ? normKey(brut) : null;

    let enfants = kids;
    if (applied.classe) enfants = enfants.filter((c) => c.className === applied.classe);
    if (nameTerm) {
      enfants = enfants.filter((c) =>
        [c.firstName, c.lastName].some((v) => normKey(v).includes(nameTerm)));
    }
    const childIds = enfants.map((c) => c.id);

    let parents = parentProfiles;
    if (applied.classe) {
      const classesConnues = new Set(kids.filter((c) => c.className === applied.classe).map((c) => c.parentUsername));
      parents = parents.filter((p) => classesConnues.has(p.parentUsername));
    }
    if (phoneTerm) parents = parents.filter((p) => p.parentUsername === phoneTerm);
    else if (nameTerm) {
      parents = parents.filter((p) =>
        [p.firstName, p.lastName].some((v) => normKey(v).includes(nameTerm)));
    }
    return { childIds, usernames: parents.map((p) => p.parentUsername) };
  }, [applied, kids, parentProfiles]);

  const subscriptionIds = useMemo(() => {
    if (conn.childIds.length === 0) return [];
    const set = new Set(conn.childIds);
    return subscriptions.filter((s) => s.childId && set.has(s.childId)).map((s) => s.id);
  }, [conn.childIds, subscriptions]);

  const contrainteActuelle = () =>
    contraintePaiements(conn.childIds, subscriptionIds, conn.usernames);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!isSupabaseConfigured) {
        if (alive) {
          setRows([]);
          setTotal(0);
          setError('');
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetchPaiementsPage({ filtres: applied, conn, constraint: contrainteActuelle(), page });
        if (!alive) return;
        setRows(res.rows);
        setTotal(res.total);
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setTotal(0);
        setError(paiementsErreurMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, page, conn, subscriptionIds]);

  const applyFilters = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setApplied({
      du: du || undefined,
      au: au || undefined,
      classe: classe || undefined,
      recherche: recherche.trim() || undefined,
    });
    setPage(1);
  };

  const resetFilters = () => {
    setDu('');
    setAu('');
    setClasse('');
    setRecherche('');
    setApplied({});
    setPage(1);
  };

  /** Mise en forme d'un paiement : parent, enfant, mois de l'abonnement. */
  const enrich = (p: PaiementBrut): HistoLigne => {
    const sub = p.subscriptionId ? subById.get(p.subscriptionId) : undefined;
    const child = p.childId
      ? childById.get(p.childId)
      : sub?.childId ? childById.get(sub.childId) : undefined;
    const profile = child
      ? parentProfileOf(child.parentUsername)
      : p.clientUsername
        ? parentProfileOf(p.clientUsername)
        : undefined;
    const parentUsername = child?.parentUsername ?? p.clientUsername ?? '';
    return {
      nomParent: profile?.lastName ?? '',
      prenomParent: profile?.firstName ?? '',
      telephone: formatParentPhone(profile?.phone ?? parentUsername) || '—',
      montant: p.amount,
      enfantNom: child?.lastName ?? '',
      enfantPrenom: child?.firstName ?? '',
      classe: child?.className ?? '—',
      mois: moisLibelle(sub?.startDate ? moisDeIsoDate(sub.startDate) : null),
      date: formatDateJJMMAAAA(paiementDate(p)),
      statut: paiementsStatusLabel(p.status),
    };
  };

  const genereSousTitre = (): string => {
    const parts: string[] = [];
    if (applied.du) parts.push(`À partir du ${formatDateJJMMAAAA(`${applied.du}T00:00:00Z`)}`);
    if (applied.au) parts.push(`Jusqu'au ${formatDateJJMMAAAA(`${applied.au}T00:00:00Z`)}`);
    if (applied.classe) parts.push(`Classe : ${applied.classe}`);
    if (applied.recherche) parts.push(`Recherche : ${applied.recherche.trim()}`);
    return parts.join(' · ') || 'Tous les paiements';
  };

  const prepareExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(kind);
    setError('');
    try {
      const all = await fetchTousPaiements({ filtres: applied, conn, constraint: contrainteActuelle() });
      const lignes = all.map(enrich);
      if (lignes.length === 0) {
        setError('Aucun paiement à exporter pour ces critères.');
        return;
      }
      if (kind === 'xlsx') await exportExcel(lignes);
      else await exportPdf(lignes);
    } catch (e) {
      setError(paiementsErreurMessage(e));
    } finally {
      setExporting('');
    }
  };

  const exportExcel = async (lignes: HistoLigne[]) => {
    const sheet = toSheetData([
      ['Historique des paiements — O RESTO'],
      [genereSousTitre()],
      [],
      ['Nom parent', 'Prénom parent', 'Téléphone', 'Montant (FCFA)', 'Nom enfant bénéficiaire', 'Prénom enfant', 'Classe', 'Mois payé', 'Date du paiement', 'Statut'],
      ...lignes.map((l) => [
        l.nomParent, l.prenomParent, l.telephone, l.montant,
        l.enfantNom, l.enfantPrenom, l.classe, l.mois, l.date, l.statut,
      ]),
    ]);
    const blob = await writeXlsxFile(sheet, {
      sheet: 'Paiements',
      columns: [22, 16, 16, 14, 18, 18, 14, 16, 16, 12].map((w) => ({ width: w })),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-paiements-${applied.du ?? 'debut'}_${applied.au ?? 'fin'}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportPdf = async (lignes: HistoLigne[]) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Historique des paiements — O RESTO', 12, 14);
    doc.setFontSize(9);
    doc.text(genereSousTitre(), 12, 20);
    const avaient: string[] = ['Date du paiement', 'Statut', 'Montant', 'Nom parent', 'Prénom parent', 'Téléphone', 'Enfant bénéficiaire', 'Classe', 'Mois payé'];
    const xs = [10, 28, 50, 80, 150, 174, 198, 230, 254];
    const entete = (y: number) => {
      doc.setFont(undefined, 'bold');
      avaient.forEach((h, i) => doc.text(h, xs[i], y));
      doc.setFont(undefined, 'normal');
      doc.line(10, y + 1.5, 286, y + 1.5);
    };
    let y = 30;
    entete(y);
    y += 7;
    lignes.forEach((l) => {
      if (y > 195) {
        doc.addPage();
        y = 16;
        entete(y);
        y += 7;
      }
      doc.text(l.date, xs[0], y);
      doc.text(l.statut, xs[1], y);
      doc.text(formatCurrency(l.montant), xs[2], y);
      doc.text(l.nomParent || '—', xs[3], y);
      doc.text(l.prenomParent || '—', xs[4], y);
      doc.text(l.telephone, xs[5], y);
      doc.text([l.enfantPrenom, l.enfantNom].filter(Boolean).join(' ') || '—', xs[6], y);
      doc.text(l.classe, xs[7], y);
      doc.text(l.mois, xs[8], y);
      y += 5.5;
    });
    doc.save(`historique-paiements-${applied.du ?? 'debut'}_${applied.au ?? 'fin'}.pdf`);
  };

  const totalPages = Math.max(1, Math.ceil(total / HISTO_PAGE_SIZE));
  const startIndex = (page - 1) * HISTO_PAGE_SIZE;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white p-6 md:p-8 shadow-xl">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300 flex items-center gap-1.5">
              <ReceiptText className="w-4 h-4" /> Espace ISM · Suivi
            </p>
            <h1 className="mt-1 text-3xl md:text-4xl font-black tracking-tight">Historique des paiements</h1>
            <p className="text-sm text-slate-300 mt-1">Parents ↔ école : abonnements, tickets et paiements, paginés depuis la base.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="paiements-export-excel"
              onClick={() => void prepareExport('xlsx')}
              disabled={exporting !== ''}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-xs font-bold hover:bg-white/20 disabled:opacity-60"
            >
              <FileSpreadsheet className="w-4 h-4" /> {exporting === 'xlsx' ? 'Préparation…' : 'Télécharger Excel'}
            </button>
            <button
              type="button"
              data-testid="paiements-export-pdf"
              onClick={() => void prepareExport('pdf')}
              disabled={exporting !== ''}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-400 text-slate-900 text-xs font-extrabold hover:bg-amber-300 shadow disabled:opacity-60"
            >
              <Download className="w-4 h-4" /> {exporting === 'pdf' ? 'Préparation…' : 'Télécharger PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <form onSubmit={applyFilters} data-testid="paiements-filters" className="bg-white rounded-3xl border p-4 md:p-5 shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
          <label className="text-xs font-bold text-slate-600">
            Du
            <input
              data-testid="paiements-du"
              type="date"
              value={du}
              onChange={(e) => setDu(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Au
            <input
              data-testid="paiements-au"
              type="date"
              value={au}
              onChange={(e) => setAu(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Classe
            <select
              data-testid="paiements-classe"
              value={classe}
              onChange={(e) => setClasse(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-green-600"
            >
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">
            Recherche (nom, prénom ou téléphone)
            <div className="mt-1 relative">
              <Search aria-hidden className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                data-testid="paiements-recherche"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Awa Diallo ou 77 123 45 67"
                className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600"
              />
            </div>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button type="submit" className="px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-bold flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Appliquer les filtres
          </button>
          <button type="button" onClick={resetFilters} className="px-4 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 hover:border-slate-300">
            Réinitialiser
          </button>
          <span className="ml-auto text-xs text-slate-500">
            {loading ? 'Chargement…' : `${total} paiement${total > 1 ? 's' : ''} au total`}
          </span>
        </div>
      </form>

      {!isSupabaseConfigured && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Base de données non configurée ici : l&apos;historique des paiements est disponible sur la version déployée (connectée à Supabase).
        </p>
      )}
      {error && (
        <p data-testid="paiements-error" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-semibold">
          {error}
        </p>
      )}

      {/* Tableau (desktop) */}
      <div className="hidden md:block bg-white rounded-3xl border shadow-lg overflow-hidden" data-testid="paiements-table-wrap">
        <div className="overflow-x-auto" data-testid="paiements-table">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left p-3 font-black">Nom parent</th>
                <th className="text-left p-3 font-black">Prénom parent</th>
                <th className="text-left p-3 font-black">Téléphone</th>
                <th className="text-right p-3 font-black">Montant</th>
                <th className="text-left p-3 font-black">Enfant bénéficiaire</th>
                <th className="text-left p-3 font-black">Classe</th>
                <th className="text-left p-3 font-black">Mois payé</th>
                <th className="text-left p-3 font-black">Date du paiement</th>
                <th className="text-left p-3 font-black">Statut</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((p) => {
                const l = enrich(p);
                return (
                  <tr key={p.id} data-testid="paiement-row" className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 font-semibold text-slate-800">{l.nomParent || '—'}</td>
                    <td className="p-3 text-slate-700">{l.prenomParent || '—'}</td>
                    <td className="p-3 text-xs whitespace-nowrap tabular-nums text-slate-600">{l.telephone}</td>
                    <td className="p-3 font-bold text-right whitespace-nowrap tabular-nums text-emerald-700">{formatCurrency(l.montant)}</td>
                    <td className="p-3 text-slate-800">{[l.enfantPrenom, l.enfantNom].filter(Boolean).join(' ') || '—'}</td>
                    <td className="p-3 text-xs text-slate-600">{l.classe}</td>
                    <td className="p-3 text-xs font-bold text-slate-700">{l.mois}</td>
                    <td className="p-3 text-xs whitespace-nowrap tabular-nums text-slate-600">{l.date}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-black whitespace-nowrap ${
                        p.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                          : p.status === 'pending' ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'}`}>
                        {l.statut}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(rows ?? []).length === 0 && !loading && !error && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">Aucun paiement pour ces critères.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">Chargement de l’historique…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaiementsPagination
          page={page}
          totalPages={totalPages}
          startIndex={startIndex}
          rowCount={rows?.length ?? 0}
          total={total}
          onPage={setPage}
          loading={loading}
        />
      </div>

      {/* Cartes (mobile) */}
      <div className="md:hidden space-y-3" data-testid="paiements-mobile">
        {!loading && (rows ?? []).length === 0 && !error && (
          <p className="bg-white rounded-2xl border p-6 text-center text-slate-400 text-sm">Aucun paiement pour ces critères.</p>
        )}
        {(rows ?? []).map((p) => {
          const l = enrich(p);
          return (
            <div key={p.id} className="bg-white rounded-2xl border p-4 shadow-sm space-y-1.5" data-testid="paiement-card">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-slate-900 text-sm">{[l.nomParent, l.prenomParent].filter(Boolean).join(' ') || 'Parent'}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {l.statut}
                </span>
              </div>
              <p className="text-xs text-slate-600 tabular-nums">{l.telephone}</p>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 mt-1">
                <p className="text-sm text-slate-800 font-semibold">
                  {[l.enfantPrenom, l.enfantNom].filter(Boolean).join(' ') || '—'}
                  <span className="text-slate-400 font-normal"> ({l.classe})</span>
                </p>
                <p className="font-black text-emerald-700 whitespace-nowrap">{formatCurrency(l.montant)}</p>
              </div>
              <p className="text-xs text-slate-500 flex flex-wrap justify-between gap-1">
                <span>Mois payé : <strong className="text-slate-700">{l.mois}</strong></span>
                <span>Le {l.date}</span>
              </p>
            </div>
          );
        })}
        <PaiementsPagination
          page={page}
          totalPages={totalPages}
          startIndex={startIndex}
          rowCount={rows?.length ?? 0}
          total={total}
          onPage={setPage}
          loading={loading}
        />
      </div>
    </div>
  );
};

function PaiementsPagination({ page, totalPages, startIndex, rowCount, total, onPage, loading }: {
  page: number; totalPages: number; startIndex: number; rowCount: number; total: number;
  onPage: (n: number) => void; loading: boolean;
}) {
  return (
    <div data-testid="paiements-pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 bg-slate-50/60">
      <p className="text-xs text-slate-500">
        {total === 0 ? 'Aucun résultat' : `${startIndex + 1}–${startIndex + rowCount} sur ${total}`}
        {totalPages > 1 ? ` — page ${page} / ${totalPages}` : ''}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="px-3 py-1.5 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 hover:border-slate-300 flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Précédent
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || loading}
          className="px-3 py-1.5 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 hover:border-slate-300 flex items-center gap-1"
        >
          Suivant <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default HistoriquePaiementsPage;
