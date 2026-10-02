import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { formatCurrency } from '@/lib/utils';
import { getChildQrToken } from '@/lib/clientQr';
import { initiateWavePayment, isMobileMethod, type WavePaymentRequest } from '@/lib/wave';
import { isOfficialFormula } from '@/lib/formulas';
import { CYCLES, CYCLE_LABEL, FORMULA_CYCLE, cycleOfClass, pricePerMeal } from '@/lib/schoolCycles';
import type { Child, ORestoPayment, ORestoPaymentMethod, ORestoPaymentStatus, SchoolCycle, Subscription, WalletTx, WeeklyMenu } from '@/types/menu';
import { QRCodeSVG } from 'qrcode.react';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import {
  CheckCircle, AlertCircle, Baby, GraduationCap, Wallet, History, Banknote, Smartphone,
  Ticket, QrCode, Receipt, CalendarDays, UtensilsCrossed, Star,
  ShieldCheck, Sparkles, Crown, Copy, Download, Printer,
  Pencil, Trash2, X, Check,
} from 'lucide-react';

const METHOD_LABEL: Record<string, string> = {
  intouch: 'InTouch', wave: 'Wave', cash: 'Espèces',
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
    badgeStyle: 'bg-indigo-600 text-white',
    audience: 'Lycée · 6ème → Terminale',
    icon: GraduationCap,
    tagline: 'Le repas costaud des grands',
  },
};

const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * Espace Parent — parcours continu en 5 étapes :
 * 1 inscription → 2 formule → 3 paiement InTouch → 4 cartes → 5 historique complet.
 * Aucune navigation externe : tout se fait par ancres internes.
 */
