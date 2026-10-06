import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { ORestoPayment, ORestoPaymentMethod, ORestoPaymentStatus, PageName, Subscription } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { isMobileMethod, type WavePaymentRequest } from '@/lib/wave';
import { isOfficialFormula } from '@/lib/formulas';
import {
  CheckCircle, Banknote, Smartphone, Ticket, QrCode, Receipt,
  Clock, CalendarDays, UtensilsCrossed, AlertCircle, RefreshCw,
  Baby, BadgeCheck, Crown, GraduationCap, Sparkles, ShieldCheck,
  Wallet, History, ChevronRight, Info, Star,
} from 'lucide-react';
import { CYCLES, FORMULA_CYCLE } from '@/lib/schoolCycles';
import type { SchoolCycle } from '@/types/menu';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';

const METHODS: { id: ORestoPaymentMethod; label: string; hint: string }[] = [
  { id: 'wave', label: 'Wave', hint: 'Paiement mobile instantané — activation automatique après le code à 6 chiffres.' },
  { id: 'cash', label: 'Espèces', hint: 'Payez au comptoir — le Caissier encaisse et active la carte aussitôt.' },
];

const METHOD_LABEL: Record<string, string> = {
  wave: 'Wave', cash: 'Espèces',
  mobile_money: 'Mobile Money', card: 'Carte bancaire',
  balance: 'Solde carte',
};

const STATUS_STYLE: Record<ORestoPaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  paid: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  failed: 'bg-red-100 text-red-700 border border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border border-slate-200',
  refunded: 'bg-slate-100 text-slate-600 border border-slate-200',
};

const STATUS_LABEL: Record<ORestoPaymentStatus, string> = {
  pending: 'En attente', paid: 'Payé', failed: 'Échoué', cancelled: 'Annulé', refunded: 'Remboursé',
};

/** Métadonnées d’affichage par formule — système cantine scolaire 2026 */
const FORMULA_META: Record<string, { badge?: string; badgeStyle?: string; audience: string; icon: typeof Crown; highlight?: boolean; tagline: string }> = {
  F1: {
    badge: 'Découverte',
    badgeStyle: 'bg-slate-900 text-white',
    audience: 'Tous niveaux — essai 1 semaine',
    icon: Sparkles,
    tagline: 'Tester la cantine sans engagement',
  },
  F2: {
    badge: 'Le plus choisi',
    badgeStyle: 'bg-emerald-500 text-white',
    audience: 'Préscolaire & Élémentaire',
    icon: Baby,
    highlight: true,
    tagline: 'La cantine sereine tout le mois',
  },
  F3: {
    badge: 'Second cycle',
    badgeStyle: 'bg-slate-600 text-white',
    audience: 'Lycée · 6ème → Terminale',
    icon: GraduationCap,
    tagline: 'Le repas costaud des grands',
  },
};

interface SubscriptionPageProps {
  onNavigate: (page: PageName) => void;
}

