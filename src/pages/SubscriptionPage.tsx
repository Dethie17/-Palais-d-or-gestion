import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { ORestoPayment, ORestoPaymentMethod, ORestoPaymentStatus, PageName, Subscription } from '@/types/menu';
import { composedMenus } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { isMobileMethod, type WavePaymentRequest } from '@/lib/wave';
import {
  CheckCircle, Banknote, Smartphone, Ticket, QrCode, Receipt,
  Clock, CalendarDays, UtensilsCrossed, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import TicketCard from '@/components/TicketCard';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';

const METHODS: { id: ORestoPaymentMethod; label: string; hint: string }[] = [
  { id: 'wave', label: 'Wave', hint: 'Paiement mobile : envoyez le montant, saisissez le code reçu, activation automatique' },
  { id: 'cash', label: 'Espèces', hint: 'Payez au comptoir : le Gérant encaisse et active votre carte' },
];

const METHOD_LABEL: Record<string, string> = {
  wave: 'Wave', cash: 'Espèces',
  mobile_money: 'Mobile Money', card: 'Carte bancaire',
};

const STATUS_STYLE: Record<ORestoPaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  refunded: 'bg-blue-100 text-blue-700',
};

const STATUS_LABEL: Record<ORestoPaymentStatus, string> = {
  pending: 'En attente', paid: 'Payé', failed: 'Échoué', cancelled: 'Annulé', refunded: 'Remboursé',
};

interface SubscriptionPageProps {
  onNavigate: (page: PageName) => void;
}

