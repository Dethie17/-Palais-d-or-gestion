import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Printer } from 'lucide-react';
import { getChildQrToken } from '@/lib/clientQr';
import { CYCLE_LABEL } from '@/lib/schoolCycles';
import type { Child } from '@/types/menu';

/**
 * Carte QR enfant pro : avatar, prénom + nom, classe + cycle,
 * QR + n° + Copier / PNG / Imprimer. Utilisée dans l'espace parent
 * (section QR Codes) et la page QR Codes dédiée.
 */
const ChildQrCard = ({ k, qrRefCb, copied, onCopy, onPNG, onPrint, anchorId }: {
  k: Child;
  qrRefCb: (el: HTMLDivElement | null) => void;
  copied: string | null;
  onCopy: (token: string) => void;
  onPNG: (childId: string, token: string, label: string) => void;
  onPrint: () => void;
  anchorId?: string;
}) => {
  const token = k.qrToken || getChildQrToken(k.id);
  return (
    <li id={anchorId} className="scroll-mt-24 bg-white rounded-3xl border-2 border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-lg font-black flex-shrink-0">
          {k.firstName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">{k.firstName} {k.lastName}</p>
          <p className="text-xs text-slate-500 truncate">{k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-slate-50 border p-4">
        <div ref={qrRefCb} className="p-2 border border-slate-200 bg-white rounded-xl flex-shrink-0">
          <QRCodeSVG value={token} size={104} level="M" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">N° QR Code</p>
          <p className="font-mono text-sm font-bold text-slate-800 tracking-wider truncate">{token}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <button onClick={() => onCopy(token)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
              <Copy className="w-3 h-3" /> {copied === token ? 'Copié' : 'Copier'}
            </button>
            <button onClick={() => onPNG(k.id, token, `${k.firstName} ${k.lastName}`)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
              <Download className="w-3 h-3" /> PNG
            </button>
            <button onClick={onPrint} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
              <Printer className="w-3 h-3" /> Imprimer
            </button>
          </div>
        </div>
      </div>
    </li>
  );
};

export default ChildQrCard;
