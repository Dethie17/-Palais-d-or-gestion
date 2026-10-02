import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import ChildQrCard from '@/components/ChildQrCard';
import { QrCode } from 'lucide-react';

/**
 * QR Codes (espace parent) : tous les badges des enfants au même endroit.
 * Nom, classe, numero QR + Copier / PNG / Imprimer.
 */
const ParentQrPage = () => {
  const { user } = useAuth();
  const { myChildren } = useResto();
  const username = user?.username ?? '';
  const kids = myChildren(username);
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
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow">
          <QrCode className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">QR Codes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {kids.length === 0
              ? 'Les badges apparaissent ici dès qu’un enfant est inscrit.'
              : `${kids.length} badge${kids.length > 1 ? 's' : ''} — à présenter à la cantine.`}
          </p>
        </div>
      </div>
      {kids.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-3">
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
    </div>
  );
};

export default ParentQrPage;
