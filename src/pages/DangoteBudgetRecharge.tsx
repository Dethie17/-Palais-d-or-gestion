import { useState, type FormEvent } from 'react';
import { Banknote, Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  formatMoney,
  initierDepotBudget,
  preparerRechargeBudget,
  statutDepotBudget,
  type DangoteDepositInitiation,
} from '@/lib/dangote';
import type { WavePaymentRequest } from '@/lib/wave';
import type { PaymentChallenge } from '@/lib/payments/types';
import WavePaymentModal from '@/components/WavePaymentModal';
import {
  DangotePageHeader,
  Panel,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/dangote/DangoteUI';

interface DangoteBudgetRechargeProps {
  entiteId?: string;
  onNavigate?: (page: string) => void;
}

const METHOD_LABEL: Record<string, string> = {
  wave: 'Wave',
  mobile_money: 'Orange Money',
  card: 'Carte bancaire',
};

function toPaymentRequest(deposit: DangoteDepositInitiation): WavePaymentRequest {
  const methodLabel = METHOD_LABEL[deposit.methode] ?? deposit.methode;
  const deepLinks = (deposit.deepLinks ?? []).filter((link) => Boolean(link?.url));

  let challenge: PaymentChallenge | undefined;
  if (deposit.qrCode) {
    challenge = { kind: 'qr', qrCode: deposit.qrCode, deepLinks };
  } else if (deposit.redirectUrl) {
    challenge = { kind: 'redirect', url: deposit.redirectUrl, label: methodLabel };
  } else if (deposit.checkoutUrl) {
    challenge = { kind: 'hosted', url: deposit.checkoutUrl, label: 'Page de paiement' };
  }

  return {
    reference: deposit.reference,
    amount: deposit.montant,
    amountLabel: formatMoney(deposit.montant),
    method: deposit.methode,
    methodLabel,
    merchantNumber: '',
    merchantName: "MIAM'S Dangote",
    ussdCode: '',
    expiresAt: deposit.validFor?.endDateTime ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    steps: [],
    provider: 'sycapay',
    challenge,
  };
}

export const DangoteBudgetRecharge = ({ entiteId, onNavigate }: DangoteBudgetRechargeProps) => {
  const { user } = useAuth();
  const resolvedEntiteId = entiteId ?? user?.entiteId ?? '';

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'wave' | 'mobile_money'>('wave');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [session, setSession] = useState<WavePaymentRequest | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvedEntiteId) {
      setError('Aucune entité Dangote associée à ce compte.');
      return;
    }

    const valid = preparerRechargeBudget(amount, method, phone);
    if (!valid.ok) {
      setError('error' in valid ? valid.error : 'Recharge invalide.');
      return;
    }

    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const deposit = await initierDepotBudget(
        resolvedEntiteId,
        valid.montant,
        valid.methode,
        valid.telephone,
      );
      setSession(toPaymentRequest(deposit));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (reference: string) => {
    const status = await statutDepotBudget(resolvedEntiteId, reference);
    if (status.status === 'paid') {
      setFeedback(
        status.solde != null
          ? `Paiement confirmé. Nouveau budget : ${formatMoney(status.solde)}.`
          : 'Paiement confirmé. Le budget a été crédité.',
      );
    }
    return {
      status: status.status,
      error: status.providerError ?? status.message ?? null,
    };
  };

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <DangotePageHeader
        eyebrow="Direction du Capital Humain"
        title="Recharge du budget"
        description="Créditez le budget cantine via SycaPay : Wave ou Orange Money. Le solde est confirmé par le prestataire."
        icon={<Banknote className="h-5 w-5" />}
        actions={
          onNavigate ? (
            <button className={secondaryButtonClass} onClick={() => onNavigate('dangote-rh')}>
              ← Retour
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Panel title="Nouvelle recharge" description="Minimum 100 FCFA. Le numéro doit être un mobile sénégalais.">
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div>
              <label htmlFor="budget-amount" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Montant (FCFA)
              </label>
              <input
                id="budget-amount"
                type="number"
                min={100}
                step={100}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="50000"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="budget-method" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Moyen de paiement
              </label>
              <select
                id="budget-method"
                value={method}
                onChange={(event) => setMethod(event.target.value as 'wave' | 'mobile_money')}
                className={inputClass}
              >
                <option value="wave">Wave</option>
                <option value="mobile_money">Orange Money (Max it)</option>
              </select>
            </div>

            <div>
              <label htmlFor="budget-phone" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Téléphone du payeur
              </label>
              <input
                id="budget-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="77 123 45 67"
                className={inputClass}
                required
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            {feedback ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                {feedback}
              </p>
            ) : null}

            <button type="submit" className={primaryButtonClass} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {loading ? 'Ouverture…' : 'Payer avec SycaPay'}
            </button>
          </form>
        </Panel>

        <Panel title="Comment ça marche" description="Aucun crédit n’est appliqué avant la confirmation de l’opérateur.">
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-3 rounded-xl bg-white/70 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">1</span>
              Vous choisissez le montant et l’opérateur ; SycaPay ouvre la demande.
            </li>
            <li className="flex gap-3 rounded-xl bg-white/70 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">2</span>
              Le payeur valide sur Wave ou Orange Money depuis son téléphone.
            </li>
            <li className="flex gap-3 rounded-xl bg-white/70 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">3</span>
              Le webhook confirme le règlement et crédite automatiquement le budget Dangote.
            </li>
          </ol>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-xs text-emerald-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Seul le retour du prestataire fait foi : fermer la fenêtre n’annule pas un paiement déjà validé.
          </div>
        </Panel>
      </div>

      {session ? (
        <WavePaymentModal
          wave={session}
          initialPhone={phone}
          error={error}
          confirming={false}
          onConfirm={() => undefined}
          onPaid={() => {
            setSession(null);
            setFeedback((current) => current ?? 'Paiement confirmé. Le budget a été crédité.');
          }}
          onSync={handleSync}
          onClose={() => {
            setSession(null);
            setError(null);
            setFeedback((current) => current ?? 'Recharge annulée.');
          }}
        />
      ) : null}
    </div>
  );
};

export default DangoteBudgetRecharge;
