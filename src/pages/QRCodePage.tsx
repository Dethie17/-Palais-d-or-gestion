import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { getClientQrToken } from '@/lib/clientQr';
import OrestoLogo from '@/components/brand/OrestoLogo';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, CheckCircle, Download, Printer, ShieldCheck, QrCode } from 'lucide-react';
import { useRef, useState } from 'react';

const QRCodePage = () => {
  const { user } = useAuth();
  const { mySubscription, mySubscriptions, myValidations, formulas, myChildren, walletOf } = useResto();
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const sub = user ? mySubscription(user.username) : undefined;
  const hasPending = user ? mySubscriptions(user.username).some((s) => s.status === 'pending') : false;
  const formula = formulas.find((f) => f.id === sub?.formulaId);
  const used = user ? myValidations(user.username).filter((v) => v.status === 'accepted').length : 0;
  // QR individuel réel (scannable) : token personnel STABLE du client.
  // Il ne change jamais (renouvellements inclus) et reste lié à ses abonnements.
  const token = user ? getClientQrToken(user.username) : 'ORESTO-VISITEUR';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const downloadPNG = () => {
    const svg = qrRef.current?.querySelector('svg');
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
      ctx.fillText(user?.username ?? '', canvas.width / 2, 690);
      const a = document.createElement('a');
      a.download = `oresto-qr-${token}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <p className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">
          <QrCode className="w-3 h-3" /> Badge repas personnel
        </p>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-2">Mon QR Code O RESTO</h1>
        <p className="text-slate-500 text-sm mt-1">
          Votre QR <strong>personnel et permanent</strong>, scannable par caméra : il reste le même à chaque renouvellement.
        </p>
      </div>

      {/* Carte badge pro */}
      <div className="bg-slate-900 rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-green-700 to-slate-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-xl p-1 overflow-hidden">
              <OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-white font-extrabold tracking-wide">O RESTO</p>
              <p className="text-white/80 text-xs">Écoles & entreprises • Thiès</p>
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${sub ? 'bg-green-400 text-green-950' : 'bg-amber-300 text-amber-950'}`}>
            {sub ? '● ACTIF' : '● SANS ABO'}
          </span>
        </div>

        <div className="p-6 md:p-8 text-center">
          <div ref={qrRef} className="inline-block p-4 bg-white rounded-2xl shadow-lg">
            <QRCodeSVG value={token} size={230} level="M" />
          </div>
          <p className="font-mono font-bold text-white text-lg tracking-widest mt-4">{token}</p>
          <p className="text-slate-300 text-sm mt-1 capitalize">
            {user?.username} — {formula?.name ?? 'sans formule'}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-2xl font-extrabold text-white">{sub?.mealsRemaining ?? 0}</p>
              <p className="text-xs text-slate-300">repas restants</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-2xl font-extrabold text-white">{used}</p>
              <p className="text-xs text-slate-300">repas validés</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-sm font-extrabold text-white leading-8">
                {sub ? new Date(sub.endDate).toLocaleDateString('fr-FR') : '—'}
              </p>
              <p className="text-xs text-slate-300">expire le</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 no-print">
        <button onClick={copy} className="btn-secondary">
          {copied ? <CheckCircle aria-hidden className="w-4 h-4 text-green-600" /> : <Copy aria-hidden className="w-4 h-4" />}
          {copied ? 'Copié !' : 'Copier'}
        </button>
        <button onClick={downloadPNG} className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800">
          <Download aria-hidden className="w-4 h-4" /> Image PNG
        </button>
        <button onClick={() => window.print()} className="btn-primary">
          <Printer aria-hidden className="w-4 h-4" /> Imprimer
        </button>
      </div>

      {!sub && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-700">
          {hasPending
            ? 'Réservation en attente de paiement : ce QR sera refusé au contrôle. Finalisez le paiement sur la page Abonnement.'
            : 'Aucun abonnement actif : ce QR sera refusé au contrôle. Souscrivez une formule ou un ticket sur la page Abonnement.'}
        </p>
      )}

      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800 flex gap-2">
        <ShieldCheck className="w-5 h-5 flex-shrink-0" />
        <span>Contrôle automatique à chaque scan : abonnement actif, date de validité, repas restants et anti-double (1 repas / jour / QR Code).</span>
      </div>

      {user && myChildren(user.username).length > 0 && (
        <div className="space-y-3">
          <h2 className="font-extrabold text-slate-900">QR Cartes des enfants</h2>
          {myChildren(user.username).map((k) => (
            <div key={k.id} className="bg-white border rounded-2xl p-4 flex items-center gap-4">
              <div className="p-2 border rounded-xl bg-white">
                <QRCodeSVG value={k.qrToken} size={90} />
              </div>
              <div className="text-sm">
                <p className="font-extrabold capitalize">{k.firstName} {k.lastName} <span className="font-normal text-slate-500">• {k.className}</span></p>
                <p className="font-mono font-bold text-slate-700">{k.qrToken}</p>
                <p className="text-slate-500">Solde carte : <strong>{walletOf(k.id)} FCFA</strong></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QRCodePage;
