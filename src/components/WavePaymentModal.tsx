import { useEffect, useMemo, useState } from 'react';
import { X, Smartphone, Copy, Check, Timer, ShieldCheck } from 'lucide-react';
import type { WavePaymentRequest } from '@/lib/wave';
import { isValidSnPhone, isValidWaveCode } from '@/lib/wave';

interface WavePaymentModalProps {
  wave: WavePaymentRequest;
  initialPhone?: string;
  error?: string | null;
  confirming: boolean;
  onConfirm: (code: string) => void;
  onClose: () => void;
}

function useCountdown(expiresAt: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  return { left, label: `${mm}:${ss}` };
}

/**
 * Paiement mobile Wave : instructions marchand,
 * compte à rebours et saisie du code de confirmation à 6 chiffres.
 */
const WavePaymentModal = ({ wave, initialPhone, error, confirming, onConfirm, onClose }: WavePaymentModalProps) => {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [copied, setCopied] = useState(false);
  const { left, label } = useCountdown(wave.expiresAt);
  const valid = useMemo(() => isValidWaveCode(code) && isValidSnPhone(phone), [code, phone]);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(wave.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg flex items-center gap-2">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </span>
            Payer avec {wave.methodLabel}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="mt-4 bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Montant à envoyer</p>
            <p className="text-2xl font-extrabold">{wave.amountLabel}</p>
            <p className="text-xs text-slate-300 mt-1">
              Marchand : <strong>{wave.merchantName}</strong> • {wave.merchantNumber}
              {phone && <span className="block text-slate-400">Depuis : {phone}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
              <Timer className="w-3.5 h-3.5" /> Expire dans
            </p>
            <p className={`text-xl font-black font-mono ${left === 0 ? 'text-red-400' : ''}`}>{label}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between bg-slate-50 border rounded-xl px-3 py-2.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Référence du paiement</p>
            <p className="font-mono font-bold text-sm">{wave.reference}</p>
          </div>
          <button onClick={copyRef} className="p-2 rounded-lg bg-white border hover:bg-slate-100" title="Copier la référence">
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
          </button>
        </div>

        <ol className="mt-4 space-y-2 text-sm text-slate-600">
          {wave.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <label className="block text-sm font-bold text-slate-700 mt-4 mb-1.5">
          Votre numéro {wave.methodLabel} <span className="font-normal text-slate-400">(ex : 77 123 45 67)</span>
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="77 123 45 67"
          className={`w-full px-4 py-3 rounded-xl border-2 outline-none font-semibold ${phone === '' || isValidSnPhone(phone) ? 'border-slate-200 focus:border-blue-500' : 'border-red-300 focus:border-red-400'}`}
        />
        {phone !== '' && !isValidSnPhone(phone) && (
          <p className="mt-1 text-xs font-semibold text-red-600">Numéro invalide (format Sénégal : 77, 78, 76, 75, 70…).</p>
        )}

        <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>Mode démo :</strong> aucun argent ne circule. Utilisez le code{' '}
          <strong className="font-mono text-sm">{wave.demoCode}</strong> pour valider le parcours de bout en bout.
        </div>

        <label className="block text-sm font-bold text-slate-700 mt-4 mb-1.5">
          Code de confirmation à 6 chiffres
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="••••••"
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-center text-2xl font-black tracking-[0.4em] focus:border-blue-500 outline-none"
        />
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

        <button
          onClick={() => valid && !confirming && onConfirm(code)}
          disabled={!valid || confirming || left === 0}
          className="mt-4 w-full py-3.5 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" />
          {confirming ? 'Vérification…' : `Confirmer le paiement de ${wave.amountLabel}`}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          La carte s’active automatiquement après confirmation.
        </p>
      </div>
    </div>
  );
};

export default WavePaymentModal;
