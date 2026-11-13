import { useEffect, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, ExternalLink, Loader2, QrCode, Smartphone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dangoteApi, formatMoney } from '@/lib/dangote';
import type { DangoteApiResponse } from '@/types/dangote';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass, StatusBadge } from './DangoteUI';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entiteId: string;
  onDone: () => void;
}

type Mode = 'sycapay' | 'manuel';
type SycaMethod = 'wave' | 'mobile_money' | 'card';
type ManualMethod = 'cash' | 'virement';

export default function DangoteDepositDialog({ open, onOpenChange, entiteId, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('sycapay');
  const [methode, setMethode] = useState<SycaMethod>('wave');
  const [manualMethode, setManualMethode] = useState<ManualMethod>('cash');
  const [montant, setMontant] = useState('');
  const [telephone, setTelephone] = useState('');
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('MIAM\'S Dangote');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [deepLinks, setDeepLinks] = useState<Record<string, string> | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setQrCode(null);
    setDeepLinks(null);
    setPaymentReference(null);
    setValidUntil(null);
    setMontant('');
    setTelephone('');
    setReference('');
    setMode('sycapay');
    setMethode('wave');
    setManualMethode('cash');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setQrCode(null);
    setDeepLinks(null);
    setLoading(true);
    try {
      const amount = Number(montant);
      if (!Number.isFinite(amount) || amount < 100) {
        throw new Error('Montant invalide : au moins 100 FCFA.');
      }

      if (mode === 'manuel') {
        const result = await dangoteApi<DangoteApiResponse>('deposit.manual', {
          entiteId,
          montant: amount,
          methode: manualMethode,
          reference,
        });
        toast.success(`Dépôt enregistré. Nouveau solde : ${formatMoney(Number(result.solde_apres ?? 0))}.`);
        onDone();
        onOpenChange(false);
        return;
      }

      const result = await dangoteApi<DangoteApiResponse>('deposit.initiate', {
        entiteId,
        montant: amount,
        methode,
        telephone,
        payerName,
      });

      setPaymentReference(result.reference ?? null);
      setValidUntil(result.validFor?.endDateTime ?? null);

      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.qrCode) {
        setQrCode(result.qrCode);
        setDeepLinks(result.deepLinks ?? null);
        return;
      }
      setError('SycaPay n’a pas renvoyé de moyen de paiement. Réessayez ou utilisez un dépôt manuel.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-green-700" />
            Recharger le budget Dangote
          </DialogTitle>
          <DialogDescription>
            Le budget est crédité uniquement après confirmation SycaPay. Un dépôt manuel (espèces/virement) est disponible pour la RH.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('sycapay')}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === 'sycapay' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-500'}`}
            >
              Paiement en ligne
            </button>
            <button
              type="button"
              onClick={() => setMode('manuel')}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === 'manuel' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-500'}`}
            >
              Dépôt manuel
            </button>
          </div>

          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <Field label="Montant (FCFA)">
            <input
              type="number"
              min={100}
              step={100}
              className={inputClass}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="100000"
              required
            />
          </Field>

          {mode === 'sycapay' ? (
            <>
              <Field label="Moyen de paiement">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['wave', 'Wave', <Smartphone key="wave" className="h-4 w-4" />],
                    ['mobile_money', 'Orange Money', <Smartphone key="om" className="h-4 w-4" />],
                    ['card', 'Carte', <CreditCard key="card" className="h-4 w-4" />],
                  ] as const).map(([value, label, icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMethode(value)}
                      className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition ${
                        methode === value
                          ? 'border-green-700 bg-green-50 text-green-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {methode !== 'card' ? (
                <Field label="Numéro mobile du payeur" hint="Format Sénégal : 77 123 45 67.">
                  <input
                    className={inputClass}
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    placeholder="77 123 45 67"
                    required
                  />
                </Field>
              ) : null}

              <Field label="Nom affiché sur la page de paiement">
                <input className={inputClass} value={payerName} onChange={(e) => setPayerName(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Type de dépôt">
                <select className={inputClass} value={manualMethode} onChange={(e) => setManualMethode(e.target.value as ManualMethod)}>
                  <option value="cash">Espèces</option>
                  <option value="virement">Virement bancaire</option>
                </select>
              </Field>
              <Field label="Référence (optionnel)" hint="Ex. numéro de bordereau ou reçu.">
                <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="VIR-2026-001" />
              </Field>
            </>
          )}

          {qrCode ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-sm font-bold text-green-900">Scannez ce QR avec Orange Money</p>
              <img
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR de paiement Orange Money"
                className="mx-auto mt-3 h-48 w-48 rounded-xl bg-white p-2"
              />
              {paymentReference ? (
                <p className="mt-2 text-xs text-green-800">
                  Référence : <span className="font-mono">{paymentReference}</span>
                </p>
              ) : null}
              {validUntil ? <p className="text-xs text-green-800">Valable jusqu’à {new Date(validUntil).toLocaleTimeString('fr-FR')}.</p> : null}
              {deepLinks && Object.keys(deepLinks).length > 0 ? (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {Object.entries(deepLinks).map(([app, url]) => (
                    <a
                      key={app}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-green-800 shadow-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {app}
                    </a>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-xs text-green-800">
                Le budget sera crédité dès que SycaPay confirmera le paiement. Vous pouvez fermer cette fenêtre.
              </p>
            </div>
          ) : null}

          {paymentReference && !qrCode ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
              <p className="font-bold">Paiement initié</p>
              <p className="mt-1">
                Référence <span className="font-mono">{paymentReference}</span>. Si la page de paiement ne s’ouvre pas, utilisez « Vérifier » dans l’historique des dépôts.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => onOpenChange(false)}>
              Fermer
            </button>
            <button type="submit" className={primaryButtonClass} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'manuel' ? <Banknote className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
              {loading ? 'Traitement…' : mode === 'manuel' ? 'Enregistrer le dépôt' : 'Payer avec SycaPay'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
