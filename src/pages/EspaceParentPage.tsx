import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { formatCurrency } from '@/lib/utils';
import { isMobileMethod, isValidSnPhone, type WavePaymentRequest } from '@/lib/wave';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { persistenceErrorMessage, type PersistOutcome } from '@/lib/payments/persistence';
import { officialPrice } from '@/lib/aboTariffs';
import { cycleOfClass } from '@/lib/schoolCycles';
import { officialAboForCycle } from '@/lib/aboTariffs';
import { publishedDays } from '@/lib/menus';
import { menuPhoto } from '@/data/cantineWeek';
import { localDateKey, menuDateLabel } from '@/lib/menuDates';
import type {
  Child, Complaint, ComplaintCategory, ComplaintStatus, MealValidation,
  ORestoPayment, ORestoPaymentStatus, PageName, Subscription, WalletTx,
} from '@/types/menu';
import {
  COMPLAINT_CATEGORY_LABEL, COMPLAINT_STATUS_LABEL,
} from '@/types/menu';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';

import PayerAbonnementSection from '@/components/PayerAbonnementSection';
import {
  CheckCircle, AlertCircle, Smartphone,
  LogOut, CalendarClock, CreditCard, Megaphone,
  MessageSquareWarning, Send, X, MessagesSquare,
  Receipt, UtensilsCrossed, Inbox,
} from 'lucide-react';

const METHOD_LABEL: Record<string, string> = {
  wave: 'Wave', cash: 'Espèces',
  mobile_money: 'Max it (Orange Money)', card: 'Carte bancaire',
  balance: 'Solde carte',
};

/** Marqueur local « annonces déjà consultées », hors ligne et par parent. */
const ANNOUNCE_READ_KEY = 'o-resto-annonces-lues-v1';

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

const COMPLAINT_STATUS_STYLE: Record<ComplaintStatus, string> = {
  open: 'bg-amber-100 text-amber-800 border border-amber-200',
  in_progress: 'bg-blue-100 text-blue-700 border border-blue-200',
  resolved: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  rejected: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const DAY_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('fr-FR');
};
/** Retrouve l'enfant d'une validation repas (id, QR, ou enfant unique). */
function childOfValidation(kids: Child[], v: MealValidation, kidsCount: number): Child | undefined {
  const direct = v.childId ? kids.find((k) => k.id === v.childId) : undefined;
  if (direct) return direct;
  const byQr = kids.find((k) => k.qrToken && v.qrToken && k.qrToken === v.qrToken);
  if (byQr) return byQr;
  if (kidsCount === 1) return kids[0];
  return undefined;
}
/** Jours restants avant la fin de la période (0 = dernier jour, négatif = fini). */
const daysUntil = (iso: string, nowMs = Date.now()) => {
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.ceil((end - nowMs) / 86_400_000);
};
/** Le réabonnement est proposé dans les 7 derniers jours de la période. */
const renewDueSoon = (endIso: string, nowMs = Date.now()) => daysUntil(endIso, nowMs) <= 7;

