import { useMemo, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/utils';
import { CYCLE_LABEL } from '@/lib/schoolCycles';
import { QrCode, Download, Printer, Search, FolderDown, CheckCircle, Wallet } from 'lucide-react';

/**
 * Galerie QR des élèves — espace Personnel (service) uniquement.
 * Tous les QR Cartes avec nom + classe en dessous : impression (planche A4)
 * et export PNG (un par un ou tout d'un coup → dossier Téléchargements,
 * à ranger ensuite dans le dossier image QR code du site).
 */
const QrGalleryPage = () => {
  const { children: kids, walletOf, subscriptions, formulas } = useResto();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [done, setDone] = useState('');
  const [exporting, setExporting] = useState(false);

  const classes = useMemo(
    () => Array.from(new Set(kids.map((k) => k.className))).sort(),
    [kids],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kids
      .filter((k) => !classFilter || k.className === classFilter)
      .filter((k) =>
        !q ||
        `${k.firstName} ${k.lastName} ${k.className}`.toLowerCase().includes(q) ||
        k.qrToken.toLowerCase().includes(q),
      )
      .sort((a, b) => a.className.localeCompare(b.className) || a.firstName.localeCompare(b.firstName));
  }, [kids, search, classFilter]);

  const childSub = (childId: string) => {
    const now = Date.now();
    return subscriptions.find(
      (s) => s.childId === childId && s.status === 'active' && new Date(s.endDate).getTime() >= now,
    );
  };

  const fileName = (firstName: string, lastName: string, token: string) =>
    `qr-${firstName}-${lastName}-${token}.png`.replace(/\s+/g, '-');

  const renderPng = (token: string, label: string, subLabel: string): Promise<void> => new Promise((resolve) => {
    const el = document.getElementById(`qr-gallery-${token}`);
    const svg = el?.querySelector('svg');
    if (!svg) {
      resolve();
      return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 820;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve();
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('O RESTO', canvas.width / 2, 62);
        ctx.drawImage(img, 70, 95, 500, 500);
        ctx.font = 'bold 30px monospace';
        ctx.fillText(token, canvas.width / 2, 650);
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(label, canvas.width / 2, 710);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(subLabel, canvas.width / 2, 752);
        const a = document.createElement('a');
        a.download = fileName(label.split(' ')[0] ?? 'eleve', label.split(' ').slice(1).join(' ') || 'qr', token);
        a.href = canvas.toDataURL('image/png');
        a.click();
      } catch {
        /* ignore */
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });

  const downloadOne = (token: string, firstName: string, lastName: string, className: string) => {
    void renderPng(token, `${firstName} ${lastName}`, className);
    setDone(`QR de ${firstName} ${lastName} téléchargé (dossier Téléchargements).`);
    window.setTimeout(() => setDone(''), 4000);
  };

  const exportAll = async () => {
    if (filtered.length === 0 || exporting) return;
    setExporting(true);
    setDone('');
    for (const k of filtered) {
      // eslint-disable-next-line no-await-in-loop
      await renderPng(k.qrToken, `${k.firstName} ${k.lastName}`, k.className);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => window.setTimeout(r, 350));
    }
    setExporting(false);
    setDone(`${filtered.length} QR exportés en PNG — rangez-les dans le dossier image QR code.`);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <QrCode className="w-6 h-6 text-green-700" /> QR Élèves ({filtered.length})
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Toutes les QR Cartes, nom en dessous — impression et export PNG.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={exportAll}
            disabled={exporting || filtered.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 disabled:opacity-50"
          >
            <FolderDown className="w-4 h-4" /> {exporting ? 'Export…' : 'Tout exporter (PNG)'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-500 text-white text-sm font-bold hover:bg-slate-600"
          >
            <Printer className="w-4 h-4" /> Imprimer
          </button>
        </div>
      </div>

      {done && (
        <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800 flex items-center gap-2 print:hidden">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {done}
        </p>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un élève…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-600"
          />
        </div>
        {classes.length > 0 && (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-green-600"
          >
            <option value="">Toutes classes</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
          <QrCode className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="mt-2 font-bold text-slate-700">Aucun QR pour cette sélection</p>
          <p className="text-sm text-slate-500 mt-1">Les QR Cartes sont générés automatiquement à l’inscription de chaque enfant.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {filtered.map((k) => {
            const sub = childSub(k.id);
            return (
              <article key={k.id} className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden break-inside-avoid">
                <div id={`qr-gallery-${k.qrToken}`} className="bg-white p-3 flex justify-center">
                  <QRCodeSVG value={k.qrToken} size={140} level="M" />
                </div>
                <div className="px-3 pb-3 text-center border-t-2 border-dashed border-slate-200 pt-2.5">
                  <p className="font-extrabold text-sm text-slate-800 capitalize truncate">{k.firstName} {k.lastName}</p>
                  <p className="text-[11px] text-slate-500">{k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}</p>
                  <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-bold text-slate-600">
                    <Wallet className="w-3 h-3" /> {formatCurrency(walletOf(k.id))}
                    {sub && <span className="text-emerald-700"> · {sub.mealsRemaining} repas</span>}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5">{k.qrToken}</p>
                  <button
                    onClick={() => downloadOne(k.qrToken, k.firstName, k.lastName, k.className)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 print:hidden"
                  >
                    <Download className="w-3.5 h-3.5" /> PNG
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 print:hidden">
        Astuce : créez un dossier <span className="font-mono font-bold">image QR code</span> dans le dossier source du site, puis déplacez-y les PNG téléchargés.
      </p>
    </div>
  );
};

export default QrGalleryPage;