const EspaceParentPage = () => {
  const { user } = useAuth();
  const {
    formulas, mySubscription, mySubscriptions, myPayments, myValidations,
    subscribe, paySubscription, confirmMobilePayment, resumeMobilePayment,
    renewSubscription, buyTicket, myChildren, addChild,
    updateChild, deleteChild, weeklyMenus, topUpChild, confirmWalletTopUpMobile,
    parentProfileOf, walletOf, childTxs,
  } = useResto();

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ kind: 'sub' | 'topup'; paymentId?: string; txId?: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [histChild, setHistChild] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);
  /** Choix en cours : la fenêtre InTouch s'ouvre aussitôt l'enfant confirmé. */
  const [choice, setChoice] = useState<{ formulaId: string; name: string } | null>(null);
  /** Recharge carte QR : enfant + montant (preset ou libre). */
  const [rechargeChild, setRechargeChild] = useState('');
  const [rechargePreset, setRechargePreset] = useState<number | null>(2000);
  const [rechargeCustom, setRechargeCustom] = useState('');
  /** Ticket à payer avec une carte prépayée : choix de la carte à débiter. */
  const [ticketAlt, setTicketAlt] = useState<{ formulaId: string; name: string } | null>(null);
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const username = user?.username ?? '';
  const active = mySubscription(username);
  const allMine = mySubscriptions(username);
  const payments = myPayments(username);
  const kids = myChildren(username);
  const profile = parentProfileOf(username);

  const flash = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    window.setTimeout(() => setMessage(null), 8000);
  };

  const ABO_ORDER = ['F2', 'F3'];
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
  const customTickets = formulas
    .filter((f) => f.kind === 'ticket' && !f.name.startsWith('[Ancien]') && !isOfficialFormula(f.id))
    .sort((a, b) => a.price - b.price);

  const nowTs = Date.now();
  const activeSubs = allMine.filter((s) => s.status === 'active' && new Date(s.endDate).getTime() >= nowTs);
  const activeByChild = (childId: string) => activeSubs.find((s) => s.childId === childId);
  const eligibleKids = kids.filter((k) => !activeByChild(k.id));

  const totals = useMemo(() => {
    const balance = kids.reduce((s, k) => s + walletOf(k.id), 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const spent = kids
      .flatMap((k) => childTxs(k.id))
      .filter((t) => t.status === 'paid' && (t.kind === 'debit' || t.kind === 'subscription') && new Date(t.createdAt) >= monthStart)
      .reduce((s, t) => s + t.amount, 0);
    const mealsLeft = activeSubs.reduce((s, sub) => s + sub.mealsRemaining, 0);
    return { balance, spent, mealsLeft };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids, allMine, walletOf, childTxs]);

  const paidCount = payments.filter((p) => p.status === 'paid').length;
  const pendingPaymentsCount = payments.filter((p) => p.status === 'pending').length;
  const kidsPrimaire = kids.filter((k) => (k.cycle ?? 'primaire') === 'primaire').length;
  const kidsLycee = kids.filter((k) => k.cycle === 'lycee').length;

  const daysLeft = (s: Subscription) =>
    Math.max(0, Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000));

  const childNameOf = useCallback((sub: Subscription) => {
    if (!sub.childId) return null;
    const k = kids.find((x) => x.id === sub.childId);
    return k ? `${k.firstName} ${k.lastName}` : null;
  }, [kids]);

  const pendingByChild = (childId: string) =>
    allMine.some((s) => s.status === 'pending' && s.childId === childId);

  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const subscribedCount = kids.filter((k) => activeByChild(k.id)).length;
  const statusLine = kids.length === 0
    ? 'Commencez par inscrire un enfant'
    : subscribedCount === kids.length
      ? 'Tous vos enfants sont abonnés'
      : `${subscribedCount} / ${kids.length} enfant${kids.length > 1 ? 's' : ''} abonné${subscribedCount > 1 ? 's' : ''}`;

  // ---------- Choix formule → validation InTouch directe (moyen unique) ----------
  const subscribeAndPay = (formulaId: string, name: string, childId: string) => {
    try {
      const sub = subscribe(username, formulaId, childId);
      const { payment, wave } = paySubscription(sub.id, 'intouch', sub);
      setChoice(null);
      if (!wave) {
        flash(false, 'Paiement InTouch indisponible pour le moment — réessayez.');
        return;
      }
      setConfirmError(null);
      setWaveModal({ kind: 'sub', paymentId: payment.id, wave });
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Opération impossible.');
    }
  };

  const eligibleOrEmpty = (formulaId: string, name: string) => {
    if (eligibleKids.length === 0) {
      if (kids.length === 0) {
        flash(false, 'Inscrivez d’abord votre enfant ci-dessus pour lui générer son QR Carte.');
        setTimeout(() => scrollTo('inscription'), 150);
      } else {
        flash(true, 'Tous vos enfants sont déjà abonnés — retrouvez le détail dans l’historique en bas de page.');
        setTimeout(() => scrollTo('historique'), 150);
      }
      return true;
    }
    return false;
  };

  /** « Choisir » → InTouch direct : la fenêtre de validation s'ouvre aussitôt. */
  const handleChooseDirect = (formulaId: string, name: string) => {
    if (eligibleOrEmpty(formulaId, name)) return;
    if (eligibleKids.length === 1) {
      subscribeAndPay(formulaId, name, eligibleKids[0].id);
      return;
    }
    setChoice({ formulaId, name });
    flash(true, `Formule « ${name} » : choisissez pour quel enfant — la fenêtre InTouch s’ouvrira aussitôt.`);
    setTimeout(() => scrollTo('choix-enfant'), 150);
  };

  // ---------- Recharge carte QR (achats divers) ----------
  const rechargeAmount = (() => {
    const custom = parseInt(rechargeCustom.replace(/\D/g, ''), 10);
    if (Number.isFinite(custom) && custom > 0) return custom;
    return rechargePreset ?? 0;
  })();

  const handleRecharge = () => {
    const childId = rechargeChild || kids[0]?.id;
    if (!childId) {
      flash(false, 'Inscrivez d’abord un enfant à l’étape 1.');
      setTimeout(() => scrollTo('inscription'), 150);
      return;
    }
    if (!rechargeAmount || rechargeAmount <= 0) {
      flash(false, 'Choisissez ou saisissez un montant à recharger.');
      return;
    }
    try {
      const res = topUpChild(childId, rechargeAmount, 'intouch');
      const wave = 'wave' in res ? res.wave : undefined;
      if (wave) {
        setConfirmError(null);
        setWaveModal({ kind: 'topup', txId: res.tx.id, wave });
        return;
      }
      flash(true, 'Recharge enregistrée.');
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Recharge impossible.');
    }
  };

  const handleResumeTopup = (tx: WalletTx) => {
    if (!isMobileMethod(tx.method)) return;
    const wave = initiateWavePayment(tx.amount, tx.method, tx.reference);
    setConfirmError(null);
    setWaveModal({ kind: 'topup', txId: tx.id, wave });
  };

  const handleResumePayment = (paymentId: string) => {
    const wave = resumeMobilePayment(paymentId);
    if (!wave) {
      flash(false, 'Ce paiement ne peut plus être repris.');
      return;
    }
    setConfirmError(null);
    setWaveModal({ kind: 'sub', paymentId, wave });
  };

  const handleConfirmWave = (code: string) => {
    if (!waveModal) return;
    setConfirming(true);
    if (waveModal.kind === 'topup' && waveModal.txId) {
      const { ok, message: text } = confirmWalletTopUpMobile(waveModal.txId, code);
      setConfirming(false);
      if (!ok) {
        setConfirmError(text);
        return;
      }
      setWaveModal(null);
      setConfirmError(null);
      setRechargeCustom('');
      flash(true, text);
      return;
    }
    if (!waveModal.paymentId) {
      setConfirming(false);
      return;
    }
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
    flash(true, text);
  };

  const handleRenew = (subId: string, method: ORestoPaymentMethod = 'intouch') => {
    const result = renewSubscription(subId, method);
    if (!result) {
      flash(false, 'Renouvellement impossible : soldez ou annulez d’abord la réservation en attente.');
      return;
    }
    if (result.wave && isMobileMethod(method)) {
      setConfirmError(null);
      setWaveModal({ kind: 'sub', paymentId: result.payment.id, wave: result.wave });
      return;
    }
    if (method === 'cash') {
      flash(true, `Renouvellement réservé (${result.payment.reference}). Payez au comptoir : le Gérant prolongera la carte aussitôt.`);
      return;
    }
    flash(true, `Renouvellement réservé (${result.payment.reference}), en attente de confirmation.`);
  };

  const handleBuyTicket = (formulaId: string, menuName: string) => {
    try {
      const { payment, addedMeals, wave } = buyTicket(username, formulaId, 'intouch');
      if (wave) {
        setConfirmError(null);
        setWaveModal({ kind: 'sub', paymentId: payment.id, wave });
        return;
      }
      flash(true, `« ${menuName} » : +${addedMeals} repas crédité(s). Paiement ${payment.reference} (${formatCurrency(payment.amount)} via InTouch).`);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Achat impossible.');
    }
  };

  const openTicketAlt = (formulaId: string, name: string) => {
    if (kids.length === 0) {
      flash(false, 'Inscrivez d’abord un enfant pour utiliser sa carte prépayée.');
      setTimeout(() => scrollTo('inscription'), 150);
      return;
    }
    setTicketAlt({ formulaId, name });
    setTimeout(() => scrollTo('ticket-choix-carte'), 150);
  };

  /** Ticket payé avec la carte prépayée : débit immédiat, solde suivi dans l'historique. */
  const handleBuyTicketBalance = (formulaId: string, childId: string) => {
    try {
      const price = formulas.find((x) => x.id === formulaId)?.price ?? 0;
      const before = walletOf(childId);
      const { addedMeals } = buyTicket(username, formulaId, 'balance', childId);
      setTicketAlt(null);
      const k = kids.find((x) => x.id === childId);
      flash(true, `Ticket crédité : +${addedMeals} repas sur la carte de ${k?.firstName ?? 'l’enfant'}. Nouveau solde : ${formatCurrency(before - price)}.`);
      setTimeout(() => scrollTo('cartes'), 400);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Achat impossible.');
    }
  };

  // ---------- QR helpers ----------
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

  // ---------- Solde restant après chaque opération ----------
  // Calculé à rebours depuis le solde actuel : exact même si l'historique est partiel.
  const soldeAfterByTx = useMemo(() => {
    const map: Record<string, number> = {};
    kids.forEach((k) => {
      const txs = childTxs(k.id)
        .filter((t) => t.status === 'paid')
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      let running = walletOf(k.id);
      txs.forEach((t) => {
        map[t.id] = running;
        running -= t.kind === 'topup' || t.kind === 'refund' ? t.amount : -t.amount;
      });
    });
    return map;
  }, [kids, childTxs, walletOf]);

  // ---------- Historique complet ----------
  const historyRows = useMemo(() => {
    const payList = myPayments(username).map((p) => ({
      kind: 'pay' as const,
      id: p.id,
      date: p.createdAt,
      child: childNameOf(allMine.find((s) => s.id === p.subscriptionId) as Subscription | undefined) ?? 'Abonnement',
      label: `Paiement ${p.reference} — ${METHOD_LABEL[p.method] ?? p.method}`,
      amount: -p.amount,
      status: p.status,
      solde: null as number | null,
      tx: null as WalletTx | null,
      payment: p,
    }));
    const walletList = kids
      .filter((k) => histChild === 'all' || k.id === histChild)
      .flatMap((k) =>
        childTxs(k.id).map((t) => ({
          kind: 'wallet' as const,
          id: t.id,
          date: t.createdAt,
          child: `${k.firstName} ${k.lastName}`,
          label: t.label ?? (t.kind === 'topup' ? 'Recharge carte' : t.kind === 'subscription' ? 'Abonnement' : 'Repas'),
          amount: t.kind === 'topup' || t.kind === 'refund' ? t.amount : -t.amount,
          status: t.status,
          solde: soldeAfterByTx[t.id] ?? null,
          tx: t,
          payment: null as ORestoPayment | null,
        })),
      );
    const validList = myValidations(username)
      .filter(() => histChild === 'all')
      .map((v) => ({
        kind: 'valid' as const,
        id: v.id,
        date: v.validatedAt,
        child: 'Cantine',
        label: v.status === 'accepted' ? 'Repas servi' : `Repas refusé${v.reason ? ` — ${v.reason}` : ''}`,
        amount: 0,
        status: v.status === 'accepted' ? 'paid' : 'failed',
        solde: null as number | null,
        tx: null as WalletTx | null,
        payment: null as ORestoPayment | null,
      }));
    return [...payList, ...walletList, ...validList].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [myPayments, username, kids, childTxs, histChild, myValidations, allMine, soldeAfterByTx, childNameOf]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-10 space-y-8">
        {/* ===== HERO PREMIUM + TABLEAU DE BORD ===== */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl">
          <div aria-hidden className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-emerald-500/25 blur-3xl" />
          <div aria-hidden className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]">
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-emerald-200">Espace parent</span>
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-slate-200 capitalize">{todayLabel}</span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight">
              Bonjour, {username}
            </h1>
            <p className="mt-1.5 text-sm text-slate-300 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${subscribedCount === kids.length && kids.length > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
              {statusLine} · Cantine scolaire, 1 repas le midi Lun → Ven
            </p>
            <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {[
                { label: kids.length > 1 ? 'Enfants inscrits' : 'Enfant inscrit', value: String(kids.length), sub: `${subscribedCount} abonné${subscribedCount > 1 ? 's' : ''}` },
                { label: 'Repas restants', value: String(totals.mealsLeft), sub: 'toutes cartes' },
                { label: 'Solde cartes', value: formatCurrency(totals.balance), sub: 'crédit cantine' },
                { label: 'Dépensé ce mois', value: formatCurrency(totals.spent), sub: 'repas + abos' },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-white/[0.07] border border-white/10 backdrop-blur px-3.5 py-3">
                  <dd className="text-base sm:text-xl font-black tracking-tight truncate">{s.value}</dd>
                  <dt className="text-[11px] sm:text-xs text-white/60 font-semibold mt-0.5">{s.label}</dt>
                  <p className="text-[11px] text-white/40">{s.sub}</p>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Fil de continuité : les 6 étapes, sans quitter la page */}
        <nav aria-label="Étapes du parcours" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap">
          {[
            { id: 'inscription', n: '1', label: 'Inscription' },
            { id: 'formules', n: '2', label: 'Formule' },
            { id: 'menu', n: '3', label: 'Menu' },
            { id: 'tickets', n: '4', label: 'Tickets' },
            { id: 'cartes', n: '5', label: 'Carte' },
            { id: 'historique', n: '6', label: 'Historique' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-700 transition-colors min-h-[36px]"
            >
              <span className="w-[18px] h-[18px] rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">{s.n}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {message && (
          <div role="status" className={`rounded-2xl p-4 flex gap-3 text-sm font-medium border shadow-sm animate-fade-in ${message.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ===== ÉTAPE 1 — JE M'INSCRIS (par cycle) ===== */}
        <section id="inscription" className="scroll-mt-24">
          <SectionHead kicker="Étape 1 — Je m’inscris" title="J’inscris mes enfants" />
          <div className="grid md:grid-cols-2 gap-4">
            {!profile && (
              <div className="md:col-span-2 rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 flex flex-wrap items-center gap-3 text-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="font-semibold text-amber-800 flex-1 min-w-[200px]">Créez votre profil parent (nom, prénom, téléphone) pour inscrire vos enfants — 30 secondes.</p>
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
                onDone={(n) => flash(true, n)}
              />
            ))}
          </div>
          {/* Enfants inscrits : chacun aura sa formule, sa carte prépayée et son QR Code */}
          <div className="mt-5">
            <p className="text-sm font-extrabold text-slate-800 mb-2">Mes enfants inscrits <span className="font-normal text-slate-400">· chacun aura sa formule, sa carte et son QR Code</span></p>
            {kids.length === 0 ? (
              <p className="text-sm text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-center">
                Aucun enfant pour l’instant — remplissez un formulaire ci-dessus, il apparaîtra ici avec sa carte.
              </p>
            ) : (
              <ChildManager
                kids={kids}
                activeByChild={activeByChild}
                pendingByChild={pendingByChild}
                walletOf={walletOf}
                updateChild={updateChild}
                deleteChild={deleteChild}
                flash={flash}
              />
            )}
          </div>
        </section>

        {/* ===== ÉTAPE 2 — FORMULES ===== */}
        <section id="formules" className="scroll-mt-24">
          <SectionHead kicker="Étape 2 — Je choisis la formule" title="Mes formules d’abonnement" />
          <p className="text-[13px] text-slate-500 -mt-2 mb-4">Cantine scolaire · 1 repas / jour midi · Lun → Ven</p>
          {choice && (
            <div id="choix-enfant" className="mb-4 rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4 scroll-mt-24">
              <p className="text-sm font-bold text-indigo-900">Formule « {choice.name} » <span className="font-normal text-indigo-700">— pour quel enfant ?</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                {eligibleKids.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => subscribeAndPay(choice.formulaId, choice.name, k.id)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
                  >
                    {k.firstName} {k.lastName} · {k.className}
                  </button>
                ))}
                <button onClick={() => setChoice(null)} className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50">
                  Annuler
                </button>
              </div>
              <p className="mt-2 text-[11px] text-indigo-700">La fenêtre de validation InTouch s’ouvrira aussitôt.</p>
            </div>
          )}
          <div className="space-y-4">
            {CYCLES.map((cycle) => {
              const monthly = aboFormulas.filter((f) => FORMULA_CYCLE[f.id] === cycle.id);
              if (monthly.length === 0) return null;
              const CycleIcon = cycle.id === 'lycee' ? GraduationCap : Baby;
              return (
                <div key={cycle.id} className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden">
                  <div className={`px-5 md:px-6 py-4 flex flex-wrap items-center gap-3 ${cycle.id === 'lycee' ? 'bg-gradient-to-r from-indigo-600 to-blue-700' : 'bg-gradient-to-r from-emerald-600 to-teal-600'}`}>
                    <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <CycleIcon className="w-6 h-6 text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-white text-lg leading-tight">{cycle.label}</p>
                      <p className="text-xs text-white/80">{cycle.classes.join(' · ')}</p>
                    </div>
                    <button onClick={() => scrollTo('inscription')} className="ml-auto text-xs font-extrabold px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 flex items-center gap-1">
                      <Baby className="w-3.5 h-3.5" /> Inscrire un enfant de ce cycle
                    </button>
                  </div>
                  <div className="p-4 md:p-5 grid gap-4">
                    {monthly.map((f) => (
                      <FormulaCard
                        key={f.id}
                        name={f.name}
                        description={f.description}
                        price={f.price}
                        oldPrice={f.oldPrice}
                        meals={f.mealsIncluded}
                        days={f.durationDays}
                        rules={f.rules}
                        meta={FORMULA_META[f.id]}
                        isBest={f.id === bestValue}
                        accent={cycle.id === 'lycee' ? 'indigo' : 'emerald'}
                        onChoose={() => handleChooseDirect(f.id, f.name)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ===== ÉTAPE 3 — MENU DE LA CANTINE (lecture seule) ===== */}
        <section id="menu" className="scroll-mt-24">
          <SectionHead kicker="Étape 3 — Je découvre" title="Menu de la cantine" />
          <WeekMenu menus={weeklyMenus} />
        </section>

        {/* Étape 5 : la validation se fait dans la fenêtre InTouch qui s’ouvre dès le choix — aucun bloc d’attente, le suivi est dans l’historique. */}

        {/* ===== TICKETS & CARNETS ===== */}
        <section id="tickets" className="scroll-mt-24">
          <SectionHead kicker="Étape 4 — Tickets resto" title="Tickets & carnet repas" />
          {customTickets.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Ticket className="w-7 h-7 text-slate-400" />
              </div>
              <p className="mt-3 font-extrabold text-slate-800">Aucun ticket pour le moment</p>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">La cantine n’a encore rien publié — les tickets et carnets apparaîtront ici dès leur mise en vente.</p>
            </div>
          ) : (
            <>
            {ticketAlt && (
              <div id="ticket-choix-carte" className="mb-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 scroll-mt-24">
                <p className="text-sm font-bold text-orange-900">« {ticketAlt.name} » <span className="font-normal text-orange-700">— débiter quelle carte ?</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {kids.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => handleBuyTicketBalance(ticketAlt.formulaId, k.id)}
                      className="px-4 py-2.5 min-h-[44px] rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 tabular-nums"
                    >
                      {k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}
                    </button>
                  ))}
                  <button onClick={() => setTicketAlt(null)} className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50">
                    Annuler
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-orange-700">Débit immédiat — le solde restant apparaît dans l’historique.</p>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              {customTickets.map((t) => {
                const isCarnet = t.mealsIncluded > 1;
                return (
                  <div key={t.id} className={`bg-white rounded-3xl border-2 p-6 flex flex-col shadow-sm ${isCarnet ? 'border-orange-300 ring-4 ring-orange-100' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isCarnet ? 'bg-gradient-to-br from-orange-500 to-amber-500' : 'bg-slate-900'}`}>
                        <Ticket className="w-6 h-6 text-white" />
                      </span>
                      <div>
                        <h3 className="font-extrabold text-slate-900">{t.name}</h3>
                        <p className="text-sm text-slate-500">{t.description}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-3xl font-black text-slate-900">{formatCurrency(t.price)}</span>
                      <span className="text-sm font-bold text-orange-600 mb-1">· {t.mealsIncluded} repas · {t.durationDays} jours</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">≈ {formatCurrency(pricePerMeal(t.price, t.mealsIncluded))} / repas</p>
                    {t.rules && <p className="text-[11px] text-slate-400 mt-2 italic">{t.rules}</p>}
                    <button onClick={() => handleBuyTicket(t.id, t.name)} className={`mt-4 w-full py-3 min-h-[48px] rounded-xl font-bold text-sm transition ${isCarnet ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
                      {isCarnet ? 'Acheter le carnet' : 'Acheter ce ticket'} · {formatCurrency(t.price)}
                    </button>
                    <button onClick={() => openTicketAlt(t.id, t.name)} className="mt-1.5 w-full py-2 min-h-[40px] rounded-xl font-bold text-xs text-orange-700 hover:text-orange-800 underline underline-offset-2">
                      Payer avec la carte prépayée
                    </button>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </section>

        {/* ===== ÉTAPE 5 — MA CARTE PRÉPAYÉE (solde + recharge + QR) ===== */}
        <section id="cartes" className="scroll-mt-24">
          <SectionHead kicker="Étape 5 — Ma carte prépayée" title="Crédit O Resto" />
          {activeSubs.length > 0 ? (
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white rounded-3xl overflow-hidden shadow-xl border border-slate-800">
              <div className="px-5 md:px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500">
                <p className="font-extrabold text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                  {totals.mealsLeft} repas restants · {formatCurrency(totals.balance)} de solde carte
                </p>
              </div>
              <ul className="p-5 md:p-6 space-y-3">
                {activeSubs.map((s) => {
                  const f = formulas.find((x) => x.id === s.formulaId);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm">{childNameOf(s) ?? f?.name ?? 'Carte'}</p>
                        <p className="text-xs text-slate-400">
                          {s.mealsRemaining} repas · J-{daysLeft(s)} · jusqu’au {new Date(s.endDate).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleRenew(s.id, 'intouch')} className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white font-extrabold text-xs hover:bg-emerald-400">
                          <Smartphone className="w-3.5 h-3.5" /> Renouveler via InTouch
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Wallet className="w-7 h-7 text-slate-400" />
              </div>
              <p className="mt-3 font-extrabold text-slate-800 text-lg">Aucune carte active</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                Validez un paiement à l’étape 5 pour activer la carte.
                {kids.length === 0 && ' Pensez d’abord à inscrire votre enfant pour lui générer son QR Carte.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {kids.length === 0 && (
                  <button onClick={() => scrollTo('inscription')} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                    Inscrire mon enfant
                  </button>
                )}
                <button onClick={() => scrollTo('formules')} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">
                  Voir les formules
                </button>
              </div>
            </div>
          )}
          {/* Recharge de la carte QR — crédit pour les achats divers */}
          {kids.length > 0 && (
            <div className="mt-4 bg-white rounded-3xl border-2 border-slate-100 p-5 md:p-6">
              <p className="font-extrabold text-slate-900">Recharger une carte</p>
              <p className="text-[13px] text-slate-500 mt-0.5">Crédit utilisable pour les achats divers à la cantine — validation InTouch immédiate, solde visible dans l’historique.</p>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Enfant à recharger">
                {kids.map((k) => {
                  const sel = (rechargeChild || kids[0].id) === k.id;
                  return (
                    <button
                      key={k.id}
                      onClick={() => setRechargeChild(k.id)}
                      aria-pressed={sel}
                      className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition ${sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    >
                      {k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Montant à recharger">
                {[1000, 2000, 5000, 10000].map((a) => (
                  <button
                    key={a}
                    onClick={() => { setRechargePreset(a); setRechargeCustom(''); }}
                    aria-pressed={rechargePreset === a && !rechargeCustom}
                    className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 tabular-nums transition ${rechargePreset === a && !rechargeCustom ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
                  >
                    {formatCurrency(a)}
                  </button>
                ))}
                <label htmlFor="recharge-libre" className="sr-only">Montant libre en FCFA</label>
                <input
                  id="recharge-libre"
                  inputMode="numeric"
                  value={rechargeCustom}
                  onChange={(e) => setRechargeCustom(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Autre montant"
                  className="px-3.5 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-xs font-bold tabular-nums outline-none focus:border-emerald-600 w-36 bg-white"
                />
              </div>
              <button onClick={handleRecharge} className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/25">
                <Smartphone aria-hidden className="w-4 h-4" /> Recharger{rechargeAmount > 0 ? ` · ${formatCurrency(rechargeAmount)}` : ''} via InTouch
              </button>
            </div>
          )}
          {/* QR Code de chaque enfant : sa carte personnelle pour la cantine et les achats */}
          {kids.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-extrabold text-slate-800 mb-2">Mes QR Codes <span className="font-normal text-slate-400">· un badge par enfant, à présenter à la cantine et pour les achats</span></p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {kids.map((k) => {
                const token = k.qrToken || getChildQrToken(k.id);
                const sub = activeByChild(k.id);
                return (
                  <li key={k.id} className="bg-white rounded-2xl border-2 border-slate-100 p-4 flex items-center gap-3">
                    <div ref={(el) => { qrRefs.current[k.id] = el; }} className="p-1.5 border border-slate-200 bg-white flex-shrink-0">
                      <QRCodeSVG value={token} size={96} level="M" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{k.firstName} {k.lastName}</p>
                      <p className="text-xs text-slate-400 truncate">{k.className}</p>
                      <p className="font-mono text-xs font-semibold tracking-[0.12em] text-slate-600">{token}</p>
                      <p className={`text-[11px] font-bold ${sub ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {sub ? `${sub.mealsRemaining} repas restants` : 'Sans abonnement'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 no-print">
                        <button onClick={() => copyToken(token)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
                          <Copy aria-hidden className="w-3 h-3" /> {copied === token ? 'Copié' : 'Copier'}
                        </button>
                        <button onClick={() => downloadPNG(k.id, token, `${k.firstName} ${k.lastName}`)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
                          <Download aria-hidden className="w-3 h-3" /> PNG
                        </button>
                        <button onClick={() => window.print()} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
                          <Printer aria-hidden className="w-3 h-3" /> Imprimer
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            </div>
          )}
        </section>

        {/* ===== ANCIENNES CARTES ===== */}
        {allMine.filter((s) => s.status === 'expired' || s.status === 'cancelled').length > 0 && (
          <section>
            <SectionHead kicker="Suivi" title="Mes anciennes cartes" />
            <div className="bg-white rounded-3xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                    <tr><th className="text-left p-4">Formule</th><th className="text-left p-4">Enfant</th><th className="text-left p-4">Période</th><th className="text-left p-4">Statut</th><th className="text-right p-4">Action</th></tr>
                  </thead>
                  <tbody>
                    {allMine.filter((s) => s.status === 'expired' || s.status === 'cancelled').map((s) => (
                      <tr key={s.id} className="border-t hover:bg-slate-50/60">
                        <td className="p-4 font-bold text-slate-800">{formulas.find((f) => f.id === s.formulaId)?.name ?? '—'}</td>
                        <td className="p-4 text-slate-600">{childNameOf(s) ?? '—'}</td>
                        <td className="p-4 text-xs text-slate-500 whitespace-nowrap">Du {new Date(s.startDate).toLocaleDateString('fr-FR')} au {new Date(s.endDate).toLocaleDateString('fr-FR')}</td>
                        <td className="p-4"><span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border">{s.status === 'expired' ? 'Expirée' : 'Annulée'}</span></td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleChooseDirect(s.formulaId, formulas.find((f) => f.id === s.formulaId)?.name ?? '')} className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-extrabold hover:bg-emerald-100 border border-emerald-200">
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

        {/* ===== HISTORIQUE COMPLET EN BAS ===== */}
        <section id="historique" className="scroll-mt-24">
          <SectionHead kicker="Étape 6 — Je suis mes dépenses" title="Historique de toutes les dépenses" />
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Filtrer par enfant">
            {[{ id: 'all', label: 'Tous' }, ...kids.map((k) => ({ id: k.id, label: k.firstName }))].map((o) => (
              <button
                key={o.id}
                onClick={() => setHistChild(o.id)}
                aria-pressed={histChild === o.id}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${histChild === o.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                {o.label}
              </button>
            ))}
            <span className="ml-auto text-[13px] font-bold text-slate-700">Ce mois : <span className="text-emerald-700 font-black">{formatCurrency(totals.spent)}</span></span>
          </div>
          <div className="bg-white rounded-3xl border overflow-hidden">
            {historyRows.length === 0 ? (
              <div className="p-10 text-center">
                <History className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="mt-2 text-sm text-slate-500">Aucun paiement enregistré. Votre historique apparaîtra ici après la première réservation.</p>
              </div>
            ) : (
              <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                    <tr><th className="text-left p-4">Date</th><th className="text-left p-4">Enfant</th><th className="text-left p-4">Opération</th><th className="text-right p-4">Montant</th><th className="text-right p-4">Solde restant</th><th className="text-right p-4">Statut / Reçu</th></tr>
                  </thead>
                  <tbody>
                    {historyRows.slice(0, 80).map((r) => (
                      <tr key={`${r.kind}-${r.id}`} className="border-t hover:bg-slate-50/60">
                        <td className="p-4 text-slate-400 text-[13px] whitespace-nowrap">{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</td>
                        <td className="p-4 font-bold text-slate-800 text-[13px]">{r.child}</td>
                        <td className="p-4 text-slate-500 text-[13px]">{r.label}</td>
                        <td className={`p-4 text-right font-black text-[13px] tabular-nums ${r.amount > 0 ? 'text-emerald-700' : r.amount < 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                          {r.amount > 0 ? '+' : ''}{r.amount === 0 ? '—' : formatCurrency(r.amount)}
                        </td>
                        <td className="p-4 text-right tabular-nums text-[13px] font-bold text-slate-500">
                          {r.solde != null ? formatCurrency(r.solde) : '—'}
                        </td>
                        <td className="p-4 text-right">
                          {r.kind === 'pay' && r.payment ? (
                            <span className="inline-flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.payment.status]}`}>{STATUS_LABEL[r.payment.status]}</span>
                              {r.payment.status === 'paid' && (
                                <button onClick={() => setReceipt(r.payment)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700">Reçu</button>
                              )}
                              {r.payment.status === 'pending' && isMobileMethod(r.payment.method) && (
                                <button onClick={() => handleResumePayment(r.payment!.id)} className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-bold hover:bg-green-800 inline-flex items-center gap-1">
                                  <Smartphone className="w-3.5 h-3.5" /> Confirmer
                                </button>
                              )}
                            </span>
                          ) : r.kind === 'wallet' && r.status === 'pending' && r.tx && isMobileMethod(r.tx.method) ? (
                            <span className="inline-flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.status as ORestoPaymentStatus]}`}>{STATUS_LABEL[r.status as ORestoPaymentStatus]}</span>
                              <button onClick={() => handleResumeTopup(r.tx)} className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-bold hover:bg-green-800 inline-flex items-center gap-1">
                                <Smartphone className="w-3.5 h-3.5" /> Confirmer
                              </button>
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.status as ORestoPaymentStatus] ?? STATUS_STYLE.paid}`}>{STATUS_LABEL[r.status as ORestoPaymentStatus] ?? r.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Cartes empilées sur mobile : même contenu, sans scroll horizontal */}
              <ul className="md:hidden divide-y divide-slate-100">
                {historyRows.slice(0, 60).map((r) => (
                  <li key={`${r.kind}-${r.id}`} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{r.child}</p>
                        <p className="text-[13px] text-slate-500">{r.label}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-black tabular-nums ${r.amount > 0 ? 'text-emerald-700' : r.amount < 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                          {r.amount > 0 ? '+' : ''}{r.amount === 0 ? '—' : formatCurrency(r.amount)}
                        </p>
                        {r.solde != null && (
                          <p className="text-[11px] text-slate-400 tabular-nums">Solde {formatCurrency(r.solde)}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      <div className="flex items-center gap-2 min-h-[44px]">
                        {r.kind === 'pay' && r.payment ? (
                          <>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.payment.status]}`}>{STATUS_LABEL[r.payment.status]}</span>
                            {r.payment.status === 'paid' && (
                              <button onClick={() => setReceipt(r.payment)} className="px-4 py-2 min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700">Reçu</button>
                            )}
                            {r.payment.status === 'pending' && isMobileMethod(r.payment.method) && (
                              <button onClick={() => handleResumePayment(r.payment!.id)} className="px-4 py-2 min-h-[44px] rounded-lg bg-green-700 text-white text-xs font-bold hover:bg-green-800 inline-flex items-center gap-1">
                                <Smartphone className="w-3.5 h-3.5" /> Confirmer
                              </button>
                            )}
                          </>
                        ) : r.kind === 'wallet' && r.status === 'pending' && r.tx && isMobileMethod(r.tx.method) ? (
                          <>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.status as ORestoPaymentStatus]}`}>{STATUS_LABEL[r.status as ORestoPaymentStatus]}</span>
                            <button onClick={() => handleResumeTopup(r.tx)} className="px-4 py-2 min-h-[44px] rounded-lg bg-green-700 text-white text-xs font-bold hover:bg-green-800 inline-flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5" /> Confirmer
                            </button>
                          </>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.status as ORestoPaymentStatus] ?? STATUS_STYLE.paid}`}>{STATUS_LABEL[r.status as ORestoPaymentStatus] ?? r.status}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 flex-shrink-0" /> {paidCount} paiement{paidCount > 1 ? 's' : ''} soldé{paidCount > 1 ? 's' : ''}{pendingPaymentsCount > 0 ? ` · ${pendingPaymentsCount} en attente` : ''} · Solde restant = solde de la carte juste après l’opération · Reçus imprimables au comptoir de la cantine
          </p>
        </section>

        <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pb-4">
          <ShieldCheck className="w-3.5 h-3.5" /> Paiements sécurisés · Reçus imprimables · Support au comptoir de la cantine
        </p>
      </div>

      {waveModal && (
        <WavePaymentModal
          wave={waveModal.wave}
          error={confirmError}
          confirming={confirming}
          onConfirm={handleConfirmWave}
          onClose={() => {
            setWaveModal(null);
            setConfirmError(null);
            flash(true, 'Paiement mobile en attente : reprenez-le depuis l’historique ci-dessous (bouton Confirmer) quand vous êtes prêt.');
          }}
        />
      )}

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
function QuickEnrollCycle({ cycleId, username, hasProfile, addChild, kidsCount, onDone }: {
  cycleId: SchoolCycle; username: string; hasProfile: boolean;
  addChild: (parent: string, first: string, last: string, cls: string, cycle?: SchoolCycle) => { firstName: string; lastName: string };
  kidsCount: number; onDone: (text: string) => void;
}) {
  const cycle = CYCLES.find((c) => c.id === cycleId)!;
  const CycleIcon = cycleId === 'lycee' ? GraduationCap : Baby;
  const isLycee = cycleId === 'lycee';
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
          onDone('Créez d’abord votre profil parent : nom, prénom et téléphone.');
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
          onDone(`Inscrits en ${cycle.label} : ${names.join(', ')}. QR Carte généré pour chacun — choisissez une formule ci-dessous.`);
          setTimeout(() => scrollTo('formules'), 400);
        } catch {
          onDone('Vérifiez nom, prénom et classe de chaque enfant.');
        }
      }}
      className={`rounded-3xl border-2 p-5 ${isLycee ? 'bg-gradient-to-b from-indigo-50 to-white border-indigo-200' : 'bg-gradient-to-b from-emerald-50 to-white border-emerald-200'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isLycee ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
            <CycleIcon className="w-5 h-5 text-white" />
          </span>
          <div>
            <p className="font-extrabold text-slate-800 text-sm">{cycle.label}</p>
            <p className="text-[11px] text-slate-500">{kidsCount} enfant(s) déjà inscrit(s) · {cycle.classes.join(' · ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" role="group" aria-label="Nombre d'enfants à inscrire">
          <span className="text-[11px] font-bold text-slate-600">Nombre</span>
          <span aria-live="polite" className="w-10 text-center text-sm font-black text-slate-800 border-2 border-slate-200 rounded-xl bg-white py-1">{count}</span>
          <button
            type="button"
            onClick={() => changeCount(count - 1)}
            disabled={count <= 1}
            aria-label="Un enfant de moins"
            className="w-8 h-8 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-black text-base leading-none hover:border-green-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            −
          </button>
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
              <label htmlFor={`enfant-nom-${cycleId}-${i}`} className="sr-only">Nom de l’enfant {i + 1}</label>
              <input id={`enfant-nom-${cycleId}-${i}`} value={r.last} onChange={(e) => setRow(i, { last: e.target.value })} placeholder={`Nom ${i + 1} *`} required autoComplete="family-name" className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700 min-w-0 w-full bg-white" />
            </div>
            <div>
              <label htmlFor={`enfant-prenom-${cycleId}-${i}`} className="sr-only">Prénom de l’enfant {i + 1}</label>
              <input id={`enfant-prenom-${cycleId}-${i}`} value={r.first} onChange={(e) => setRow(i, { first: e.target.value })} placeholder={`Prénom ${i + 1} *`} required autoComplete="given-name" className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700 min-w-0 w-full bg-white" />
            </div>
            <div>
              <label htmlFor={`enfant-classe-${cycleId}-${i}`} className="sr-only">Classe de l’enfant {i + 1}</label>
              <select id={`enfant-classe-${cycleId}-${i}`} value={r.cls} onChange={(e) => setRow(i, { cls: e.target.value })} required className="px-2 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700 bg-white min-w-0 w-full">
                <option value="">Classe *</option>
                {cycle.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <button type="submit" className={`mt-3 w-full py-3 rounded-xl font-bold text-sm text-white transition ${isLycee ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/25'}`}>
        Inscrire {count > 1 ? `ces ${count} enfants` : 'cet enfant'} + QR Carte
      </button>
      <button type="button" onClick={() => scrollTo('cartes')} className="mt-1.5 w-full text-xs font-bold text-slate-500 hover:text-slate-700">
        Voir ma carte et mes QR plus bas ↓
      </button>
    </form>
  );
}

function FormulaCard({ name, description, price, oldPrice, meals, days, rules, meta, isBest, accent, onChoose }: {
  name: string; description: string; price: number; oldPrice?: number;
  meals: number; days: number; rules?: string;
  meta?: { badge?: string; badgeStyle?: string; audience: string; icon: typeof Crown; highlight?: boolean; tagline: string };
  isBest: boolean; accent: 'emerald' | 'indigo'; onChoose: () => void;
}) {
  const Icon = meta?.icon ?? Ticket;
  const perMeal = meals > 0 ? Math.round(price / meals) : price;
  const discount = oldPrice && oldPrice > price ? oldPrice - price : 0;
  const cta = accent === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/25';
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
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${accent === 'indigo' ? 'bg-gradient-to-br from-indigo-600 to-blue-600' : 'bg-gradient-to-br from-emerald-600 to-teal-600'}`}>
          <Icon className="w-5 h-5 text-white" />
        </span>
        <div>
          <h3 className="font-extrabold text-slate-900 leading-tight text-[15px]">{name}</h3>
          <p className={`text-xs font-bold ${accent === 'indigo' ? 'text-indigo-700' : 'text-emerald-700'}`}>{meta?.audience ?? 'Cantine scolaire'}</p>
        </div>
      </div>
      <p className="text-[13px] text-slate-500 mt-2">{description}</p>
      <p className="text-[13px] text-slate-500 mt-1">1 repas le midi, jours d’école, pendant {days} jours</p>
      <div className="mt-2 flex items-end gap-2">
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
        className={`mt-3 w-full py-3 rounded-xl font-bold text-sm text-white transition ${cta}`}
      >
        Choisir · {formatCurrency(price)}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">La fenêtre InTouch s’ouvre aussitôt pour valider</p>
    </article>
  );
}

/** Étape 2 — modifier (nom, prénom, classe) ou retirer un enfant, avec garde-fous. */
function ChildManager({ kids, activeByChild, pendingByChild, walletOf, updateChild, deleteChild, flash }: {
  kids: Child[];
  activeByChild: (id: string) => Subscription | undefined;
  pendingByChild: (id: string) => boolean;
  walletOf: (id: string) => number;
  updateChild: (id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => void;
  deleteChild: (id: string) => void;
  flash: (ok: boolean, text: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fFirst, setFFirst] = useState('');
  const [fLast, setFLast] = useState('');
  const [fClass, setFClass] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const startEdit = (k: Child) => {
    setEditingId(k.id);
    setConfirmId(null);
    setFFirst(k.firstName);
    setFLast(k.lastName);
    setFClass(k.className);
  };

  const saveEdit = (id: string) => {
    if (!fFirst.trim() || !fLast.trim() || !fClass) {
      flash(false, 'Nom, prénom et classe sont requis.');
      return;
    }
    updateChild(id, { firstName: fFirst.trim(), lastName: fLast.trim(), className: fClass, cycle: cycleOfClass(fClass) });
    setEditingId(null);
    flash(true, 'Enfant mis à jour — sa formule suit automatiquement son nouveau cycle.');
  };

  const askDelete = (k: Child) => {
    if (activeByChild(k.id)) {
      flash(false, `${k.firstName} a une carte active — laissez l’abonnement se terminer avant de le retirer.`);
      return;
    }
    if (pendingByChild(k.id)) {
      flash(false, `${k.firstName} a un paiement en attente — annulez la réservation (étape 5) avant de le retirer.`);
      return;
    }
    setConfirmId(k.id);
    setEditingId(null);
  };

  const confirmDelete = (k: Child) => {
    deleteChild(k.id);
    setConfirmId(null);
    flash(true, `${k.firstName} ${k.lastName} retiré. Ses dépenses passées restent visibles dans l’historique.`);
  };

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {kids.map((k) => {
        const sub = activeByChild(k.id);
        const pending = pendingByChild(k.id);
        const isEditing = editingId === k.id;
        const isConfirming = confirmId === k.id;
        return (
          <li key={k.id} className="bg-white rounded-2xl border-2 border-slate-100 p-4">
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`edit-nom-${k.id}`} className="label-pro">Nom *</label>
                    <input id={`edit-nom-${k.id}`} value={fLast} onChange={(e) => setFLast(e.target.value)} className="input-pro" />
                  </div>
                  <div>
                    <label htmlFor={`edit-prenom-${k.id}`} className="label-pro">Prénom *</label>
                    <input id={`edit-prenom-${k.id}`} value={fFirst} onChange={(e) => setFFirst(e.target.value)} className="input-pro" />
                  </div>
                </div>
                <div>
                  <label htmlFor={`edit-classe-${k.id}`} className="label-pro">Classe *</label>
                  <select id={`edit-classe-${k.id}`} value={fClass} onChange={(e) => setFClass(e.target.value)} className="input-pro bg-white">
                    <option value="">Choisir…</option>
                    {CYCLES.map((c) => (
                      <optgroup key={c.id} label={c.label}>
                        {c.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => saveEdit(k.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
                    <Check aria-hidden className="w-4 h-4" /> Enregistrer
                  </button>
                  <button onClick={() => setEditingId(null)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                    <X aria-hidden className="w-4 h-4" /> Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-base font-black flex-shrink-0" aria-hidden>
                  {k.firstName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{k.firstName} {k.lastName}</p>
                  <p className="text-xs text-slate-500 truncate">{k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}</p>
                  <p className="text-[11px] font-semibold text-slate-400">Solde carte : {formatCurrency(walletOf(k.id))}</p>
                </div>
                <span className={`flex-shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${sub ? 'bg-emerald-100 text-emerald-700' : pending ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  {sub ? `${sub.mealsRemaining} repas` : pending ? 'En attente' : 'Sans abo'}
                </span>
              </div>
            )}
            {!isEditing && !isConfirming && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => startEdit(k)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50">
                  <Pencil aria-hidden className="w-3.5 h-3.5" /> Modifier
                </button>
                <button onClick={() => askDelete(k)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50">
                  <Trash2 aria-hidden className="w-3.5 h-3.5" /> Retirer
                </button>
              </div>
            )}
            {isConfirming && (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3">
                <p className="text-[13px] font-semibold text-red-800">Retirer définitivement {k.firstName} {k.lastName} ?</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => confirmDelete(k)} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700">
                    Oui, retirer
                  </button>
                  <button onClick={() => setConfirmId(null)} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Étape 3 — menu de la cantine, lecture seule, jour actuel mis en avant. */
function WeekMenu({ menus }: { menus: WeeklyMenu[] }) {
  const today = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date().getDay()];
  if (menus.length === 0) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
          <UtensilsCrossed className="w-7 h-7 text-slate-400" />
        </div>
        <p className="mt-3 font-extrabold text-slate-800">Menu pas encore publié</p>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">La cantine publie les plats du lundi au vendredi — revenez un peu plus tard pour découvrir la semaine.</p>
      </div>
    );
  }
  const order = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const sorted = [...menus].sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {sorted.map((m) => {
        const isToday = m.day === today;
        const total = m.items.reduce((s, it) => s + it.price, 0);
        return (
          <li key={m.day} className={`bg-white rounded-2xl border-2 p-4 flex flex-col ${isToday ? 'border-emerald-400 ring-4 ring-emerald-100' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-black text-slate-900">{m.day}</p>
              {isToday && <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full">Aujourd’hui</span>}
            </div>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">{m.name}</p>
            {m.description ? <p className="text-xs text-slate-500 mt-0.5">{m.description}</p> : null}
            {m.items.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[13px] text-slate-600 flex-1">
                {m.items.map((it, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{it.name}</span>
                    <span className="font-bold text-slate-800 whitespace-nowrap tabular-nums">{formatCurrency(it.price)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-400 flex-1">Détail à venir.</p>
            )}
            {m.items.length > 0 && (
              <p className="mt-2 pt-2 border-t border-slate-100 text-xs font-black text-slate-900 flex justify-between">
                <span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 bg-emerald-100/70 inline-block px-2.5 py-1 rounded-md">{kicker}</p>
      <h2 className="mt-2 text-xl md:text-2xl font-black tracking-tight text-slate-900">{title}</h2>
    </div>
  );
}

export default EspaceParentPage;