/** Titre d'étape premium : pastille numérotée + titre. */
function SectionTitle({ step, title, sub }: { step: string; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-sm font-black flex-shrink-0 shadow">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">{title}</h2>
        {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
/**
 * Accès Abonné — parcours fluide du rôle client :
 * QR Codes des enfants → cartes prépayées (recharge Wave / Max it via SycaPay)
 * → 1 abonnement (paiement Wave / Max it via SycaPay) → 2 menu du jour
 * → 3 kiosque (indisponible) → 4 annonces → 5 réclamations → 6 historique.
 * L'inscription des enfants se fait à l'import (ISM).
 */
const EspaceParentPage = ({ onNavigate }: { onNavigate?: (page: PageName) => void }) => {
  const { user, logout } = useAuth();
  const {
    formulas, mySubscriptions, myPayments, myValidations,
    paySubscription, confirmMobilePayment,
    myChildren, weeklyMenus, confirmWalletTopUpMobile,
    parentProfileOf, walletOf, childTxs,
    complaints, messagesOf,
    subscribeBundle, cancelSubscription,
    openProviderPayment, syncPaymentFromProvider,
  } = useResto();

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ kind: 'sub' | 'topup'; paymentId?: string; txId?: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [histChild, setHistChild] = useState('all');
  const [histTab, setHistTab] = useState<'paiements' | 'consommation'>('paiements');
  const [histStatus, setHistStatus] = useState<'all' | ORestoPaymentStatus>('all');
  const [loggingOut, setLoggingOut] = useState(false);

  /** Annonces déjà lues par ce parent (clé par parent) : badge « nouveautés ». */
  const [readAnnouncements, setReadAnnouncements] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(ANNOUNCE_READ_KEY) ?? '';
      return raw ? JSON.parse(raw) as Record<string, string[]> : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(ANNOUNCE_READ_KEY, JSON.stringify(readAnnouncements)); } catch { /* stockage indisponible */ }
  }, [readAnnouncements]);

  const username = user?.username ?? '';
  const allMine = mySubscriptions(username);
  const payments = myPayments(username);
  const kids = myChildren(username);
  const profile = parentProfileOf(username);

  const flash = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    window.setTimeout(() => setMessage(null), 8000);
  };

  const nowTs = Date.now();

  // ===== Annonces de la cantine (publiées par le Superviseur) =====
  const announcements = useMemo(
    () => complaints
      .filter((c) => c.isAnnouncement)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [complaints],
  );
  const readIds = readAnnouncements[username] ?? [];
  const unreadAnnouncements = announcements.filter((a) => !readIds.includes(a.id)).length;
  /** Ouvre la section et marque TOUTES les annonces actuelles comme lues. */
  const openAnnouncements = () => {
    setReadAnnouncements((prev) => ({
      ...prev,
      [username]: Array.from(new Set([...(prev[username] ?? []), ...announcements.map((a) => a.id)])),
    }));
    document.getElementById('annonces')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Un abonnement n'est « actif » que DANS sa période : un réabonnement déjà
  // payé pour le mois suivant ne doit pas masquer la carte en cours.
  const isLiveNow = (s: Subscription) => {
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    return s.status === 'active'
      && (!Number.isFinite(start) || start <= nowTs)
      && Number.isFinite(end)
      && end >= nowTs;
  };
  const activeSubs = allMine.filter(isLiveNow);
  const activeByChild = (childId: string) => activeSubs.find((s) => s.childId === childId);

  /** Nom affiché du parent connecté (fiche identité sinon identifiant). */
  const myName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : username;

  /** Période déjà RÉGLÉE qui démarre plus tard (réabonnement de fin de mois). */
  const nextPeriodOf = (childId: string) =>
    allMine.find(
      (s) => s.childId === childId
        && s.status === 'active'
        && new Date(s.startDate).getTime() > nowTs,
    );

  /** Enfants dont la carte arrive à échéance (7 derniers jours). */
  const renewDue = kids.filter((k) => {
    const s = activeByChild(k.id);
    return !!s && renewDueSoon(s.endDate, nowTs);
  });

  const todayName = localDateKey(new Date(), 2026, 10);

  // ---------- Paiement : Wave / Max it via SycaPay ----------
  // Toutes les sommes partent par openProviderPayment : SycaPay initie la
  // commande côté serveur, la fenêtre montre le défi et envoie le client
  // automatiquement dans son application (Wave, Max it). Rien ne se règle
  // ici : c'est le webhook qui active.

  /** Numéro mobile du parent, pré-remplissage des panneaux de paiement. */
  const defaultPhone = profile?.phone ?? '';

  /**
   * Paiement multi-mois (PayerAbonnementSection) : formule × mois en un seul
   * paiement SycaPay, débit recalculé ici (jamais une saisie du parent).
   */
  const startBundlePayment = async (
    childIds: string[],
    count: number,
    firstMonthIso: string,
    method: 'wave' | 'mobile_money',
    phone?: string,
  ) => {
    if (childIds.length === 0) throw new Error('Choisissez au moins un enfant.');
    const children = myChildren(username).filter((child) => childIds.includes(child.id));
    if (children.length !== childIds.length) throw new Error('Un enfant sélectionné est introuvable.');

    if (isSupabaseConfigured) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        throw new Error('Votre session a expiré. Reconnectez-vous, puis relancez le paiement.');
      }
    }

    const subscriptionsToPay: Subscription[] = [];
    const subscriptionWrites: Promise<PersistOutcome>[] = [];
    let montant = 0;
    for (const child of children) {
      const formulaId = officialAboForCycle(cycleOfClass(child.className));
      if (!formulaId) throw new Error(`Classe de ${child.firstName} ${child.lastName} non couverte par une formule.`);
      const { subscription, persisted } = subscribeBundle(username, formulaId, child.id, count, firstMonthIso);
      subscriptionsToPay.push(subscription);
      subscriptionWrites.push(persisted);
      montant += officialPrice(formulaId, formulas) * count;
    }

    const cancelAll = () => {
      for (const sub of subscriptionsToPay) cancelSubscription(sub.id);
    };

    const writtenSubs = await Promise.all(subscriptionWrites);
    if (writtenSubs.some((outcome) => !outcome)) {
      cancelAll();
      throw new Error("La commande n'a pas pu être enregistrée. Vérifiez votre connexion puis réessayez.");
    }
    const subFailure = writtenSubs.find((outcome) => !outcome.ok);
    if (subFailure && !subFailure.ok) {
      cancelAll();
      throw new Error(persistenceErrorMessage(subFailure as Extract<PersistOutcome, { ok: false }>));
    }

    const firstSub = subscriptionsToPay[0];
    const { payment, persisted: paymentWrite } = paySubscription(firstSub.id, method, firstSub, montant);
    payment.groupSubscriptionIds = subscriptionsToPay.map((sub) => sub.id);

    const paymentOutcome = await paymentWrite;
    if (!paymentOutcome) {
      cancelAll();
      throw new Error("La commande n'a pas pu être enregistrée. Vérifiez votre connexion puis réessayez.");
    }
    if (!paymentOutcome.ok) {
      cancelAll();
      throw new Error(persistenceErrorMessage(paymentOutcome as Extract<PersistOutcome, { ok: false }>));
    }

    if (subscriptionsToPay.length > 1) {
      const { error: groupError } = await supabase.from('oresto_payment_groups').upsert({
        payment_reference: payment.reference,
        subscription_ids: subscriptionsToPay.map((sub) => sub.id),
        child_ids: children.map((child) => child.id),
        parent_username: username,
      });
      if (groupError) {
        cancelAll();
        throw new Error(`Impossible de préparer le paiement multi-enfants: ${groupError.message}`);
      }
    }

    const session = await openProviderPayment(
      { reference: payment.reference, amount: montant, method, phone },
      'sub',
      payment.id,
    );
    if (!session.challenge) {
      cancelAll();
      throw new Error(session.error ?? 'Paiement refusé.');
    }
    setWaveModal({ kind: 'sub', paymentId: payment.id, wave: session });
  };

  /** Reprendre une recharge en attente : nouvelle session chez l'opérateur. */
  const handleResumeTopup = async (tx: WalletTx) => {
    const method = tx.method;
    if (!method || !isMobileMethod(method)) return;
    setConfirmError(null);
    const session = await openProviderPayment(
      { reference: tx.reference, amount: tx.amount, method },
      'topup',
      tx.id,
    );
    setWaveModal({ kind: 'topup', txId: tx.id, wave: session });
  };

  /** Reprendre un paiement d'abonnement en attente. */
  const handleResumePayment = async (paymentId: string) => {
    const payment = myPayments(username).find((p) => p.id === paymentId)
      ?? payments.find((p) => p.id === paymentId);
    const method = payment?.method;
    if (!payment || !method || !isMobileMethod(method)) {
      flash(false, 'Ce paiement ne peut plus être repris.');
      return;
    }
    setConfirmError(null);
    const session = await openProviderPayment(
      { reference: payment.reference, amount: payment.amount, method },
      'sub',
      paymentId,
    );
    setWaveModal({ kind: 'sub', paymentId, wave: session });
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

  // ---------- Déconnexion ----------
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      onNavigate?.('home');
    } finally {
      setLoggingOut(false);
    }
  };

  // ---------- Solde restant après chaque opération ----------
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

  // ---------- Historique : paiements / recharges / consommation ----------
  const subscriptionRows = payments
    .filter((p) => p.status !== 'cancelled')
    .map((p) => {
      const sub = allMine.find((s) => s.id === p.subscriptionId);
      const child = sub?.childId ? kids.find((k) => k.id === sub.childId) : undefined;
      return {
        id: p.id,
        kind: 'subscription' as const,
        date: p.createdAt,
        childId: child?.id ?? null,
        child: child ? `${child.firstName} ${child.lastName}` : 'Abonnement cantine',
        label: p.status === 'refunded' ? 'Abonnement remboursé' : 'Abonnement cantine',
        detail: p.reference,
        method: p.method,
        amount: -p.amount,
        status: p.status,
        solde: null as number | null,
        payment: p,
        tx: null as WalletTx | null,
      };
    });

  const cardRows = kids.flatMap((k) =>
    childTxs(k.id)
      .filter((t) => t.kind === 'topup' || t.kind === 'refund')
      .filter((t) => t.status !== 'cancelled')
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        date: t.createdAt,
        childId: k.id,
        child: `${k.firstName} ${k.lastName}`,
        label: t.kind === 'refund' ? 'Remboursement carte' : 'Recharge carte',
        detail: t.reference,
        method: t.method,
        amount: t.amount,
        status: t.status,
        solde: soldeAfterByTx[t.id] ?? null,
        payment: null as ORestoPayment | null,
        tx: t,
      })),
  );

  const paymentHistory = [...subscriptionRows, ...cardRows]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  const filteredPaymentHistory = paymentHistory.filter((r) => {
    if (histChild !== 'all' && r.childId !== histChild) return false;
    if (histStatus !== 'all' && r.status !== histStatus) return false;
    return true;
  });

  const paymentStats = {
    subscriptions: subscriptionRows
      .filter((r) => r.status === 'paid' && (histChild === 'all' || r.childId === histChild))
      .reduce((sum, r) => sum + Math.abs(r.amount), 0),
    subscriptionCount: subscriptionRows.filter((r) => r.status === 'paid' && (histChild === 'all' || r.childId === histChild)).length,
    topups: cardRows
      .filter((r) => r.kind === 'topup' && r.status === 'paid' && (histChild === 'all' || r.childId === histChild))
      .reduce((sum, r) => sum + r.amount, 0),
    topupCount: cardRows.filter((r) => r.kind === 'topup' && r.status === 'paid' && (histChild === 'all' || r.childId === histChild)).length,
    pending: paymentHistory.filter((r) => r.status === 'pending' && (histChild === 'all' || r.childId === histChild)).length,
  };

  const mealRows = myValidations(username)
    .map((v) => {
      const child = childOfValidation(kids, v, kids.length);
      return {
        id: v.id,
        date: v.validatedAt,
        childId: child?.id ?? null,
        child: child ? `${child.firstName} ${child.lastName}` : 'Enfant non identifié',
        className: child?.className ?? '—',
        status: v.status,
        reason: v.reason ?? '',
      };
    })
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  const filteredMealRows = mealRows.filter((r) => histChild === 'all' || r.childId === histChild);

  const mealStatsByChild = kids.map((k) => {
    const accepted = mealRows.filter((r) => r.childId === k.id && r.status === 'accepted');
    const thisMonth = accepted.filter((r) => new Date(r.date) >= monthStartOf());
    const rejected = mealRows.filter((r) => r.childId === k.id && r.status === 'rejected');
    return {
      child: k,
      accepted: accepted.length,
      thisMonth: thisMonth.length,
      rejected: rejected.length,
      last: accepted[0]?.date ?? null,
    };
  });

  const mealsThisMonth = mealRows.filter(
    (r) => r.status === 'accepted' && new Date(r.date) >= monthStartOf() && (histChild === 'all' || r.childId === histChild),
  ).length;
  const mealsAccepted = filteredMealRows.filter((r) => r.status === 'accepted').length;
  const mealsRejected = filteredMealRows.filter((r) => r.status === 'rejected').length;

  const mealsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filteredMealRows) {
      if (row.status !== 'accepted') continue;
      const day = row.date.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myValidations, histChild]);

  const sortedMenus = [...weeklyMenus].sort((a, b) => a.day.localeCompare(b.day));
  const publishedMenus = publishedDays(sortedMenus);
  const menuDuJour = publishedMenus.find((m) => m.day === todayName)
    ?? publishedMenus[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-slate-100 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-10">

        {/* ===== En-tête : identité du parent + déconnexion ===== */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 backdrop-blur border border-slate-200 px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Accès Abonné</p>
            <p className="font-extrabold text-slate-900 truncate">{myName || 'Mon compte'}</p>
            <p className="text-xs text-slate-500">
              {profile?.phone ? `Téléphone : ${profile.phone}` : "Identifiant : " + (username || '—')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAnnouncements}
              data-testid="parent-annonces"
              className="relative inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-900 text-white text-sm font-bold hover:bg-emerald-800"
              title="Annonces publiées par la cantine"
            >
              <Megaphone className="w-4 h-4" /> Annonces
              {unreadAnnouncements > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-amber-400 text-[11px] font-black text-slate-900 tabular-nums" data-testid="annonces-badge">
                  {unreadAnnouncements}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              data-testid="parent-logout"
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" /> {loggingOut ? 'Déconnexion…' : 'Déconnexion'}
            </button>
          </div>
        </header>

        {/* ===== 1. PAIEMENT D'ABONNEMENT ===== */}
        <section id="payer-abonnement" className="scroll-mt-24" data-testid="section-payer-abonnement">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow">
              <CreditCard className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Abonnement</p>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Payer l’abonnement</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                L’enfant, les mois à régler, le total — un mois déjà payé ne se paie pas deux fois.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <PayerAbonnementSection
              kids={kids}
              start={startBundlePayment}
              onError={(t) => flash(false, t)}
            />
          </div>
        </section>

        {/* ===== 2. MENU : consultation seule (aucun achat) ===== */}
        <section id="menu" className="scroll-mt-24">
          <SectionTitle step="2" title="Menu du jour" />

          {menuDuJour ? (
            <div className="mt-4 max-w-md">
              <p className="font-bold text-slate-800 mb-2">Menu du jour — {menuDuJour.day}</p>
              <div className="bg-white rounded-2xl border-2 border-green-500 ring-2 ring-green-200 shadow-sm overflow-hidden">
                <div className="relative h-36 overflow-hidden">
                  <img
                    src={menuPhoto(menuDuJour)}
                    alt={`Menu du jour — ${menuDuJour.day}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(event) => {
                      const img = event.currentTarget;
                      img.onerror = null;
                      img.src = menuPhoto({ day: menuDuJour.day, description: '', items: [] });
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <span className="absolute bottom-2 left-3 text-sm font-black uppercase tracking-widest text-white drop-shadow">{menuDateLabel(menuDuJour.day)}</span>
                  <span className="absolute top-2 right-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-slate-900 shadow">MENU DU JOUR</span>
                </div>
                <div className="p-4">
                  {menuDuJour.description && <p className="text-sm font-semibold text-slate-800"><span className="text-slate-500">Repas :</span> {menuDuJour.description}</p>}
                  {menuDuJour.dessert && <p className="text-sm font-semibold text-amber-700 mt-1">Dessert : {menuDuJour.dessert}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
              <p className="text-lg font-black text-slate-800">Menus en préparation</p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
                Le Personnel compose les menus de la semaine — service du midi, du lundi au vendredi.
                Rien n’est affiché tant que la semaine n’est pas publiée. Revenez bientôt.
              </p>
            </div>
          )}
        </section>

        {/* ===== 3. KIOSQUE : indisponible pour le moment ===== */}
        <section id="kiosque" className="scroll-mt-24">
          <SectionTitle step="3" title="Kiosque Récréation & Pause" />
          <div className="mt-4 bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
            <p className="text-lg font-black text-slate-800">Kiosque indisponible pour le moment</p>
            <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
              Les snacks et boissons ne sont plus en vente en ligne. Passez par le comptoir de la cantine pendant la pause.
            </p>
          </div>
        </section>

        {/* Rappel de fin de mois : les repas non consommés expirent. */}
        {renewDue.length > 0 && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
            <CalendarClock className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <span>
              La période se termine le <strong>{shortDate(activeByChild(renewDue[0].id)!.endDate)}</strong> pour{' '}
              {renewDue.map((k) => k.firstName).join(', ')}. Les repas non consommés ne sont pas reportés —
              renouvelez l’abonnement pour le mois suivant.
            </span>
          </div>
        )}

        {message && (
          <div role="status" className={`rounded-xl p-4 flex gap-3 text-sm font-medium border ${message.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ===== 4. ANNONCES DE LA CANTINE ===== */}
        <section id="annonces" className="scroll-mt-24">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-emerald-700" /> Annonces de la cantine
            </h2>
            {announcements.length > 0 && (
              <span className="text-xs font-bold text-slate-500">{announcements.length} publication{announcements.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {announcements.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-4">
              Aucune annonce pour le moment — la cantine publiera ici les informations importantes (menus spéciaux, fermetures, échéances).
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {announcements.map((a) => {
                const thread = messagesOf(a.id);
                const latest = [...thread].reverse().find((m) => m.authorRole === 'staff') ?? thread[thread.length - 1];
                const isNew = !readIds.includes(a.id);
                return (
                  <article
                    key={a.id}
                    data-testid="annonce-card"
                    className={`rounded-2xl bg-white border p-4 shadow-sm ${isNew ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                        {isNew ? 'Nouveau · ' : ''}Annonce officielle
                      </p>
                      <time className="text-[11px] text-slate-400">{shortDate(a.createdAt)}</time>
                    </div>
                    <p className="mt-1 font-extrabold text-slate-900">{a.subject}</p>
                    {latest && <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{latest.body}</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== 5. RÉCLAMATIONS (intégrées à l'espace) ===== */}
        {/* Reclamations desactivees */}

        {/* ===== 6. HISTORIQUE ===== */}
        <section id="historique" className="scroll-mt-24" data-testid="section-historique">
          <SectionTitle
            step="6"
            title="Historique des dépenses"
            sub="Deux fenêtres claires : vos paiements et recharges, puis la consommation des repas de chaque enfant."
          />

          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 px-4 py-5 text-white md:px-6">
              <div aria-hidden className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-emerald-400/10 blur-2xl" />
              <div aria-hidden className="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-300/10 blur-2xl" />
              <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">Journal du parent</p>
                  <p className="text-lg font-black tracking-tight">Mes opérations</p>
                </div>
                <div className="inline-flex rounded-2xl bg-white/10 p-1 ring-1 ring-white/10" role="tablist" aria-label="Historique">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={histTab === 'paiements'}
                    data-testid="hist-tab-paiements"
                    onClick={() => setHistTab('paiements')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${histTab === 'paiements' ? 'bg-white text-slate-900 shadow' : 'text-emerald-50/80 hover:bg-white/10'}`}
                  >
                    <Receipt className="h-4 w-4" aria-hidden /> Paiements &amp; recharges
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${histTab === 'paiements' ? 'bg-emerald-100 text-emerald-800' : 'bg-white/15 text-white'}`}>{paymentHistory.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={histTab === 'consommation'}
                    data-testid="hist-tab-repas"
                    onClick={() => setHistTab('consommation')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${histTab === 'consommation' ? 'bg-white text-slate-900 shadow' : 'text-emerald-50/80 hover:bg-white/10'}`}
                  >
                    <UtensilsCrossed className="h-4 w-4" aria-hidden /> Repas par enfant
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${histTab === 'consommation' ? 'bg-emerald-100 text-emerald-800' : 'bg-white/15 text-white'}`}>{mealRows.length}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6">
              {histTab === 'paiements' ? (
                <div data-testid="historique-paiements">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Abonnements réglés</p>
                      <p className="mt-1 text-xl font-black text-emerald-900">{formatCurrency(paymentStats.subscriptions)}</p>
                      <p className="text-[11px] text-emerald-700/80">{paymentStats.subscriptionCount} paiement{paymentStats.subscriptionCount > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Cartes rechargées</p>
                      <p className="mt-1 text-xl font-black text-sky-900">{formatCurrency(paymentStats.topups)}</p>
                      <p className="text-[11px] text-sky-700/80">{paymentStats.topupCount} recharge{paymentStats.topupCount > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">En attente</p>
                      <p className="mt-1 text-xl font-black text-amber-900">{paymentStats.pending}</p>
                      <p className="text-[11px] text-amber-700/80">opération{paymentStats.pending > 1 ? 's' : ''} à confirmer</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Enfant</span>
                    <button
                      type="button"
                      onClick={() => setHistChild('all')}
                      className={`min-h-[34px] rounded-full px-3.5 py-1.5 text-xs font-bold transition ${histChild === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                    >
                      Tous
                    </button>
                    {kids.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setHistChild(k.id)}
                        className={`min-h-[34px] rounded-full px-3.5 py-1.5 text-xs font-bold transition ${histChild === k.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        {k.firstName}
                      </button>
                    ))}
                    <select
                      value={histStatus}
                      onChange={(e) => setHistStatus(e.target.value as typeof histStatus)}
                      className="ml-auto min-h-[34px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
                      aria-label="Filtrer par statut"
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="paid">Payé</option>
                      <option value="pending">En attente</option>
                      <option value="failed">Échoué</option>
                      <option value="refunded">Remboursé</option>
                    </select>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                    {filteredPaymentHistory.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                        <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
                        <p className="text-sm font-bold text-slate-700">Aucune opération pour ce filtre.</p>
                        <p className="text-xs text-slate-500">Vos paiements d’abonnement et recharges de carte apparaîtront ici.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                              <th className="p-3 text-left font-black">Date</th>
                              <th className="p-3 text-left font-black">Enfant</th>
                              <th className="p-3 text-left font-black">Opération</th>
                              <th className="p-3 text-right font-black">Montant</th>
                              <th className="p-3 text-right font-black">Solde carte</th>
                              <th className="p-3 text-right font-black">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPaymentHistory.slice(0, 80).map((r) => (
                              <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-100 transition hover:bg-emerald-50/30">
                                <td className="whitespace-nowrap p-3 text-[13px] text-slate-400">
                                  {new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </td>
                                <td className="p-3 text-[13px] font-bold text-slate-900">{r.child}</td>
                                <td className="p-3">
                                  <p className="text-[13px] font-bold text-slate-800">{r.label}</p>
                                  <p className="text-[11px] text-slate-400">{r.detail} · {METHOD_LABEL[r.method] ?? r.method}</p>
                                </td>
                                <td className={`p-3 text-right text-[13px] font-black ${r.amount > 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                                  {r.amount > 0 ? '+' : ''}{formatCurrency(r.amount)}
                                </td>
                                <td className="p-3 text-right text-[13px] font-bold text-slate-500">
                                  {r.solde != null ? formatCurrency(r.solde) : '—'}
                                </td>
                                <td className="p-3 text-right">
                                  <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[r.status as ORestoPaymentStatus] ?? STATUS_STYLE.paid}`}>
                                      {STATUS_LABEL[r.status as ORestoPaymentStatus] ?? r.status}
                                    </span>
                                    {r.payment?.status === 'paid' && (
                                      <button type="button" onClick={() => setReceipt(r.payment)} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800">
                                        Reçu
                                      </button>
                                    )}
                                    {r.payment?.status === 'pending' && r.payment.method && isMobileMethod(r.payment.method) && (
                                      <button type="button" onClick={() => handleResumePayment(r.payment!.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800">
                                        <Smartphone className="h-3.5 w-3.5" aria-hidden /> Confirmer
                                      </button>
                                    )}
                                    {!r.payment && r.tx?.status === 'pending' && isMobileMethod(r.tx.method) && (
                                      <button type="button" onClick={() => handleResumeTopup(r.tx!)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800">
                                        <Smartphone className="h-3.5 w-3.5" aria-hidden /> Confirmer
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {filteredPaymentHistory.length} opération{filteredPaymentHistory.length > 1 ? 's' : ''} affichée{filteredPaymentHistory.length > 1 ? 's' : ''}
                    {paymentStats.pending > 0 ? ` · ${paymentStats.pending} en attente` : ''}.
                  </p>
                </div>
              ) : (
                <div data-testid="historique-consommation">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Repas servis ce mois</p>
                      <p className="mt-1 text-xl font-black text-emerald-900">{mealsThisMonth}</p>
                      <p className="text-[11px] text-emerald-700/80">sur {kids.length} enfant{kids.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Total repas servis</p>
                      <p className="mt-1 text-xl font-black text-sky-900">{mealsAccepted}</p>
                      <p className="text-[11px] text-sky-700/80">validations acceptées</p>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">Repas refusés</p>
                      <p className="mt-1 text-xl font-black text-rose-900">{mealsRejected}</p>
                      <p className="text-[11px] text-rose-700/80">quota, solde ou carte</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Enfant</span>
                    <button
                      type="button"
                      onClick={() => setHistChild('all')}
                      className={`min-h-[34px] rounded-full px-3.5 py-1.5 text-xs font-bold transition ${histChild === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                    >
                      Tous
                    </button>
                    {kids.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setHistChild(k.id)}
                        className={`min-h-[34px] rounded-full px-3.5 py-1.5 text-xs font-bold transition ${histChild === k.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        {k.firstName}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {mealStatsByChild.map((stat) => {
                      const active = histChild === stat.child.id;
                      return (
                        <button
                          key={stat.child.id}
                          type="button"
                          onClick={() => setHistChild(active ? 'all' : stat.child.id)}
                          className={`rounded-2xl border p-4 text-left transition ${active ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/20'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900">{stat.child.firstName} {stat.child.lastName}</p>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{stat.child.className}</p>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">{stat.thisMonth} ce mois</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-white/80 p-2 ring-1 ring-slate-100">
                              <p className="text-base font-black text-slate-900">{stat.accepted}</p>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Servis</p>
                            </div>
                            <div className="rounded-xl bg-white/80 p-2 ring-1 ring-slate-100">
                              <p className="text-base font-black text-slate-900">{stat.thisMonth}</p>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ce mois</p>
                            </div>
                            <div className="rounded-xl bg-white/80 p-2 ring-1 ring-slate-100">
                              <p className="text-base font-black text-rose-700">{stat.rejected}</p>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Refusés</p>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">
                            Dernier repas : {stat.last ? shortDate(stat.last) : 'aucun pour le moment'}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    {filteredMealRows.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                        <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
                        <p className="text-sm font-bold text-slate-700">Aucun repas enregistré pour ce filtre.</p>
                        <p className="text-xs text-slate-500">Chaque passage au kiosque sera visible ici, enfant par enfant.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[620px] text-sm">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                              <th className="p-3 text-left font-black">Date &amp; heure</th>
                              <th className="p-3 text-left font-black">Enfant</th>
                              <th className="p-3 text-left font-black">Statut</th>
                              <th className="p-3 text-left font-black">Détail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMealRows.slice(0, 80).map((r) => (
                              <tr key={r.id} className="border-t border-slate-100 transition hover:bg-emerald-50/30">
                                <td className="whitespace-nowrap p-3 text-[13px] text-slate-500">
                                  {new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                                  <span className="ml-2 text-[11px] font-bold text-slate-400">
                                    {new Date(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <p className="text-[13px] font-bold text-slate-900">{r.child}</p>
                                  <p className="text-[11px] text-slate-400">{r.className}</p>
                                </td>
                                <td className="p-3">
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {r.status === 'accepted' ? 'Repas servi' : 'Repas refusé'}
                                  </span>
                                </td>
                                <td className="p-3 text-[12px] text-slate-500">
                                  {r.status === 'accepted' ? 'Validé au kiosque' : (r.reason || 'Passage refusé')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {mealsByDay.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Derniers jours servis</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {mealsByDay.map(([day, count]) => (
                          <span key={day} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            {new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                            <span className="rounded-full bg-emerald-100 px-1.5 text-emerald-800">{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {waveModal && (
        <WavePaymentModal
          wave={waveModal.wave}
          initialPhone={defaultPhone}
          error={confirmError}
          confirming={confirming}
          onConfirm={handleConfirmWave}
          onPaid={() => {
            const kind = waveModal.kind;
            const pid = waveModal.paymentId;
            setWaveModal(null);
            setConfirmError(null);
            if (kind === 'topup') {
              flash(true, 'Recharge confirmée : le solde de la carte a été crédité.');
              return;
            }
            const paid = pid
              ? (myPayments(username).find((p) => p.id === pid) ?? payments.find((p) => p.id === pid) ?? null)
              : null;
            if (paid) setReceipt({ ...paid, status: 'paid' });
            flash(true, 'Paiement confirmé — la carte est ACTIVE.');
          }}
          onSync={syncPaymentFromProvider}
          onClose={() => {
            setWaveModal(null);
            setConfirmError(null);
            flash(true, 'Paiement en attente : reprenez-le depuis l’historique (bouton Confirmer).');
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

/** Début du mois en cours (0 h). */
function monthStartOf(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Réclamations EMBARQUÉES dans l'Accès Abonné : le parent écrit au
 * Superviseur sans quitter son espace (texte seul — pas de jointure de
 * fichier). Chaque fil reste privé parent ↔ superviseur.
 */
function ReclamationsSection({ username }: { username: string }) {
  const { myComplaints, messagesOf, addComplaint, replyComplaint } = useResto();
  const [category, setCategory] = useState<ComplaintCategory>('meal_quality');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const threads = useMemo(
    () => myComplaints(username)
      .filter((c) => !c.isAnnouncement)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [myComplaints, username],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError('Écrivez votre message avant d’envoyer.');
      return;
    }
    try {
      const created = addComplaint({
        clientUsername: username,
        category,
        subject: subject.trim() || COMPLAINT_CATEGORY_LABEL[category],
        body: body.trim(),
      });
      setSubject('');
      setBody('');
      setOk(`Réclamation ${created.reference ?? ''} envoyée — le Superviseur la voit dès maintenant.`);
      window.setTimeout(() => setOk(null), 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible pour le moment.');
    }
  };

  const sendReply = (complaintId: string) => {
    if (!replyText.trim()) return;
    replyComplaint(complaintId, username, 'client', replyText.trim());
    setReplyText('');
    setReplyFor(null);
  };

  return (
    <section id="reclamations" className="scroll-mt-24" data-testid="section-reclamations">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-sm font-black flex-shrink-0 shadow">
          5
        </span>
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-emerald-700" /> Réclamations
          </h2>

        </div>
      </div>

      {/* ---- Nouvelle réclamation : texte seul ---- */}
      <form onSubmit={submit} className="mt-4 rounded-2xl bg-white border p-5 space-y-3" data-testid="parent-reclamations-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="rec-cat" className="text-xs font-bold text-slate-600">Sujet</label>
            <select
              id="rec-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
              className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
            >
              {(Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[]).map((c) => (
                <option key={c} value={c}>{COMPLAINT_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rec-subject" className="text-xs font-bold text-slate-600">Titre (facultatif)</label>
            <input
              id="rec-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={90}
              placeholder="Ex : Repas du mardi 14"
              className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
            />
          </div>
        </div>
        <div>
          <label htmlFor="rec-body" className="text-xs font-bold text-slate-600">Message</label>
          <textarea
            id="rec-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1200}
            rows={4}
            placeholder="Décrivez le problème — date, classe, détail du repas…"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 resize-y"
          />
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
        {ok && (
          <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />{ok}
          </p>
        )}
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-800 text-white text-sm font-bold hover:bg-emerald-700 active:scale-[0.99] transition-all"
        >
          <Send className="w-4 h-4" /> Envoyer au Superviseur
        </button>
      </form>

      {/* ---- Fils existants ---- */}
      <div className="mt-4 space-y-3" data-testid="reclamations-list">
        {threads.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-4">
            Aucune réclamation pour l’instant — vos messages apparaîtront ici avec la réponse de la cantine.
          </p>
        ) : threads.map((c) => {
          const thread = messagesOf(c.id);
          return (
            <article key={c.id} data-testid="reclamation-card" className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${COMPLAINT_STATUS_STYLE[c.status]}`}>
                  {COMPLAINT_STATUS_LABEL[c.status]}
                </span>
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                  {COMPLAINT_CATEGORY_LABEL[c.category]}
                </span>
                <span className="font-mono text-[11px] text-slate-400">{c.reference}</span>
                <time className="ml-auto text-[11px] text-slate-400">{shortDate(c.createdAt)}</time>
              </div>
              <p className="mt-2 font-extrabold text-slate-900 text-sm">{c.subject}</p>
              <ul className="mt-2 space-y-2">
                {thread.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-xl px-3 py-2 text-sm ${m.authorRole === 'staff' ? 'bg-emerald-50 border border-emerald-100 text-emerald-900' : 'bg-slate-50 border border-slate-100 text-slate-700'}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                      {m.authorRole === 'staff' ? 'Cantine' : 'Vous'} · {shortDate(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
              {c.status !== 'resolved' && c.status !== 'rejected' && (
                replyFor === c.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      maxLength={1200}
                      placeholder="Répondre…"
                      className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendReply(c.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-700"
                      >
                        <Send className="w-3.5 h-3.5" /> Envoyer
                      </button>
                      <button
                        onClick={() => { setReplyFor(null); setReplyText(''); }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" /> Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplyFor(c.id); setReplyText(''); }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
                    data-testid={`reclamation-reply-${c.id}`}
                  >
                    <MessagesSquare className="w-3.5 h-3.5" /> Répondre
                  </button>
                )
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default EspaceParentPage;