const SubscriptionPage = ({ onNavigate }: SubscriptionPageProps) => {
  const { user } = useAuth();
  const {
    formulas, mySubscription, mySubscriptions, myPayments,
    subscribe, paySubscription, confirmMobilePayment, resumeMobilePayment,
    cancelSubscription, renewSubscription, buyTicket,
  } = useResto();
  const [ticketMethod, setTicketMethod] = useState<ORestoPaymentMethod>('wave');
  const [payMethods, setPayMethods] = useState<Record<string, ORestoPaymentMethod>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ paymentId: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ticketRowRef = useRef<HTMLDivElement>(null);

  const scrollTickets = (dir: 1 | -1) => {
    ticketRowRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  const username = user?.username ?? '';
  const active = mySubscription(username);
  const allMine = mySubscriptions(username);
  const pendings = allMine.filter((s) => s.status === 'pending');
  const payments = myPayments(username);
  const aboFormulas = formulas.filter((f) => f.kind === 'subscription');
  const bestValue = aboFormulas.length
    ? aboFormulas.reduce((a, b) => (a.price / a.mealsIncluded <= b.price / b.mealsIncluded ? a : b)).id
    : '';

  const daysLeft = (s: Subscription) =>
    Math.max(0, Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000));

  const handleChoose = (formulaId: string, name: string) => {
    const s = subscribe(username, formulaId);
    setPayMethods((prev) => ({ ...prev, [s.id]: 'wave' }));
    setMessage({ ok: true, text: `Formule « ${name} » réservée. Choisissez votre moyen de paiement ci-dessous pour l’activer.` });
  };

  const handlePay = (subId: string) => {
    const method = payMethods[subId] ?? 'wave';
    if (isMobileMethod(method)) {
      // Reprendre un paiement mobile déjà initié plutôt que d'en créer un nouveau
      const existing = payments.find(
        (p) => p.subscriptionId === subId && p.status === 'pending' && p.method === method,
      );
      if (existing) {
        const wave = resumeMobilePayment(existing.id);
        if (wave) {
          setConfirmError(null);
          setWaveModal({ paymentId: existing.id, wave });
          return;
        }
      }
    }
    const { payment, wave } = paySubscription(subId, method);
    if (wave && isMobileMethod(method)) {
      setConfirmError(null);
      setWaveModal({ paymentId: payment.id, wave });
      return;
    }
    setMessage({
      ok: true,
      text: `Réservation enregistrée. Paiement ${payment.reference} en attente : payez ${formatCurrency(payment.amount)} en espèces au comptoir, le Gérant activera votre carte.`,
    });
  };

  const handleResumePayment = (paymentId: string) => {
    const wave = resumeMobilePayment(paymentId);
    if (!wave) {
      setMessage({ ok: false, text: 'Ce paiement ne peut plus être repris.' });
      return;
    }
    setConfirmError(null);
    setWaveModal({ paymentId, wave });
  };

  const handleConfirmWave = (code: string) => {
    if (!waveModal) return;
    setConfirming(true);
    const { ok, message: text } = confirmMobilePayment(waveModal.paymentId, code);
    setConfirming(false);
    if (!ok) {
      setConfirmError(text);
      return;
    }
    const paid = myPayments(username).find((p) => p.id === waveModal.paymentId)
      ?? payments.find((p) => p.id === waveModal.paymentId)
      ?? null;
    setWaveModal(null);
    setConfirmError(null);
    if (paid) setReceipt({ ...paid, status: 'paid' });
    setMessage({ ok: true, text });
  };

  const handleCancel = (subId: string) => {
    cancelSubscription(subId);
    setMessage({ ok: true, text: 'Réservation annulée.' });
  };

  const handleRenew = (subId: string) => {
    const result = renewSubscription(subId, 'wave');
    if (!result) return;
    if (result.wave) {
      setConfirmError(null);
      setWaveModal({ paymentId: result.payment.id, wave: result.wave });
      return;
    }
    setMessage({ ok: true, text: `Renouvellement réservé. Paiement ${result.payment.reference} en attente au comptoir.` });
  };

  const handleBuyTicket = (formulaId: string, menuName: string) => {
    const { payment, addedMeals, wave } = buyTicket(username, formulaId, ticketMethod);
    if (wave && isMobileMethod(ticketMethod)) {
      setConfirmError(null);
      setWaveModal({ paymentId: payment.id, wave });
      return;
    }
    setMessage({ ok: true, text: `Ticket « ${menuName} » : +${addedMeals} repas crédité(s). Paiement ${payment.reference} (${formatCurrency(payment.amount)} via ${METHOD_LABEL[ticketMethod]}).` });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Mon abonnement</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900 text-white"><span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-black">1</span> Je choisis</span>
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600"><span className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[11px] font-black">2</span> Je paie (Wave, espèces)</span>
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600"><span className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[11px] font-black">3</span> Je présente mon QR</span>
        </div>
      </div>

      {message && (
        <div className={`rounded-2xl p-4 flex gap-2 text-sm font-medium border ${message.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {/* ---- MA CARTE ACTIVE ---- */}
      <section>
        <h2 className="font-bold text-slate-800 mb-3">Ma carte d’abonnement</h2>
        {active ? (
          <ActiveCard
            sub={active}
            formulaName={formulas.find((f) => f.id === active.formulaId)?.name ?? 'Formule'}
            included={formulas.find((f) => f.id === active.formulaId)?.mealsIncluded ?? active.mealsRemaining}
            rules={formulas.find((f) => f.id === active.formulaId)?.rules}
            days={daysLeft(active)}
            onQR={() => onNavigate('qrcode')}
            onRenew={() => handleRenew(active.id)}
          />
        ) : (
          <div className="bg-white rounded-2xl border p-6 text-center text-sm text-slate-500">
            Aucune carte active. Choisissez une formule ci-dessous ou achetez un ticket repas.
          </div>
        )}
      </section>

      {/* ---- EN ATTENTE DE PAIEMENT ---- */}
      {pendings.length > 0 && (
        <section>
          <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Clock className="w-5 h-5 text-amber-500" /> En attente de paiement ({pendings.length})</h2>
          <div className="space-y-3">
            {pendings.map((s) => {
              const f = formulas.find((x) => x.id === s.formulaId);
              const m = payMethods[s.id] ?? 'wave';
              return (
                <div key={s.id} className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-lg">{f?.name}</p>
                      <p className="text-sm text-slate-600">
                        {f?.mealsIncluded} repas • {f?.durationDays} jours • <span className="font-extrabold">{formatCurrency(f?.price ?? 0)}</span>
                      </p>
                      <p className="text-xs text-slate-500">Réservé le {new Date(s.startDate).toLocaleDateString('fr-FR')} — payez pour activer la carte.</p>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-200 text-amber-900 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> EN ATTENTE</span>
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {METHODS.map((x) => (
                      <button
                        key={x.id}
                        onClick={() => setPayMethods((prev) => ({ ...prev, [s.id]: x.id }))}
                        title={x.hint}
                        className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold border ${m === x.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600'}`}
                      >
                        {x.id === 'cash' ? <Banknote className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />} {x.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">{METHODS.find((x) => x.id === m)?.hint}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => handlePay(s.id)} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700">
                      Payer {formatCurrency(f?.price ?? 0)}
                    </button>
                    <button onClick={() => handleCancel(s.id)} className="px-4 py-3 rounded-xl bg-white border text-slate-500 font-semibold text-sm hover:bg-slate-50">
                      Annuler
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- COMPARATEUR DE FORMULES ---- */}
      <section>
        <h2 className="font-bold text-slate-800 mb-1">Nos formules</h2>
        <p className="text-sm text-slate-500 mb-3">La réservation est gratuite : vous ne payez qu’à l’étape suivante.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {aboFormulas.map((f) => (
            <div key={f.id} className={`bg-white rounded-2xl border-2 shadow-sm p-5 flex flex-col relative ${f.id === bestValue ? 'border-green-400' : 'border-slate-100'}`}>
              {f.id === bestValue && (
                <span className="absolute -top-3 left-4 text-xs font-bold px-3 py-1 rounded-full bg-green-500 text-white">MEILLEUR PRIX / REPAS</span>
              )}
              <p className="font-bold text-lg mt-1">{f.name}</p>
              <p className="text-sm text-slate-500">{f.description}</p>
              <p className="text-3xl font-extrabold mt-3">{formatCurrency(f.price)}</p>
              <p className="text-sm font-semibold text-orange-600">≈ {formatCurrency(Math.round(f.price / f.mealsIncluded))} / repas</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                <li className="flex items-center gap-1"><UtensilsCrossed className="w-4 h-4 text-slate-400" /> {f.mealsIncluded} repas inclus</li>
                <li className="flex items-center gap-1"><CalendarDays className="w-4 h-4 text-slate-400" /> Valable {f.durationDays} jours</li>
              </ul>
              {f.rules && <p className="text-xs text-slate-400 mt-2 italic">{f.rules}</p>}
              <button onClick={() => handleChoose(f.id, f.name)} className="mt-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700">
                Choisir cette formule
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ---- TICKETS REPAS ---- */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-1">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Ticket className="w-5 h-5 text-orange-500" /> Tickets repas de la cantine</h2>
            <p className="text-sm text-slate-500">Sans abonnement : 1 ticket = 1 repas crédité aussitôt après paiement. Faites défiler pour tout voir.</p>
          </div>
          <div className="hidden sm:flex gap-2 flex-shrink-0">
            <button onClick={() => scrollTickets(-1)} title="Voir les tickets précédents" className="p-2.5 rounded-xl bg-white border shadow-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => scrollTickets(1)} title="Voir les tickets suivants" className="p-2.5 rounded-xl bg-white border shadow-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center mb-3">
          <span className="text-sm font-semibold text-slate-600">Payer avec :</span>
          {METHODS.map((x) => (
            <button key={x.id} onClick={() => setTicketMethod(x.id)} className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold border ${ticketMethod === x.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
              {x.id === 'cash' ? <Banknote className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />} {x.label}
            </button>
          ))}
        </div>
        <div ref={ticketRowRef} className="ticket-row flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-1 px-1">
          {composedMenus.map((m) => (
            <TicketCard
              key={m.id}
              day={m.day}
              name={m.name}
              description={m.description}
              image={m.image}
              items={m.items}
              total={m.total}
              className="min-w-[270px] max-w-[300px] sm:min-w-[300px] shrink-0 snap-start"
              action={
                <button onClick={() => handleBuyTicket(m.formulaId, m.name)} className="w-full py-2 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">
                  Acheter ce ticket
                </button>
              }
            />
          ))}
        </div>
      </section>

      {/* ---- MES ANCIENNES CARTES ---- */}
      {allMine.filter((s) => s.status === 'expired' || s.status === 'cancelled').length > 0 && (
        <section>
          <h2 className="font-bold text-slate-800 mb-3">Mes anciennes cartes</h2>
          <div className="bg-white rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="text-left p-3">Formule</th><th className="text-left p-3">Période</th><th className="text-left p-3">Statut</th><th className="text-left p-3"></th></tr>
              </thead>
              <tbody>
                {allMine.filter((s) => s.status === 'expired' || s.status === 'cancelled').map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3 font-semibold">{formulas.find((f) => f.id === s.formulaId)?.name ?? '—'}</td>
                    <td className="p-3 text-xs text-slate-500">Du {new Date(s.startDate).toLocaleDateString('fr-FR')} au {new Date(s.endDate).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3"><span className="px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">{s.status === 'expired' ? 'Expirée' : 'Annulée'}</span></td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleChoose(s.formulaId, formulas.find((f) => f.id === s.formulaId)?.name ?? '')} className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100">
                        Reprendre
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- PAIEMENTS & REÇUS ---- */}
      <section>
        <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Receipt className="w-5 h-5 text-slate-500" /> Mes paiements & reçus</h2>
        <div className="bg-white rounded-2xl border overflow-hidden">
          {payments.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aucun paiement enregistré.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="text-left p-3">Référence</th><th className="text-left p-3">Objet</th><th className="text-left p-3">Montant</th><th className="text-left p-3">Moyen</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Reçu</th></tr>
                </thead>
                <tbody>
                  {[...payments].reverse().map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{p.reference}</td>
                      <td className="p-3">{formulas.find((f) => f.id === allMine.find((s) => s.id === p.subscriptionId)?.formulaId)?.name ?? 'Ticket / Abonnement'}</td>
                      <td className="p-3 font-semibold">{formatCurrency(p.amount)}</td>
                      <td className="p-3">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                      <td className="p-3">
                        {p.status === 'paid' && (
                          <button onClick={() => setReceipt(p)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">Reçu</button>
                        )}
                        {p.status === 'pending' && isMobileMethod(p.method) && (
                          <button onClick={() => handleResumePayment(p.id)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 flex items-center gap-1">
                            <Smartphone className="w-3.5 h-3.5" /> Confirmer
                          </button>
                        )}
                        {p.status === 'pending' && !isMobileMethod(p.method) && (
                          <span className="text-xs text-slate-400">À payer au comptoir</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ---- MODAL PAIEMENT MOBILE (Wave) ---- */}
      {waveModal && (
        <WavePaymentModal
          wave={waveModal.wave}
          error={confirmError}
          confirming={confirming}
          onConfirm={handleConfirmWave}
          onClose={() => {
            setWaveModal(null);
            setConfirmError(null);
            setMessage({
              ok: true,
              text: 'Paiement mobile en attente : reprenez-le depuis « En attente de paiement » ou « Mes paiements » quand vous êtes prêt.',
            });
          }}
        />
      )}

      {/* ---- MODAL REÇU ---- */}
      {receipt && (
        <PaymentReceiptModal
          payment={receipt}
          clientName={username}
          formulaName={formulas.find((f) => f.id === allMine.find((s) => s.id === receipt.subscriptionId)?.formulaId)?.name ?? 'Ticket / Abonnement'}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
};

function ActiveCard({ sub, formulaName, included, rules, days, onQR, onRenew }: {
  sub: Subscription; formulaName: string; included: number; rules?: string; days: number;
  onQR: () => void; onRenew: () => void;
}) {
  const used = Math.max(0, included - sub.mealsRemaining);
  const pct = included > 0 ? Math.round((sub.mealsRemaining / included) * 100) : 0;
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl overflow-hidden shadow-xl">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 flex items-center justify-between">
        <p className="font-bold text-sm">● CARTE ACTIVE — {formulaName}</p>
        <p className="text-xs font-bold bg-white/25 px-3 py-1 rounded-full">J-{days} restants</p>
      </div>
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-4xl font-extrabold">{sub.mealsRemaining} <span className="text-lg font-semibold text-slate-300">repas restants</span></p>
            <p className="text-xs text-slate-400 mt-1">
              Du {new Date(sub.startDate).toLocaleDateString('fr-FR')} au {new Date(sub.endDate).toLocaleDateString('fr-FR')} • {used} repas consommés
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onQR} className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-sm">
              <QrCode className="w-4 h-4" /> Mon QR
            </button>
            <button onClick={onRenew} className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-400">
              <RefreshCw className="w-4 h-4" /> Renouveler
            </button>
          </div>
        </div>
        {rules && <p className="text-xs text-slate-400 mt-3 italic">Règle : {rules}</p>}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Solde repas</span><span>{sub.mealsRemaining} / {included}</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionPage;
