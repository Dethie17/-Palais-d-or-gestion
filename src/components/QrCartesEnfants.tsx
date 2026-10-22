import { useRef, useState } from 'react';
import type { Child } from '@/types/menu';
import ChildQrCard from '@/components/ChildQrCard';
import { QrCode, Download } from 'lucide-react';

/**
 * Espace Parent — badges QR de TOUS les enfants, en haut de page.
 * Nom, prénom et classe de chaque enfant + Copier / PNG (téléchargement) /
 * Imprimer. Mobile : cartes empilées ; desktop : grille 2 colonnes.
 */
const QrCartesEnfants = ({ kids }: { kids: Child[] }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      window.setTimeout(() => setCopied(null), 2000);
    } catch { /* presse-papiers indisponible */ }
  };

  const downloadPNG = (childId: string, token: string, label: string) => {
    const svg = qrRefs.current[childId]?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 760;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('O RESTO', canvas.width / 2, 56);
      ctx.drawImage(img, 70, 90, 500, 500);
      ctx.font = '28px monospace';
      ctx.fillText(token, canvas.width / 2, 640);
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, canvas.width / 2, 690);
      const a = document.createElement('a');
      a.download = `oresto-qr-${token}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };

  return (
    <section id="qr" className="scroll-mt-24" data-testid="qr-enfants">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow">
          <QrCode className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Cantine</p>
          <h2 className="text-lg font-black tracking-tight text-slate-900">QR Codes des enfants</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            À présenter à la cantine, un badge par enfant — à télécharger, copier ou imprimer.
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-800 whitespace-nowrap">
          <Download className="w-3.5 h-3.5" /> PNG
        </span>
      </div>

      {kids.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 bg-white border rounded-2xl p-4">
          Les badges QR apparaîtront ici dès l’inscription du premier enfant.
        </p>
      ) : (
        <ul className="mt-4 grid sm:grid-cols-2 gap-3">
          {kids.map((k) => (
            <ChildQrCard
              key={k.id}
              k={k}
              qrRefCb={(el) => { qrRefs.current[k.id] = el; }}
              copied={copied}
              onCopy={copyToken}
              onPNG={downloadPNG}
              onPrint={() => window.print()}
            />
          ))}
        </ul>
      )}
    </section>
  );
};

export default QrCartesEnfants;
