import { useCallback, useEffect, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

/**
 * Page de retour de l'opérateur : /paiement/sycapay/ok?ref=…
 *
 * C'est l'écran sur lequel le client atterrit après avoir payé — Wave ou
 * Orange Money y ajoutent leurs propres paramètres, qui ne font partie
 * d'aucun contrat (docs §6).
 *
 * Donc cet écran ne conclut RIEN. Le retour du navigateur dit que
 * l'opérateur a redirigé, pas que l'argent a été débité : un client peut y
 * atterrir sans payer, comme il peut payer puis fermer l'onglet avant la
 * redirection. On interroge donc le prestataire en boucle, et c'est son
 * verdict — ultimately le webhook — qui décide.
 *
 * Sans notre référence en query string, on ne sait pas de quelle commande il
 * s'agit : on le dit, on ne devine pas.
 */
interface Props {
  /** 'ok' ou 'echec', déduit du chemin d'arrivée. */
  outcome: 'ok' | 'echec';
  onNavigate?: (page: string) => void;
}

/** Délai entre deux interrogations du prestataire. */
const POLL_MS = 4000;
/** Après ce délai sans réponse, on invite le client à vérifier lui-même. */
const SLOW_AFTER_MS = 60_000;

export default function SycaPayReturnPage({ outcome, onNavigate }: Props) {
  const { syncPaymentFromProvider, payments, paymentProviderId } = useResto();
  const reference = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('ref')
      ?? new URLSearchParams(window.location.search).get('reference')
      ?? ''
    : '';

  const [state, setState] = useState<'idle' | 'checking' | 'paid' | 'failed' | 'unresolved'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  // Le montant vient de la commande, jamais de l'URL : les paramètres que
  // l'opérateur ajoute à l'adresse de retour ne sont pas fiables.
  useEffect(() => {
    if (!reference) return;
    const payment = payments.find((p) => p.reference === reference);
    if (payment) setAmount(payment.amount);
  }, [payments, reference]);

  const check = useCallback(async () => {
    if (!reference) {
      setState('unresolved');
      setMessage('Référence de paiement absente de l’adresse. Revenez à votre espace pour retrouver la commande.');
      return;
    }
    setState((s) => (s === 'paid' || s === 'failed' ? s : 'checking'));
    try {
      const status = await syncPaymentFromProvider(reference);
      if (status.status === 'paid') {
        setState('paid');
        setMessage(null);
        return;
      }
      if (status.status === 'failed' || status.status === 'cancelled') {
        setState('failed');
        setMessage(status.error ?? 'Le paiement n’a pas abouti. Aucun montant n’a été débité.');
        setExpired(Boolean(status.expired));
        return;
      }
      // 'pending' ou 'unknown' : rien n'est conclu. On continue.
      setState((s) => (s === 'paid' || s === 'failed' ? s : 'idle'));
    } catch (err) {
      setState((s) => (s === 'paid' || s === 'failed' ? s : 'idle'));
      setMessage((err as Error).message);
    }
  }, [reference, syncPaymentFromProvider]);

  useEffect(() => {
    void check();
  }, [check]);

  // Interrogation périodique : c'est le filet quand le webhook est passé
  // par-dessus (notre état local était en retard au moment du retour).
  useEffect(() => {
    if (state === 'paid' || state === 'failed' || state === 'unresolved') return;
    const t = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(t);
  }, [state, check]);

  const localPayment = payments.find((p) => p.reference === reference);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border p-6 sm:p-8 max-w-md w-full text-center">
        {state === 'paid' && (
          <>
            <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">Paiement confirmé</h1>
            <p className="mt-2 text-sm text-slate-600">
              {amount != null ? `${formatCurrency(amount)} ` : ''}ont bien été reçus. Votre carte est active.
            </p>
            <button onClick={() => onNavigate?.('home')} className="btn-primary mt-6 w-full">
              Retour à mon espace
            </button>
          </>
        )}

        {state === 'failed' && (
          <>
            <XCircle className="w-14 h-14 mx-auto text-red-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">
              {expired ? 'Paiement non effectué' : 'Paiement non abouti'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            {expired && (
              <p className="mt-3 text-sm text-slate-600">
                Vous pouvez relancer la commande pour obtenir un nouveau lien de paiement.
              </p>
            )}
            <button onClick={() => onNavigate?.('home')} className="btn-primary mt-6 w-full">
              Retour à mon espace
            </button>
          </>
        )}

        {state === 'unresolved' && (
          <>
            <ShieldAlert className="w-14 h-14 mx-auto text-amber-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">Commande introuvable</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <button onClick={() => onNavigate?.('home')} className="btn-primary mt-6 w-full">
              Retour à mon espace
            </button>
          </>
        )}

        {(state === 'checking' || state === 'idle') && (
          <>
            <Clock className="w-14 h-14 mx-auto text-blue-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">
              {outcome === 'echec' ? 'Paiement interrompu' : 'Vérification du paiement…'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {outcome === 'echec'
                ? 'Vous avez quitté la page de paiement. Aucun montant n’a été débité — vous pouvez relancer.'
                : 'Nous confirmons votre paiement auprès de l’opérateur. Ne fermez pas cette page.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {state === 'checking' ? 'Interrogation en cours…' : 'En attente de la confirmation'}
            </div>
            {message && <p className="mt-3 text-xs text-amber-700">{message}</p>}
            {slow && (
              <p className="mt-4 text-xs text-slate-500">
                Cela prend plus longtemps que d’habitude. Vous pouvez quitter cette page : si le paiement aboutit,
                votre carte s’activera quand même.
              </p>
            )}
            <button
              onClick={() => void check()}
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline"
            >
              <RefreshCw className="w-4 h-4" /> Vérifier maintenant
            </button>
          </>
        )}

        {/* Détail technique, utile au Support quand un client signale un doute. */}
        <div className="mt-8 pt-4 border-t text-[11px] text-slate-400 space-y-1">
          <p>Référence : <span className="font-mono">{reference || '—'}</span></p>
          {localPayment && <p>Statut en base : {localPayment.status}</p>}
          <p>Passerelle : {paymentProviderId}</p>
        </div>
      </div>
    </div>
  );
}