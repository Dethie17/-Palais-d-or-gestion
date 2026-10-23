import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { SubscriptionStatus } from '@/types/menu';
import { methodLabel } from '@/lib/wave';
import { CYCLE_LABEL } from '@/lib/schoolCycles';
import { cycleOfFormula } from '@/lib/formulas';
import { fetchValidatedFinance, type ValidatedFinance } from '@/lib/financeApi';
import {
  Users, Banknote, CheckCircle, XCircle, Receipt,
  GraduationCap, Baby, QrCode,
} from 'lucide-react';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import { formatCurrency } from '@/lib/utils';
import type { ORestoPayment } from '@/types/menu';

type Tab = 'subs' | 'payments';

const SUB_STATUS: Record<SubscriptionStatus, { label: string; style: string }> = {
  pending: { label: 'En attente', style: 'bg-amber-100 text-amber-800' },
  active: { label: 'Actif', style: 'bg-green-100 text-green-700' },
  expired: { label: 'Expiré', style: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Annulé', style: 'bg-red-100 text-red-600' },
};

const PAY_STATUS: Record<string, { label: string; style: string }> = {
  pending: { label: 'En attente', style: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Payé', style: 'bg-green-100 text-green-700' },
};

const CYCLE_SHORT: Record<string, string> = { primaire: 'Présco-Élém', lycee: 'Lycée' };
const CYCLE_STYLE: Record<string, string> = {
  primaire: 'bg-emerald-100 text-emerald-700',
  lycee: 'bg-amber-100 text-amber-800',
};

const SubscriptionsAdminPage = () => {
  const { user } = useAuth();
  // Direction : suivi en lecture seule (ne change rien).
  // Personnel : opérationnel (encaissements, confirmations).
  const isDG = user?.role === 'admin';
  const {
    subscriptions, formulas, payments, children: kids, parentProfiles,
    walletTxs, collectCashPayment, confirmManualPayment, confirmWalletTopUp, cancelSubscription,
  } = useResto();
  const [tab, setTab] = useState<Tab>('subs');
  const [filter, setFilter] = useState<'all' | SubscriptionStatus>('all');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);

  const formulaName = (id: string) => formulas.find((f) => f.id === id)?.name ?? id;
  const cycleBadge = (formulaId: string) => {
    const f = formulas.find((x) => x.id === formulaId);
    const cycle = f ? cycleOfFormula(f) : undefined;
    if (!cycle) {
      return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Tous cycles</span>;
    }
    return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${CYCLE_STYLE[cycle]}`}>{CYCLE_SHORT[cycle]}</span>;
  };
  const parentOf = (username?: string | null) => {
    if (!username) return null;
    return parentProfiles.find((p) => p.parentUsername === username.trim().toLowerCase()) ?? null;
  };
  /** Bénéficiaire d'un paiement : enfant si abo rattaché, sinon parent / compte. */
  const whoOfPayment = (p: ORestoPayment) => {
    const sub = subscriptions.find((s) => s.id === p.subscriptionId);
    const k = sub?.childId ? kids.find((c) => c.id === sub.childId) : undefined;
    if (k) return `${k.firstName} ${k.lastName}`;
    return sub?.clientUsername ?? p.clientUsername ?? '—';
  };
  const payStatus = (status: string) => PAY_STATUS[status] ?? { label: status, style: 'bg-slate-100 text-slate-500' };

  // ---- Paiements VALIDÉS (source serveur)
  //
  // La comptabilité ne retient que les paiements dont le règlement est
  // horodaté par le serveur (v_paiements_valides). On va le chercher à la
  // source : le statut « payé » seul ne prouve aucun encaissement.
  const [validated, setValidated] = useState<ValidatedFinance | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchValidatedFinance().then((data) => {
      if (!cancelled) setValidated(data);
    });
    return () => { cancelled = true; };
  }, []);

  const validatedIds = useMemo(
    () => new Set((validated?.payments ?? []).map((p) => p.id)),
    [validated],
  );
  /** Règlement confirmé : par la base, ou par l'horodatage local posé à l'appel. */
  const isSettled = (p: ORestoPayment) => Boolean(p.settledAt) || validatedIds.has(p.id);
  /** true quand la base sait distinguer un règlement d'un simple statut. */
  const settlementKnown = validated?.validated === true;

  /**
   * Abonnés réglés uniquement : la liste ne montre que les abonnements
   * couverts par un paiement réglé (Wave / Max it via SycaPay, ou
   * encaissement confirmé au comptoir). Les parents sans règlement restent
   * dans l'onglet Utilisateurs — cette page n'est pas un registre
   * d'inscription.
   */
  const settledSubIds = useMemo(
    () => new Set(
      payments
        .filter((p) => p.status === 'paid' && p.subscriptionId
          && (!settlementKnown || Boolean(p.settledAt) || validatedIds.has(p.id)))
        .map((p) => p.subscriptionId as string),
    ),
    [payments, settlementKnown, validatedIds],
  );
  const paidSubs = subscriptions.filter((s) => settledSubIds.has(s.id));
  const filteredSubs = paidSubs.filter((s) => filter === 'all' || s.status === filter);
  const pendingPayments = payments.filter((p) => p.status === 'pending');
  /**
   * Onglet Paiements : les règlements réussis plus ceux à confirmer.
   * Les tentatives échouées / annulées n'ont rien encaissé et restent dans
   * l'historique de la passerelle — elles ne servent qu'à créer du bruit ici.
   */
  const listedPayments = useMemo(
    () => payments.filter((p) => p.status === 'paid' || p.status === 'pending'),
    [payments],
  );

  const handleEncaisser = (subId: string) => {
    const payment = collectCashPayment(subId);
    if (!payment) {
      setMessage('Encaissement impossible : abonnement déjà traité ou introuvable.');
      return;
    }
    setMessage(`Espèces encaissées — abonnement activé (paiement ${payment.reference}).`);
  };

  const activeSubs = paidSubs.filter((s) => s.status === 'active').length;
  const pendingSubs = paidSubs.filter((s) => s.status === 'pending').length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="rounded-3xl bg-slate-950 text-white p-6 md:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-16 w-64 h-64 bg-slate-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center shadow-lg">
            <Users className="w-6 h-6 text-white" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight">Abonnés & paiements</h1>
          </div>
          {isDG && (
            <span className="ml-auto text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-slate-200">
              Suivi — lecture seule
            </span>
          )}
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2 max-w-lg">
          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <p className="text-2xl font-black">{activeSubs}</p>
            <p className="text-[11px] font-bold text-slate-300">abos actifs</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <p className="text-2xl font-black">{pendingSubs}</p>
            <p className="text-[11px] font-bold text-slate-300">en attente</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <p className="text-2xl font-black">{pendingPayments.length}</p>
            <p className="text-[11px] font-bold text-slate-300">paiements à confirmer</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-sm text-green-800 flex gap-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0" /> {message}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 bg-white border-2 border-slate-100 rounded-2xl p-2 shadow-sm">
        {([
          { id: 'subs', label: `Abonnés (${paidSubs.length})`, icon: <Users className="w-4 h-4" /> },
            { id: 'payments', label: `Paiements (${listedPayments.length})`, icon: <Banknote className="w-4 h-4" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition ${tab === t.id ? 'bg-green-700 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ---- ABONNÉS ---- */}
      {tab === 'subs' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-2 border-b">
            <span className="text-sm font-semibold text-slate-600">Statut :</span>
            {(['all', 'pending', 'active', 'expired', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${filter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {s === 'all' ? 'Tous' : SUB_STATUS[s].label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="text-left p-3">Parent / Enfant</th><th className="text-left p-3">Formule</th><th className="text-left p-3">Période</th><th className="text-left p-3">Repas rest.</th><th className="text-left p-3">Statut</th>{!isDG && <th className="text-left p-3">Actions</th>}</tr>
              </thead>
              <tbody>
                {filteredSubs.length === 0 && (
                  <tr><td colSpan={isDG ? 5 : 6} className="p-4 text-center text-slate-400">Aucun abonnement pour ce filtre.</td></tr>
                )}
                {filteredSubs.map((s) => {
                  const kid = s.childId ? kids.find((k) => k.id === s.childId) : undefined;
                  const parent = parentOf(s.clientUsername);
                  return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">
                      {kid ? (
                        <>
                          <p className="font-bold capitalize flex items-center gap-1.5">
                            {kid.cycle === 'lycee'
                              ? <GraduationCap className="w-4 h-4 text-amber-600" />
                              : <Baby className="w-4 h-4 text-emerald-600" />}
                            {kid.firstName} {kid.lastName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <QrCode className="w-3 h-3" /> {kid.className} · {CYCLE_LABEL[kid.cycle ?? 'primaire']} · parent {parent ? `${parent.firstName} ${parent.lastName}` : s.clientUsername}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold capitalize">{parent ? `${parent.firstName} ${parent.lastName}` : s.clientUsername}</p>
                          <p className="text-xs text-slate-400">compte parent · {s.clientUsername}</p>
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{formulaName(s.formulaId)}</p>
                      <p className="mt-1">{cycleBadge(s.formulaId)}</p>
                    </td>
                    <td className="p-3 text-xs">{new Date(s.startDate).toLocaleDateString('fr-FR')} → {new Date(s.endDate).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3 font-bold">{s.mealsRemaining}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${SUB_STATUS[s.status].style}`}>{SUB_STATUS[s.status].label}</span></td>
                    {!isDG && (
                      <td className="p-3">
                        {s.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => handleEncaisser(s.id)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700">Encaisser &amp; activer</button>
                            <button onClick={() => { cancelSubscription(s.id); setMessage('Réservation annulée.'); }} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">Annuler</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- PAIEMENTS ---- */}
      {tab === 'payments' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {settlementKnown && (
            <p className="px-4 py-2.5 text-xs font-bold text-slate-500 border-b bg-slate-50">
              {validated?.payments.length ?? 0} paiement(s) validé(s) en base (règlement horodaté) — seuls ceux-là entrent en comptabilité.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="text-left p-3">Référence</th><th className="text-left p-3">Parent / Enfant</th><th className="text-left p-3">Montant</th><th className="text-left p-3">Moyen</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Règlement</th><th className="text-left p-3">Action</th></tr>
              </thead>
              <tbody>
                {listedPayments.length === 0 && walletTxs.filter((t) => t.status === 'pending').length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-slate-400">Aucun paiement.</td></tr>
                )}
                {walletTxs.filter((t) => t.status === 'pending').map((t) => {
                  const k = kids.find((c) => c.id === t.childId);
                  return (
                    <tr key={t.id} className="border-t bg-amber-50/50">
                      <td className="p-3 font-mono text-xs">{t.reference}</td>
                      <td className="p-3 font-semibold capitalize">Carte {k ? `${k.firstName} ${k.lastName}` : t.childId} (recharge)</td>
                      <td className="p-3 font-bold">{formatCurrency(t.amount)}</td>
                      <td className="p-3">{methodLabel(t.method)}</td>
                      <td className="p-3"><span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">En attente</span></td>
                      <td className="p-3"><span className="text-xs text-slate-300">—</span></td>
                      <td className="p-3">
                        {!isDG ? (
                          <button onClick={() => {
                            const ok = confirmWalletTopUp(t.id);
                            setMessage(ok ? `Recharge ${t.reference} confirmée.` : `Recharge ${t.reference} déjà traitée.`);
                          }} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Confirmer recharge
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">À confirmer au comptoir</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
{[...listedPayments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{p.reference}</td>
                    <td className="p-3">
                      <p className="font-semibold capitalize">{whoOfPayment(p)}</p>
                      {p.subscriptionId && (
                        <p className="text-xs text-slate-400">{formulaName(subscriptions.find((s) => s.id === p.subscriptionId)?.formulaId ?? '')}</p>
                      )}
                    </td>
                    <td className="p-3 font-bold">{formatCurrency(p.amount)}</td>
                    <td className="p-3">{methodLabel(p.method)}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${payStatus(p.status).style}`}>{payStatus(p.status).label}</span></td>
                    <td className="p-3">
                      {p.status !== 'paid' ? (
                        <span className="text-xs text-slate-300">—</span>
                      ) : settlementKnown ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${isSettled(p) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                          {isSettled(p) ? 'Validé' : 'Non réglé'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {p.status === 'pending' ? (
                        !isDG ? (
                          <button onClick={() => {
                            const ok = confirmManualPayment(p.id);
                            setMessage(ok ? `Paiement ${p.reference} confirmé (réception externe vérifiée).` : `Paiement ${p.reference} déjà traité.`);
                          }} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Confirmer réception
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">En attente</span>
                        )
                      ) : p.status === 'paid' ? (
                        <button onClick={() => setReceipt(p)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 flex items-center gap-1">
                          <Receipt className="w-3 h-3" /> Reçu
                        </button>
                      ) : (
                        <span className="text-slate-300"><XCircle className="w-4 h-4" /></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- REÇU IMPRIMABLE ---- */}
      {receipt && (
        <PaymentReceiptModal
          payment={receipt}
          clientName={whoOfPayment(receipt)}
          formulaName={formulaName(subscriptions.find((s) => s.id === receipt.subscriptionId)?.formulaId ?? '')}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
};

export default SubscriptionsAdminPage;