const SubscriptionPage = ({ onNavigate }: SubscriptionPageProps) => {
  const { user } = useAuth();
  const {
    formulas, mySubscription, mySubscriptions, myPayments,
    subscribe, paySubscription, confirmMobilePayment, resumeMobilePayment,
    cancelSubscription, renewSubscription, buyTicket, myChildren, addChild,
    parentProfileOf,
  } = useResto();
  const [payMethods, setPayMethods] = useState<Record<string, ORestoPaymentMethod>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ paymentId: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const username = user?.username ?? '';
  const active = mySubscription(username);
  const allMine = mySubscriptions(username);
  const pendings = allMine.filter((s) => s.status === 'pending');
  const payments = myPayments(username);
  const kids = myChildren(username);
  const profile = parentProfileOf(username);

  const ABO_ORDER = ['F2', 'F3'];
  // Parents : Lycée + Présco-Élém + formules créées (F1 hebdo masquée).
  const aboFormulas = formulas
    .filter((f) => f.kind === 'subscription' && !f.name.startsWith('[Ancien]') && (f.id === 'F2' || f.id === 'F3' || !isOfficialFormula(f.id)))
    .sort((a, b) => {
      const ia = ABO_ORDER.indexOf(a.id);
      const ib = ABO_ORDER.indexOf(b.id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  const bestValue = aboFormulas.length
    ? aboFormulas.reduce((a, b) => (a.price / a.mealsIncluded <= b.price / b.mealsIncluded ? a : b)).id
    : '';
  // Tickets créés par le Personnel : seuls eux s'affichent côté parent (avec toutes les infos).
  const customTickets = formulas
    .filter((f) => f.kind === 'ticket' && !f.name.startsWith('[Ancien]') && !isOfficialFormula(f.id))
    .sort((a, b) => a.price - b.price);

  const paidCount = payments.filter((p) => p.status === 'paid').length;
  const pendingPaymentsCount = payments.filter((p) => p.status === 'pending').length;
  const kidsPrimaire = kids.filter((k) => (k.cycle ?? 'primaire') === 'primaire').length;
  const kidsLycee = kids.filter((k) => k.cycle === 'lycee').length;

  const daysLeft = (s: Subscription) =>
    Math.max(0, Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000));

  const pricePerMeal = (price: number, meals: number) => (meals > 0 ? Math.round(price / meals) : price);

  const handleChoose = (formulaId: string, name: string) => {
    const s = subscribe(username, formulaId);
    setPayMethods((prev) => ({ ...prev, [s.id]: 'wave' }));
    setMessage({ ok: true, text: `Formule « ${name} » réservée. Choisissez Wave ou Espèces ci-dessous pour l’activer.` });
    setTimeout(() => document.getElementById('pending-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  const handlePay = (subId: string) => {
    const method = payMethods[subId] ?? 'wave';
    if (isMobileMethod(method)) {
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
      text: `Réservation enregistrée (${payment.reference} — ${formatCurrency(payment.amount)}). Présentez-vous au comptoir : le Caissier activera la carte après encaissement.`,
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
    setMessage({ ok: true, text: 'Réservation annulée. Vous pouvez choisir une autre formule à tout moment.' });
  };

  const handleRenew = (subId: string, method: ORestoPaymentMethod = 'wave') => {
    const result = renewSubscription(subId, method);
    if (!result) {
      setMessage({ ok: false, text: 'Renouvellement impossible : soldez ou annulez d’abord la réservation en attente.' });
      return;
    }
    if (result.wave && isMobileMethod(method)) {
      setConfirmError(null);
      setWaveModal({ paymentId: result.payment.id, wave: result.wave });
      return;
    }
    if (method === 'cash') {
      setMessage({ ok: true, text: `Renouvellement réservé (${result.payment.reference}). Payez au comptoir : le Caissier prolongera la carte aussitôt.` });
      return;
    }
    setMessage({ ok: true, text: `Renouvellement réservé (${result.payment.reference}), en attente de confirmation.` });
  };

  // Achat ticket créé par le Personnel : Wave uniquely (paiement mobile, code à confirmer).
  const handleBuyTicket = (formulaId: string, menuName: string) => {
    try {
      const { payment, addedMeals, wave } = buyTicket(username, formulaId, 'wave');
      if (wave) {
        setConfirmError(null);
        setWaveModal({ paymentId: payment.id, wave });
        return;
      }
      setMessage({ ok: true, text: `« ${menuName} » : +${addedMeals} repas crédité(s). Paiement ${payment.reference} (${formatCurrency(payment.amount)} via Wave).` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Achat impossible.' });
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 md:pt-8 space-y-8">
        {message && (
          <div className={`rounded-2xl p-4 flex gap-3 text-sm font-medium border shadow-sm animate-fade-in ${message.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ===== 1. JE M'INSCRIS (par cycle) ===== */}
        <section>
          <SectionHead
            kicker="Étape 1 — Je m’inscris"
            title="J’inscris mes enfants"
          />
          <div className="grid md:grid-cols-2 gap-4">
            {!profile && (
              <div className="md:col-span-2 rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 flex flex-wrap items-center gap-3 text-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="font-semibold text-amber-800 flex-1 min-w-[200px]">Avant d’inscrire vos enfants, créez votre profil parent (nom, prénom, téléphone) — 30 secondes.</p>
                <button onClick={() => onNavigate('children')} className="px-5 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600">
                  Créer mon profil
                </button>
              </div>
            )}
            {CYCLES.map((cycle) => (
              <QuickEnrollCycle
                key={cycle.id}
                cycleId={cycle.id}
                username={username}
                hasProfile={!!profile}
                addChild={addChild}
                kidsCount={cycle.id === 'lycee' ? kidsLycee : kidsPrimaire}
                onDone={(n) => setMessage({ ok: true, text: n })}
                onManage={() => onNavigate('children')}
              />
            ))}
          </div>
        </section>
      </div>

      {/* ===== HERO PRO ===== */}
      <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-green-800 text-white overflow-hidden mt-6 md:mt-8">
        <div className="max-w-6xl mx-auto px-4 md:px-8 pt-8 pb-10 md:pt-12 md:pb-12 relative">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-slate-500/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em]">
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-emerald-200">Espace parents</span>
              <span className="px-3 py-1.5 rounded-full bg-emerald-400 text-emerald-950">Année scolaire 2026</span>
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-slate-200">Lun → Ven · Service du midi</span>
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight leading-tight">
              Abonnements cantine
            </h1>
            <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-300">
              Une carte par enfant, un QR permanent, 1 repas par jour le midi.
              Réservez en ligne, payez <strong className="text-white">Wave</strong> ou <strong className="text-white">Espèces au comptoir</strong>, la carte s’active aussitôt.
            </p>

            {/* KPIs */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
              <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-emerald-300" /> Carte active</p>
                <p className="mt-1 text-xl font-black">{active ? `${active.mealsRemaining} repas` : '—'}</p>
                <p className="text-xs text-slate-400">{active ? `J-${daysLeft(active)} avant expiration` : 'Aucune pour le moment'}</p>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-1.5"><Baby className="w-3.5 h-3.5 text-emerald-300" /> Enfants</p>
                <p className="mt-1 text-xl font-black">{kids.length} inscrit(s)</p>
                <p className="text-[11px] text-slate-400">{kidsPrimaire} présco-élém · {kidsLycee} lycée</p>
                <p className={`text-[11px] font-bold ${profile ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {profile ? `✓ Parent : ${profile.firstName} ${profile.lastName}` : '! Profil parent à compléter'}
                </p>
                <button onClick={() => onNavigate('children')} className="text-xs font-bold text-emerald-300 hover:underline flex items-center gap-0.5">Gérer par cycle <ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-300" /> En attente</p>
                <p className="mt-1 text-xl font-black">{pendings.length + pendingPaymentsCount}</p>
                <p className="text-xs text-slate-400">réservation(s) / paiement(s)</p>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 text-emerald-300" /> Reçus</p>
                <p className="mt-1 text-xl font-black">{paidCount}</p>
                <p className="text-xs text-slate-400">paiement(s) soldé(s)</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
        {/* ===== CRÉDIT MIAM'S ===== */}
        <section>
          <SectionHead
            kicker="Mon solde"
            title="Crédit Miam’s"
          />
          {active ? (
            <ActiveCard
              sub={active}
              formulaName={formulas.find((f) => f.id === active.formulaId)?.name ?? 'Formule'}
              included={formulas.find((f) => f.id === active.formulaId)?.mealsIncluded ?? active.mealsRemaining}
              durationDays={formulas.find((f) => f.id === active.formulaId)?.durationDays ?? 30}
              rules={formulas.find((f) => f.id === active.formulaId)?.rules}
              days={daysLeft(active)}
              pricePerMeal={pricePerMeal(
                formulas.find((f) => f.id === active.formulaId)?.price ?? 0,
                formulas.find((f) => f.id === active.formulaId)?.mealsIncluded ?? 1,
              )}
              onQR={() => onNavigate('qrcode')}
              onRenew={(method) => handleRenew(active.id, method)}
              onChildren={() => onNavigate('children')}
            />
          ) : (
            <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Wallet className="w-7 h-7 text-slate-400" />
              </div>
              <p className="mt-3 font-extrabold text-slate-800 text-lg">Aucune carte active</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                Choisissez une formule d’abonnement ci-dessous.
                {kids.length === 0 && ' Pensez d’abord à inscrire votre enfant pour lui générer son QR Carte.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {kids.length === 0 && (
                  <button onClick={() => onNavigate('children')} className="px-5 py-2.5 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800 flex items-center gap-1.5">
                    <Baby className="w-4 h-4" /> Inscrire mon enfant
                  </button>
                )}
                <a href="#formules" className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">
                  Voir les formules
                </a>
              </div>
            </div>
          )}
        </section>

        {/* ===== EN ATTENTE ===== */}
        {pendings.length > 0 && (
          <section id="pending-block" className="scroll-mt-24">
            <SectionHead
              kicker={`${pendings.length} dossier(s)`}
              title="Finalisez votre inscription"
            />
            <div className="grid md:grid-cols-2 gap-4">
              {pendings.map((s) => {
                const f = formulas.find((x) => x.id === s.formulaId);
                const m = payMethods[s.id] ?? 'wave';
                return (
                  <div key={s.id} className="bg-gradient-to-b from-amber-50 to-white border-2 border-amber-200 rounded-3xl p-5 md:p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Réservation en attente</p>
                        <p className="font-extrabold text-lg text-slate-900 mt-1">{f?.name}</p>
                        <p className="text-sm text-slate-600 mt-0.5">
                          {f?.mealsIncluded} repas · {f?.durationDays} jours · <span className="font-extrabold text-slate-900">{formatCurrency(f?.price ?? 0)}</span>
                          <span className="text-slate-400"> · {formatCurrency(pricePerMeal(f?.price ?? 0, f?.mealsIncluded ?? 1))} / repas</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Réservé le {new Date(s.startDate).toLocaleDateString('fr-FR')} — sans paiement, sans engagement.</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {METHODS.map((x) => (
                        <button
                          key={x.id}
                          onClick={() => setPayMethods((prev) => ({ ...prev, [s.id]: x.id }))}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                            m === x.id ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {x.id === 'cash' ? <Banknote className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />} {x.label}
                          {m === x.id && <CheckCircle className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 flex gap-1.5"><Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{METHODS.find((x) => x.id === m)?.hint}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => handlePay(s.id)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 shadow-sm">
                        {m === 'wave' ? 'Payer avec Wave' : 'Valider — payer au comptoir'} · {formatCurrency(f?.price ?? 0)}
                      </button>
                      <button onClick={() => handleCancel(s.id)} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50">
                        Annuler
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== CATALOGUE ABONNEMENTS PAR CYCLE ===== */}
        <section id="formules" className="scroll-mt-24">
          <SectionHead
            kicker="Cantine scolaire · 1 repas / jour midi · Lun → Ven"
            title="Mes formules d’abonnement"
          />
          <div className="space-y-4">
            {CYCLES.map((cycle) => {
              const monthly = aboFormulas.filter((f) => FORMULA_CYCLE[f.id] === cycle.id);
              if (monthly.length === 0) return null;
              const CycleIcon = cycle.id === 'lycee' ? GraduationCap : Baby;
              return (
                <div key={cycle.id} className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden">
                  <div className={`px-5 md:px-6 py-4 flex flex-wrap items-center gap-3 ${cycle.id === 'lycee' ? 'bg-gradient-to-r from-amber-500 to-slate-600' : 'bg-gradient-to-r from-emerald-600 to-teal-600'}`}>
                    <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <CycleIcon className="w-6 h-6 text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-white text-lg leading-tight">{cycle.label}</p>
                      <p className="text-xs text-white/80">{cycle.classes.join(' · ')}</p>
                    </div>
                    <button onClick={() => onNavigate('children')} className="ml-auto text-xs font-extrabold px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 flex items-center gap-1">
                      <Baby className="w-3.5 h-3.5" /> Inscrire un enfant de ce cycle
                    </button>
                  </div>
                  <div className="p-4 md:p-5 grid gap-4">
                    {monthly.map((f) => (
                      <FormulaCard
                        key={f.id}
                        formulaId={f.id}
                        name={f.name}
                        description={f.description}
                        price={f.price}
                        oldPrice={f.oldPrice}
                        meals={f.mealsIncluded}
                        days={f.durationDays}
                        rules={f.rules}
                        meta={FORMULA_META[f.id]}
                        isBest={f.id === bestValue}
                        onChoose={() => handleChoose(f.id, f.name)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

          </div>
        </section>

        {/* ===== TICKETS & CARNETS (créés par le Personnel) ===== */}
        {customTickets.length > 0 && (
          <section>
            <SectionHead
              kicker="Dépannage"
              title="Tickets & carnet repas"
            />
            <div className="grid md:grid-cols-2 gap-4">
              {customTickets.map((t) => {
                const isCarnet = t.mealsIncluded > 1;
                return (
                  <div key={t.id} className={`bg-white rounded-3xl border-2 p-6 flex flex-col shadow-sm ${isCarnet ? 'border-slate-300 ring-4 ring-slate-100' : 'border-slate-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isCarnet ? 'bg-gradient-to-br from-slate-500 to-amber-500' : 'bg-slate-900'}`}>
                          <Ticket className="w-6 h-6 text-white" />
                        </span>
                        <div>
                          <h3 className="font-extrabold text-slate-900">{t.name}</h3>
                          <p className="text-sm text-slate-500">{t.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-3xl font-black text-slate-900">{formatCurrency(t.price)}</span>
                      <span className="text-sm font-bold text-slate-600 mb-1">· {t.mealsIncluded} repas · {t.durationDays} jours</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">≈ {formatCurrency(pricePerMeal(t.price, t.mealsIncluded))} / repas</p>
                    {t.rules && <p className="text-[11px] text-slate-400 mt-2 italic">{t.rules}</p>}
                    <button onClick={() => handleBuyTicket(t.id, t.name)} className={`mt-4 w-full py-3 rounded-xl font-bold text-sm transition ${isCarnet ? 'bg-slate-500 text-white hover:bg-slate-600 shadow-md' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
                      {isCarnet ? 'Acheter le carnet' : 'Acheter ce ticket'} · {formatCurrency(t.price)}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== ANCIENNES CARTES ===== */}
        {allMine.filter((s) => s.status === 'expired' || s.status === 'cancelled').length > 0 && (
          <section>
            <SectionHead kicker="Historique" title="Mes anciennes cartes" />
            <div className="bg-white rounded-3xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                    <tr><th className="text-left p-4">Formule</th><th className="text-left p-4">Période</th><th className="text-left p-4">Statut</th><th className="text-right p-4">Action</th></tr>
                  </thead>
                  <tbody>
                    {allMine.filter((s) => s.status === 'expired' || s.status === 'cancelled').map((s) => (
                      <tr key={s.id} className="border-t hover:bg-slate-50/60">
                        <td className="p-4 font-bold text-slate-800">{formulas.find((f) => f.id === s.formulaId)?.name ?? '—'}</td>
                        <td className="p-4 text-xs text-slate-500 whitespace-nowrap">Du {new Date(s.startDate).toLocaleDateString('fr-FR')} au {new Date(s.endDate).toLocaleDateString('fr-FR')}</td>
                        <td className="p-4"><span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border">{s.status === 'expired' ? 'Expirée' : 'Annulée'}</span></td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleChoose(s.formulaId, formulas.find((f) => f.id === s.formulaId)?.name ?? '')} className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-extrabold hover:bg-emerald-100 border border-emerald-200">
                            Reprendre
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===== PAIEMENTS & REÇUS ===== */}
        <section>
          <SectionHead
            kicker="Transparence"
            title="Mes paiements & reçus"
          />
          <div className="bg-white rounded-3xl border overflow-hidden">
            {payments.length === 0 ? (
              <div className="p-10 text-center">
                <History className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="mt-2 text-sm text-slate-500">Aucun paiement enregistré. Votre historique apparaîtra ici après la première réservation.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                    <tr><th className="text-left p-4">Référence</th><th className="text-left p-4">Objet</th><th className="text-left p-4">Montant</th><th className="text-left p-4">Moyen</th><th className="text-left p-4">Statut</th><th className="text-right p-4">Reçu</th></tr>
                  </thead>
                  <tbody>
                    {[...payments].reverse().map((p) => (
                      <tr key={p.id} className="border-t hover:bg-slate-50/60">
                        <td className="p-4 font-mono text-xs font-bold text-slate-700">{p.reference}</td>
                        <td className="p-4 text-slate-600">{formulas.find((f) => f.id === allMine.find((s) => s.id === p.subscriptionId)?.formulaId)?.name ?? 'Ticket / Abonnement'}</td>
                        <td className="p-4 font-extrabold whitespace-nowrap">{formatCurrency(p.amount)}</td>
                        <td className="p-4"><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">{p.method === 'cash' ? <Banknote className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}{METHOD_LABEL[p.method] ?? p.method}</span></td>
                        <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                        <td className="p-4 text-right">
                          {p.status === 'paid' && (
                            <button onClick={() => setReceipt(p)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700">Reçu</button>
                          )}
                          {p.status === 'pending' && isMobileMethod(p.method) && (
                            <button onClick={() => handleResumePayment(p.id)} className="px-4 py-2 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-800 inline-flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5" /> Confirmer
                            </button>
                          )}
                          {p.status === 'pending' && !isMobileMethod(p.method) && (
                            <span className="text-xs text-slate-400 font-semibold">À payer au comptoir</span>
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

        <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pb-4">
          <ShieldCheck className="w-3.5 h-3.5" /> Paiements sécurisés · Reçus imprimables · Support au comptoir de la cantine
        </p>
      </div>

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
              text: 'Paiement mobile en attente : reprenez-le depuis « Finalisez votre inscription » ou « Mes paiements » quand vous êtes prêt.',
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

/** Inscription rapide d’enfants d’un même cycle : nombre + nom, prénom, classe. */
function QuickEnrollCycle({ cycleId, username, hasProfile, addChild, kidsCount, onDone, onManage }: {
  cycleId: SchoolCycle; username: string; hasProfile: boolean;
  addChild: (parent: string, first: string, last: string, cls: string, cycle?: SchoolCycle) => { firstName: string; lastName: string };
  kidsCount: number; onDone: (text: string) => void; onManage: () => void;
}) {
  const cycle = CYCLES.find((c) => c.id === cycleId)!;
  const CycleIcon = cycleId === 'lycee' ? GraduationCap : Baby;
  const [count, setCount] = useState(1);
  const [rows, setRows] = useState([{ first: '', last: '', cls: '' }]);
  const setRow = (i: number, patch: Partial<{ first: string; last: string; cls: string }>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const changeCount = (n: number) => {
    const c = Math.min(6, Math.max(1, n || 1));
    setCount(c);
    setRows((prev) => Array.from({ length: c }, (_, i) => prev[i] ?? { first: '', last: '', cls: '' }));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!hasProfile) {
          onDone('Créez d’abord votre profil parent (bouton ci-dessus) : nom, prénom et téléphone.');
          return;
        }
        try {
          if (rows.some((r) => !r.cls)) {
            onDone('Choisissez la classe de chaque enfant dans la liste du cycle.');
            return;
          }
          const names: string[] = [];
          rows.forEach((r) => {
            const c = addChild(username, r.first, r.last, r.cls, cycleId);
            names.push(`${c.firstName} ${c.lastName}`);
          });
          setRows(Array.from({ length: count }, () => ({ first: '', last: '', cls: '' })));
          onDone(`Inscrits en ${cycle.label} : ${names.join(', ')}. QR Carte généré pour chacun — passez à l’étape 2.`);
        } catch {
          onDone('Vérifiez nom, prénom et classe de chaque enfant.');
        }
      }}
      className={`rounded-3xl border-2 p-5 ${cycleId === 'lycee' ? 'bg-gradient-to-b from-amber-50 to-white border-amber-200' : 'bg-gradient-to-b from-emerald-50 to-white border-emerald-200'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${cycleId === 'lycee' ? 'bg-slate-600' : 'bg-emerald-600'}`}>
            <CycleIcon className="w-5 h-5 text-white" />
          </span>
          <div>
            <p className="font-extrabold text-slate-800 text-sm">{cycle.label}</p>
            <p className="text-[11px] text-slate-500">{kidsCount} enfant(s) déjà inscrit(s) · {cycle.classes.join(' · ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" role="group" aria-label="Nombre d'enfants à inscrire">
          <span className="text-[11px] font-bold text-slate-600">Nombre</span>
          <button
            type="button"
            onClick={() => changeCount(count - 1)}
            disabled={count <= 1}
            aria-label="Un enfant de moins"
            className="w-8 h-8 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-black text-base leading-none hover:border-green-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span aria-live="polite" className="w-7 text-center text-sm font-black text-slate-800">{count}</span>
          <button
            type="button"
            onClick={() => changeCount(count + 1)}
            disabled={count >= 6}
            aria-label="Un enfant de plus (maximum 6)"
            className="w-8 h-8 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-black text-base leading-none hover:border-green-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label htmlFor={`enfant-nom-${i}`} className="sr-only">Nom de l’enfant {i + 1}</label>
              <input id={`enfant-nom-${i}`} value={r.last} onChange={(e) => setRow(i, { last: e.target.value })} placeholder={`Nom ${i + 1} *`} required autoComplete="family-name" className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700 min-w-0 w-full" />
            </div>
            <div>
              <label htmlFor={`enfant-prenom-${i}`} className="sr-only">Prénom de l’enfant {i + 1}</label>
              <input id={`enfant-prenom-${i}`} value={r.first} onChange={(e) => setRow(i, { first: e.target.value })} placeholder={`Prénom ${i + 1} *`} required autoComplete="given-name" className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700 min-w-0 w-full" />
            </div>
            <div>
              <label htmlFor={`enfant-classe-${i}`} className="sr-only">Classe de l’enfant {i + 1}</label>
              <select id={`enfant-classe-${i}`} value={r.cls} onChange={(e) => setRow(i, { cls: e.target.value })} required className="px-2 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700 bg-white min-w-0 w-full">
                <option value="">Classe *</option>
                {cycle.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <button type="submit" className="btn-primary mt-3 w-full py-2.5">
        Inscrire {count > 1 ? `ces ${count} enfants` : 'cet enfant'} + QR Carte
      </button>
      <button type="button" onClick={onManage} className="mt-1.5 w-full text-xs font-bold text-slate-500 hover:text-slate-700">
        Gérer (recharger, abonner, suivre) dans « Mes enfants » →
      </button>
    </form>
  );
}

function FormulaCard({ formulaId, name, description, price, oldPrice, meals, days, rules, meta, isBest, onChoose }: {
  formulaId: string; name: string; description: string; price: number; oldPrice?: number;
  meals: number; days: number; rules?: string;
  meta?: { badge?: string; badgeStyle?: string; audience: string; icon: typeof Crown; highlight?: boolean; tagline: string };
  isBest: boolean; onChoose: () => void;
}) {
  const Icon = meta?.icon ?? Ticket;
  const perMeal = meals > 0 ? Math.round(price / meals) : price;
  const discount = oldPrice && oldPrice > price ? oldPrice - price : 0;
  return (
    <article
      className={`relative bg-white rounded-2xl border-2 p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow ${
        meta?.highlight ? 'border-emerald-400 ring-4 ring-emerald-100' : isBest && !meta?.highlight ? 'border-emerald-300' : 'border-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${meta?.badgeStyle ?? 'bg-slate-100 text-slate-600'}`}>
          {meta?.badge ?? 'Mensuel'}
        </span>
        {isBest && (
          <span className="text-[11px] font-black px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <Star className="w-3 h-3" /> Meilleur prix / repas
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-white" />
        </span>
        <div>
          <h3 className="font-extrabold text-slate-900 leading-tight text-[15px]">{name}</h3>
          <p className="text-xs font-bold text-emerald-700">{meta?.audience ?? 'Cantine scolaire'}</p>
        </div>
      </div>
      <p className="text-[13px] text-slate-500 mt-2">{description}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-[28px] leading-none font-black tracking-tight text-slate-900">{formatCurrency(price)}</span>
        {discount > 0 && (
          <span className="text-sm text-slate-400 line-through font-semibold">{formatCurrency(oldPrice!)}</span>
        )}
      </div>
      {discount > 0 ? (
        <p className="mt-1.5 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 inline-flex px-2.5 py-1 rounded-full w-fit">
          Offre de rentrée : −{formatCurrency(discount)} économisés
        </p>
      ) : (
        <p className="mt-1.5 text-xs font-bold text-slate-500">≈ {formatCurrency(perMeal)} par repas</p>
      )}
      <ul className="mt-3 space-y-1.5 text-[13px] text-slate-700 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
        <li className="flex items-center gap-2"><UtensilsCrossed className="w-4 h-4 text-emerald-600" /> <strong>{meals} repas</strong>&nbsp;inclus</li>
        <li className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-600" /> Valable <strong>&nbsp;{days} jours</strong></li>
        <li className="flex items-center gap-2"><QrCode className="w-4 h-4 text-emerald-600" /> QR Carte unique & permanent</li>
      </ul>
      {rules && <p className="text-[11px] text-slate-400 mt-2 italic">Règle : {rules}</p>}
      <button
        onClick={onChoose}
        className={`mt-3 w-full py-3 rounded-xl font-bold text-sm transition ${
          meta?.highlight ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md' : 'bg-slate-900 text-white hover:bg-slate-700'
        }`}
      >
        Choisir · {formatCurrency(price)}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">Réservation gratuite · paiement à l’étape suivante</p>
    </article>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">{kicker}</p>
      <h2 className="mt-1 text-xl md:text-2xl font-black tracking-tight text-slate-900">{title}</h2>
    </div>
  );
}

function ActiveCard({ sub, formulaName, included, durationDays, rules, days, pricePerMeal, onQR, onRenew, onChildren }: {
  sub: Subscription; formulaName: string; included: number; durationDays: number; rules?: string; days: number; pricePerMeal: number;
  onQR: () => void; onRenew: (method: ORestoPaymentMethod) => void; onChildren: () => void;
}) {
  const used = Math.max(0, included - sub.mealsRemaining);
  const pct = included > 0 ? Math.round((sub.mealsRemaining / included) * 100) : 0;
  const urgent = days <= 3 || sub.mealsRemaining <= 3;
  const planLabel = durationDays <= 7 ? 'ABONNEMENT SEMAINE' : 'ABONNEMENT MENSUEL';
  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white rounded-3xl overflow-hidden shadow-xl border border-slate-800">
      <div className={`px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 ${urgent ? 'bg-gradient-to-r from-amber-500 to-slate-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
        <p className="font-extrabold text-sm flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          {planLabel} — {formulaName}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold bg-black/25 px-3 py-1.5 rounded-full">J-{days} restants</span>
          <span className="text-xs font-extrabold bg-black/25 px-3 py-1.5 rounded-full">≈ {formatCurrency(pricePerMeal)} / repas</span>
        </div>
      </div>
      <div className="p-5 md:p-7">
        {urgent && (
          <p className="mb-4 text-xs font-bold bg-amber-400/15 border border-amber-400/30 text-amber-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> Carte bientôt épuisée — renouvelez dès maintenant pour éviter toute coupure à la cantine.
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-5xl font-black tracking-tight">{sub.mealsRemaining} <span className="text-lg font-semibold text-slate-300">repas restants</span></p>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Du {new Date(sub.startDate).toLocaleDateString('fr-FR')} au {new Date(sub.endDate).toLocaleDateString('fr-FR')} · {used} repas consommés sur {included}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={onQR} className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-amber-400 text-slate-900 font-extrabold text-sm hover:bg-amber-300 shadow" title="Votre badge repas personnel">
              <QrCode className="w-4 h-4" /> Mon QR Carte
            </button>
            <button onClick={() => onRenew('wave')} className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-emerald-500 text-white font-extrabold text-sm hover:bg-emerald-400 shadow">
              <RefreshCw className="w-4 h-4" /> Payer avec Wave
            </button>
            <button onClick={() => onRenew('cash')} className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-sm hover:bg-white/20">
              <Banknote className="w-4 h-4" /> Payer au comptoir
            </button>
          </div>
        </div>
        {rules && <p className="text-xs text-slate-400 mt-3 italic flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Règle : {rules}</p>}
        <div className="mt-5">
          <div className="flex justify-between text-xs font-bold text-slate-300 mb-1.5">
            <span>Solde repas</span><span>{sub.mealsRemaining} / {included} · {pct}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/15 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct <= 20 ? 'bg-gradient-to-r from-red-400 to-slate-400' : 'bg-gradient-to-r from-emerald-400 to-teal-300'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <button onClick={onChildren} className="mt-4 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1">
          <Baby className="w-3.5 h-3.5" /> Assigner / suivre cette carte par enfant dans « Mes enfants » <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default SubscriptionPage;
