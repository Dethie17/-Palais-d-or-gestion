import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, RefreshCw, ShieldAlert, Wallet, XCircle } from 'lucide-react';
import { dangoteApi, formatMoney, moyenPaiementLabel } from '@/lib/dangote';
import type { DangoteApiResponse } from '@/types/dangote';

interface Props {
  outcome: 'ok' | 'echec';
}

const POLL_MS = 4000;
const SLOW_AFTER_MS = 60_000;

type State = 'checking' | 'pending' | 'paid' | 'failed' | 'unresolved';

/**
 * Retour SycaPay du module Dangote : /paiement/dangote/ok?ref=DGT-…
 *
 * Comme pour les paiements parents, le retour navigateur ne prouve rien.
 * On interroge /api/dangote (action deposit.status) jusqu'à ce que SycaPay
 * rende un verdict. Le webhook reste la source de vérité.
 */
export default function DangotePaymentReturnPage({ outcome }: Props) {
  const reference = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('ref')
      ?? new URLSearchParams(window.location.search).get('reference')
      ?? ''
    : '';

  const [state, setState] = useState<State>('checking');
  const [payment, setPayment] = useState<DangoteApiResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const check = useCallback(async () => {
    if (!reference) {
      setState('unresolved');
      setMessage('Référence absente de l’adresse de retour. Retrouvez le dépôt dans l’espace RH.');
      return;
    }
    try {
      const result = await dangoteApi<DangoteApiResponse>('deposit.status', { reference });
      setPayment(result);
      if (result.status === 'paid') {
        setState('paid');
        setMessage(null);
        return;
      }
      if (result.status === 'failed' || result.status === 'cancelled') {
        setState('failed');
        setMessage(result.error ?? 'Le paiement n’a pas abouti. Aucun montant n’a été crédité.');
        return;
      }
      setState('pending');
      setMessage(result.message ?? null);
    } catch (err) {
      const error = err as Error;
      setState('unresolved');
      setMessage(
        /401|session|connexion|authentifi/i.test(error.message)
          ? 'Votre session a expiré. Le paiement peut quand même être confirmé : reconnectez-vous puis vérifiez le dépôt dans l’espace RH.'
          : error.message,
      );
    }
  }, [reference]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (state === 'paid' || state === 'failed' || state === 'unresolved') return;
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [state, check]);

  const goBack = () => window.location.assign('/');
  const amount = payment?.montant != null ? formatMoney(payment.montant) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-3xl border bg-white p-6 text-center shadow-xl sm:p-8">
        {state === 'paid' ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">Dépôt confirmé</h1>
            <p className="mt-2 text-sm text-slate-600">
              {amount ? `${amount} ` : 'Le montant '}a bien été crédité sur le budget Dangote.
            </p>
            {payment?.solde != null ? (
              <p className="mt-1 text-xs text-slate-500">Nouveau solde : {formatMoney(payment.solde)}</p>
            ) : null}
            <button onClick={goBack} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white hover:bg-green-800">
              <Wallet className="h-4 w-4" /> Retour à l’espace
            </button>
          </>
        ) : null}

        {state === 'failed' ? (
          <>
            <XCircle className="mx-auto h-14 w-14 text-red-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">Paiement non abouti</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <p className="mt-2 text-xs text-slate-500">Le budget n’a pas été crédité. Vous pouvez relancer un dépôt depuis l’espace RH.</p>
            <button onClick={goBack} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white hover:bg-green-800">
              <Wallet className="h-4 w-4" /> Retour à l’espace
            </button>
          </>
        ) : null}

        {state === 'unresolved' ? (
          <>
            <ShieldAlert className="mx-auto h-14 w-14 text-amber-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">Vérification impossible</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <button onClick={goBack} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white hover:bg-green-800">
              <Wallet className="h-4 w-4" /> Retour à l’espace
            </button>
          </>
        ) : null}

        {state === 'checking' || state === 'pending' ? (
          <>
            <Clock className="mx-auto h-14 w-14 text-blue-500" />
            <h1 className="mt-4 text-xl font-extrabold text-slate-800">
              {outcome === 'echec' ? 'Paiement interrompu' : 'Vérification du dépôt…'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {outcome === 'echec'
                ? 'Vous avez quitté la page de paiement. Si le débit a eu lieu, le budget sera crédité dès la confirmation SycaPay.'
                : 'Nous confirmons le paiement auprès de SycaPay. Ne fermez pas cette page.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {state === 'pending' ? 'Paiement en attente de confirmation' : 'Interrogation en cours…'}
            </div>
            {message ? <p className="mt-3 text-xs text-amber-700">{message}</p> : null}
            {slow ? (
              <p className="mt-4 text-xs text-slate-500">
                Cela prend plus longtemps que d’habitude. Le webhook peut confirmer le dépôt après votre départ ;
                vérifiez l’historique des dépôts dans l’espace RH.
              </p>
            ) : null}
            <button
              onClick={() => void check()}
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline"
            >
              <RefreshCw className="h-4 w-4" /> Vérifier maintenant
            </button>
          </>
        ) : null}

        <div className="mt-8 space-y-1 border-t pt-4 text-left text-[11px] text-slate-400">
          <p>Référence : <span className="font-mono">{reference || '—'}</span></p>
          {payment?.montant != null ? <p>Montant : {formatMoney(payment.montant)}</p> : null}
          {payment?.status ? <p>Statut : {payment.status}</p> : null}
          {payment?.providerStatus ? <p>SycaPay : {payment.providerStatus}</p> : null}
          {payment?.methode ? <p>Moyen : {moyenPaiementLabel(String(payment.methode))}</p> : null}
        </div>
      </div>
    </div>
  );
}
