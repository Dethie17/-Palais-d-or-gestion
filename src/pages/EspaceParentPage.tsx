import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { formatCurrency } from '@/lib/utils';
import { isMobileMethod, isValidSnPhone, isValidWaveCode, type WavePaymentRequest } from '@/lib/wave';
import { QRCodeSVG } from 'qrcode.react';
import { CYCLES, CYCLE_LABEL, cycleOfClass } from '@/lib/schoolCycles';
import { dayPhoto } from '@/data/cantineWeek';
import type { Child, ORestoPayment, ORestoPaymentMethod, ORestoPaymentStatus, PageName, SchoolCycle, Subscription, WalletTx } from '@/types/menu';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import QrCartesEnfants from '@/components/QrCartesEnfants';
import PayerAbonnementSection from '@/components/PayerAbonnementSection';
import {
  CheckCircle, AlertCircle, Smartphone,
  Pencil, Trash2, X, Check, LogOut, CalendarClock,
  CreditCard, Megaphone, MessageSquareWarning,
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

/** Les 2 formules fixes de la section Abonnement (l'essai hebdomadaire F1 n'est plus proposé). */
const ABO_IDS = ['F2', 'F3'] as const;
const ABO_AUDIENCE: Record<string, string> = {
  F2: 'Préscolaire & Élémentaire',
  F3: 'Collège & Lycée · 6ème → Terminale',
};

const DAY_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** « novembre 2026 » — libellé de la période d'abonnement. */
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const periodLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : MONTH_YEAR.format(d);
};
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('fr-FR');
};
/** Jours restants avant la fin de la période (0 = dernier jour, négatif = fini). */
const daysUntil = (iso: string, nowMs = Date.now()) => {
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.ceil((end - nowMs) / 86_400_000);
};
/** Le réabonnement est proposé dans les 7 derniers jours de la période. */
const renewDueSoon = (endIso: string, nowMs = Date.now()) => daysUntil(endIso, nowMs) <= 7;
/** Mois de la période suivante (« novembre 2026 »). */
const nextMonthLabel = (endIso: string) => {
  const end = new Date(endIso);
  if (Number.isNaN(+end)) return '';
  return periodLabel(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).toISOString());
};

const scrollTo = (id: string) => {
  // scrollIntoView n'existe pas partout (Safari ancien, jsdom) : on ne casse
  // jamais le parcours pour un simple défilement.
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

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
 * Espace Parent — parcours fluide :
 * 1 inscription (carte + QR créés seuls) → 2 abonnement (paiement Wave / Max it
 * via SycaPay, envoi automatique chez l'opérateur) → 3 menu du jour (consultation)
 * → 4 Kiosque (indisponible) → 5 cartes (recharge + QR) → 6 historique.
 */
const EspaceParentPage = ({ onNavigate }: { onNavigate?: (page: PageName) => void }) => {
  const { user, logout } = useAuth();
  const {
    formulas, mySubscriptions, myPayments, myValidations,
    subscribe, subscribeBundle, paySubscription, confirmMobilePayment,
    renewSubscription, myChildren, addChild,
    updateChild, deleteChild, weeklyMenus, confirmWalletTopUpMobile,
    topUpChild,
    parentProfileOf, walletOf, childTxs,
    complaints, messagesOf,
    openProviderPayment, syncPaymentFromProvider,
  } = useResto();

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ kind: 'sub' | 'topup'; paymentId?: string; txId?: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [histChild, setHistChild] = useState('all');
  /** Formule dont le panneau de paiement intégré est ouvert. */
  const [payFor, setPayFor] = useState<string | null>(null);
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

  const aboFormulas = ABO_IDS
    .map((id) => formulas.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f && f.kind === 'subscription');

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
  const eligibleKids = kids.filter((k) => !activeByChild(k.id));
  const kidsWithActiveSub = kids.filter((k) => activeByChild(k.id));
  const kidsWithoutActiveSub = kids.filter((k) => !activeByChild(k.id));

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
  /** Effectif d'un cycle : sert à afficher « N déjà inscrit(s) » par formulaire. */
  const kidsOfCycle = useCallback(
    (cycle: SchoolCycle) => kids.filter((k) => (k.cycle ?? 'primaire') === cycle).length,
    [kids],
  );
  const kidsPrimaire = kidsOfCycle('primaire');
  const kidsLycee = kidsOfCycle('lycee');

  const childNameOf = useCallback((sub: Subscription | null | undefined) => {
    if (!sub?.childId) return null;
    const k = kids.find((x) => x.id === sub.childId);
    return k ? `${k.firstName} ${k.lastName}` : null;
  }, [kids]);

  const pendingByChild = (childId: string) =>
    allMine.some((s) => s.status === 'pending' && s.childId === childId);

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

  const todayName = DAY_INDEX[new Date().getDay()];

  // ---------- Paiement : Wave / Max it via SycaPay ----------
  // Toutes les sommes partent par openProviderPayment : SycaPay initie la
  // commande côté serveur, la fenêtre montre le défi et envoie le client
  // automatiquement dans son application (Wave, Max it). Rien ne se règle
  // ici : c'est le webhook qui active.

  /** Numéro mobile du parent, pré-remplissage des panneaux de paiement. */
  const defaultPhone = profile?.phone ?? '';

  /** Ouvre chez le fournisseur une commande d'abonnement déjà enregistrée. */
  const openSubPayment = async (
    payment: ORestoPayment,
    method: 'wave' | 'mobile_money',
    phone?: string,
  ) => {
    setConfirmError(null);
    const session = await openProviderPayment(
      { reference: payment.reference, amount: payment.amount, method, phone },
      'sub',
      payment.id,
    );
    setWaveModal({ kind: 'sub', paymentId: payment.id, wave: session });
  };

  /**
   * Commence le paiement d'une formule (pavé étape 2) : la souscription est
   * créée en attente, puis la session opérateur s'ouvre — rien manuel.
   */
  const startFormulaPayment = async (
    formulaId: string,
    childId: string,
    method: 'wave' | 'mobile_money',
    phone?: string,
  ) => {
    const sub = subscribe(username, formulaId, childId);
    const { payment } = paySubscription(sub.id, method, sub);
    try {
      await openSubPayment(payment, method, phone);
    } catch (e) {
      flash(false, e instanceof Error ? e.message : 'Paiement impossible pour le moment.');
    } finally {
      setPayFor(null);
    }
  };

  /**
   * Paiement multi-mois (PayerAbonnementSection) : formule × mois en un seul
   * paiement SycaPay, débit recalculé ici (jamais une saisie du parent).
   */
  const startBundlePayment = async (
    childId: string,
    formulaId: string,
    count: number,
    firstMonthIso: string,
    method: 'wave' | 'mobile_money',
    phone?: string,
  ) => {
    const formula = formulas.find((f) => f.id === formulaId);
    if (!formula) throw new Error('Formule introuvable — choisissez un enfant dont la classe est couverte.');
    const sub = subscribeBundle(username, formulaId, childId, count, firstMonthIso);
    const montant = formula.price * count;
    const { payment } = paySubscription(sub.id, method, sub, montant);
    await openSubPayment(payment, method, phone);
  };

  /** Recharge d'une carte : tx « en attente », puis session opérateur. */
  const startRecharge = async (
    childId: string,
    amount: number,
    method: 'wave' | 'mobile_money',
    phone?: string,
  ) => {
    const { tx } = topUpChild(childId, amount, method);
    const session = await openProviderPayment(
      { reference: tx.reference, amount, method, phone },
      'topup',
      tx.id,
    );
    setWaveModal({ kind: 'topup', txId: tx.id, wave: session });
  };

  // ---------- Recharge carte ----------
  const handleRecharged = (childId: string, amount: number) => {
    const k = kids.find((x) => x.id === childId);
    flash(true, `Carte de ${k?.firstName ?? 'l’enfant'} rechargée de ${formatCurrency(amount)} — nouveau solde : ${formatCurrency(walletOf(childId) + amount)}.`);
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

  /** Renouvellement : la période suivante s'ajoute, le paiement passe par SycaPay. */
  const handleRenew = async (subId: string, method: 'wave' | 'mobile_money' = 'wave') => {
    try {
      const result = renewSubscription(subId, method);
      if (!result) {
        flash(false, 'Renouvellement impossible.');
        return;
      }
      await openSubPayment(result.payment, method);
    } catch (e) {
      flash(false, e instanceof Error ? e.message : 'Renouvellement impossible pour le moment.');
    }
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

  // ---------- QR : voir la page « QR Codes » (navigation parent) ----------

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

  // ---------- Historique complet ----------
  const historyRows = useMemo(() => {
    const payList = myPayments(username).map((p) => ({
      kind: 'pay' as const,
      id: p.id,
      date: p.createdAt,
      child: childNameOf(allMine.find((s) => s.id === p.subscriptionId)) ?? 'Abonnement',
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

  const sortedMenus = [...weeklyMenus].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  // Seuls les jours publiés par le Personnel (au moins un plat) existent.
  // Semaine vide = bel état vide, aucun contenu inventé.
  const publishedMenus = sortedMenus.filter((m) => (m.items ?? []).length > 0);
  const menuDuJour = publishedMenus.find((m) => m.day === todayName)
    ?? publishedMenus[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-slate-100 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-10">

        {/* ===== En-tête : identité du parent + déconnexion ===== */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 backdrop-blur border border-slate-200 px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Espace parent</p>
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

        {/* ===== QR DES ENFANTS + PAIEMENT D'ABONNEMENT (en haut de page) ===== */}
        <QrCartesEnfants kids={kids} />

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

        {/* ===== 0. ANNONCES DE LA CANTINE ===== */}
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
              <button
                type="button"
                onClick={() => onNavigate?.('reclamations')}
                data-testid="parent-accueil-reclamations"
                className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 px-4 py-2.5 min-h-[44px] text-sm font-bold text-emerald-800 hover:bg-emerald-50"
              >
                <MessageSquareWarning className="w-4 h-4" /> Une remarque ? Écrire au Superviseur (Réclamations)
              </button>
            </div>
          )}
        </section>

        {/* Rappel de fin de mois : les repas non consommés expirent. */}
        {renewDue.length > 0 && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
            <CalendarClock className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <span>
              La période se termine le <strong>{shortDate(activeByChild(renewDue[0].id)!.endDate)}</strong> pour{' '}
              {renewDue.map((k) => k.firstName).join(', ')}. Les repas non consommés ne sont pas reportés —
              renouvelez la carte pour le mois suivant.
            </span>
          </div>
        )}

        {message && (
          <div role="status" className={`rounded-xl p-4 flex gap-3 text-sm font-medium border ${message.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ===== 1. INSCRIPTION ===== */}
        <section id="inscription" className="scroll-mt-24">
          <SectionTitle step="1" title="J’inscris mes enfants" />
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {!profile && (
              <div className="md:col-span-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                Créez votre profil parent (nom, prénom, téléphone) pour inscrire vos enfants.
              </div>
            )}
            {CYCLES.map((cycle) => (
              <QuickEnrollCycle
                key={cycle.id}
                cycleId={cycle.id}
                username={username}
                hasProfile={!!profile}
                addChild={addChild}
                kidsCount={kidsOfCycle(cycle.id)}
                onDone={(n) => flash(true, n)}
                onError={(n) => flash(false, n)}
              />
            ))}
          </div>
          {kids.length === 0 && (
            <p className="mt-4 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-4 text-center">
              Aucun enfant pour l’instant — remplissez un formulaire ci-dessus.
            </p>
          )}
        </section>

        {/* ===== 2. ABONNEMENT : les 2 formules ===== */}
        <section id="abonnement" className="scroll-mt-24">
          <SectionTitle step="2" title="Je choisis l’abonnement" sub="Paiement par Wave ou Max it (Orange Money) via la passerelle SycaPay" />
          <div className="grid md:grid-cols-2 gap-4 mt-4 items-start max-w-4xl">
            {aboFormulas.map((f) => (
              <FormulaCard
                key={f.id}
                formulaId={f.id}
                name={f.name}
                audience={ABO_AUDIENCE[f.id] ?? ''}
                description={f.description}
                price={f.price}
                meals={f.mealsIncluded}
                days={f.durationDays}
                open={payFor === f.id}
                onOpen={() => {
                  if (kids.length === 0) {
                    flash(false, 'Inscrivez d’abord un enfant à l’étape 1.');
                    setTimeout(() => scrollTo('inscription'), 150);
                    return;
                  }
                  if (eligibleKids.length === 0) {
                    flash(true, 'Tous vos enfants sont déjà abonnés — voir l’historique.');
                    setTimeout(() => scrollTo('historique'), 150);
                    return;
                  }
                  setPayFor(f.id);
                }}
                onClose={() => setPayFor(null)}
                panel={
                  <FormulaPaymentPanel
                    formulaId={f.id}
                    formulaName={f.name}
                    price={f.price}
                    kids={eligibleKids}
                    defaultPhone={defaultPhone}
                    onStart={startFormulaPayment}
                  />
                }
              />
            ))}
          </div>
        </section>

        {/* ===== 3. MENU : consultation seule (aucun achat) ===== */}
        <section id="menu" className="scroll-mt-24">
          <SectionTitle step="3" title="Menu du jour" sub="Consultation — le menu du jour est servi à la cantine, sans achat en ligne" />

          {menuDuJour && (menuDuJour.items ?? []).length > 0 ? (
            <div className="mt-4 max-w-md">
              <p className="font-bold text-slate-800 mb-2">Menu du jour — {menuDuJour.day} : {menuDuJour.name || `Menu du ${menuDuJour.day}`}</p>
              <div className="bg-white rounded-2xl border-2 border-green-500 ring-2 ring-green-200 shadow-sm overflow-hidden">
                <div className="relative h-36 overflow-hidden">
                  <img src={dayPhoto(menuDuJour.day)} alt={`${menuDuJour.day} — ${menuDuJour.name}`} loading="lazy" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <span className="absolute bottom-2 left-3 text-sm font-black uppercase tracking-widest text-white drop-shadow">{menuDuJour.day}</span>
                  <span className="absolute top-2 right-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-green-700 shadow">MENU DU JOUR</span>
                </div>
                <div className="p-4">
                  <p className="font-extrabold text-slate-900">{menuDuJour.name || `Menu du ${menuDuJour.day}`}</p>
                  {menuDuJour.description && <p className="text-xs text-slate-500 mt-0.5">{menuDuJour.description}</p>}
                  <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                    {menuDuJour.items.map((it, i) => (
                      <li key={`${it.name}-${i}`} className="truncate">{it.name}</li>
                    ))}
                  </ul>
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

        {/* ===== 4. KIOSQUE : indisponible pour le moment ===== */}
        <section id="kiosque" className="scroll-mt-24">
          <SectionTitle step="4" title="Kiosque Récréation & Pause" />
          <div className="mt-4 bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
            <p className="text-lg font-black text-slate-800">Kiosque indisponible pour le moment</p>
            <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
              Les snacks et boissons ne sont plus en vente en ligne. Passez par le comptoir de la cantine pendant la pause.
            </p>
          </div>
        </section>

        {/* ===== 5. CARTES : une carte dark par enfant ===== */}
        <section id="cartes" className="scroll-mt-24">
          <SectionTitle step="5" title="Mes cartes" />

          {kids.length > 0 ? (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2">
              {kids.map((k) => {
                const s = activeByChild(k.id);
                const f = s ? formulas.find((x) => x.id === s.formulaId) : undefined;
                return (
                  <KidCard
                    key={k.id}
                    k={k}
                    sub={s}
                    pending={pendingByChild(k.id)}
                    balance={walletOf(k.id)}
                    walletOf={walletOf}
                    formulaName={f?.name ?? 'Abonnement'}
                    defaultPhone={defaultPhone}
                    nextPeriod={nextPeriodOf(k.id)}
                    onRenew={s ? (method) => handleRenew(s.id, method) : undefined}
                    onRecharged={handleRecharged}
                    onRecharge={(childId, amount, method, phone) => startRecharge(childId, amount, method, phone)}
                    updateChild={updateChild}
                    deleteChild={deleteChild}
                    flash={flash}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-6 text-center">
              Aucune carte pour l’instant — inscrivez un enfant à l’étape 1, sa carte se crée aussitôt.
            </p>
          )}
        </section>

        {/* ===== 6. HISTORIQUE ===== */}
        <section id="historique" className="scroll-mt-24">
          <SectionTitle step="6" title="Historique des dépenses" />
          <div className="flex flex-wrap items-center gap-2 mt-4 mb-3">
            {[{ id: 'all', label: 'Tous' }, ...kids.map((k) => ({ id: k.id, label: k.firstName }))].map((o) => (
              <button
                key={o.id}
                onClick={() => setHistChild(o.id)}
                className={`px-3.5 py-1.5 min-h-[36px] rounded-full text-xs font-bold ${histChild === o.id ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600'}`}
              >
                {o.label}
              </button>
            ))}
            <span className="ml-auto text-sm font-bold">Ce mois : <span className="text-emerald-700">{formatCurrency(totals.spent)}</span></span>
          </div>
          <div className="bg-white rounded-2xl border overflow-hidden">
            {historyRows.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-500">Aucune dépense pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                    <tr><th className="text-left p-4">Date</th><th className="text-left p-4">Enfant</th><th className="text-left p-4">Opération</th><th className="text-right p-4">Montant</th><th className="text-right p-4">Solde</th><th className="text-right p-4">Statut</th></tr>
                  </thead>
                  <tbody>
                    {historyRows.slice(0, 80).map((r) => (
                      <tr key={`${r.kind}-${r.id}`} className="border-t">
                        <td className="p-4 text-slate-400 text-[13px] whitespace-nowrap">{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</td>
                        <td className="p-4 font-bold text-[13px]">{r.child}</td>
                        <td className="p-4 text-slate-500 text-[13px]">{r.label}</td>
                        <td className={`p-4 text-right font-bold text-[13px] ${r.amount > 0 ? 'text-emerald-700' : ''}`}>
                          {r.amount > 0 ? '+' : ''}{r.amount === 0 ? '—' : formatCurrency(r.amount)}
                        </td>
                        <td className="p-4 text-right text-[13px] font-bold text-slate-500">
                          {r.solde != null ? formatCurrency(r.solde) : '—'}
                        </td>
                        <td className="p-4 text-right">
                          {r.kind === 'pay' && r.payment ? (
                            <span className="inline-flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.payment.status]}`}>{STATUS_LABEL[r.payment.status]}</span>
                              {r.payment.status === 'paid' && (
                                <button onClick={() => setReceipt(r.payment)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">Reçu</button>
                              )}
                              {r.payment.status === 'pending' && r.payment.method && isMobileMethod(r.payment.method) && (
                                <button onClick={() => handleResumePayment(r.payment!.id)} className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-bold inline-flex items-center gap-1">
                                  <Smartphone className="w-3.5 h-3.5" /> Confirmer
                                </button>
                              )}
                            </span>
                          ) : r.kind === 'wallet' && r.status === 'pending' && r.tx && isMobileMethod(r.tx.method) ? (
                            <span className="inline-flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[r.status as ORestoPaymentStatus]}`}>{STATUS_LABEL[r.status as ORestoPaymentStatus]}</span>
                              <button onClick={() => handleResumeTopup(r.tx)} className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-bold inline-flex items-center gap-1">
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
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400">{paidCount} paiement{paidCount > 1 ? 's' : ''}{pendingPaymentsCount > 0 ? ` · ${pendingPaymentsCount} en attente` : ''}</p>
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
            setPayFor(null);
            const paid = pid
              ? (myPayments(username).find((p) => p.id === pid) ?? payments.find((p) => p.id === pid) ?? null)
              : null;
            if (paid) setReceipt({ ...paid, status: 'paid' });
            flash(true, 'Paiement confirmé — la carte est ACTIVE.');
            setTimeout(() => scrollTo('cartes'), 400);
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

/** Carte formule premium : badge cycle, prix fort, CTA émeraude, panneau Wave / Max it intégré. */
function FormulaCard({ formulaId, name, audience, description, price, meals, days, open, onOpen, onClose, panel }: {
  formulaId: string; name: string; audience: string; description: string; price: number;
  meals: number; days: number; open: boolean; onOpen: () => void; onClose: () => void; panel: React.ReactNode;
}) {
  const star = formulaId === 'F2';
  return (
    <article className={`relative bg-white rounded-3xl border-2 p-5 md:p-6 flex flex-col h-full transition-all hover:shadow-xl hover:-translate-y-0.5 ${open ? 'border-emerald-500 shadow-lg' : star ? 'border-emerald-200 shadow-md' : 'border-slate-100 shadow-sm'}`}>
      {star && !open && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-600 text-white shadow whitespace-nowrap">
          Le plus choisi
        </span>
      )}
      <p className="self-start text-[11px] font-black text-emerald-700 uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">{audience}</p>
      <h3 className="font-black text-slate-900 mt-2.5 leading-snug">{name}</h3>
      <p className="text-sm text-slate-500 mt-1">{description}</p>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-900 tabular-nums">{formatCurrency(price)}</p>
      {!open ? (
        <button onClick={onOpen} className="mt-4 w-full py-3 min-h-[48px] rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-700 to-emerald-500 hover:from-emerald-800 hover:to-emerald-600 active:scale-[0.99] transition-all shadow-md shadow-emerald-600/20">
          Choisir · {formatCurrency(price)}
        </button>
      ) : (
        <div className="mt-4 border-t-2 border-emerald-100 pt-4">
          {panel}
          <button onClick={onClose} className="mt-3 w-full text-sm font-semibold text-slate-500 hover:text-slate-700">
            Fermer
          </button>
        </div>
      )}
    </article>
  );
}

/** Panneau intégré au pavé formule : enfant, Wave ou Max it, téléphone.
 * La session part chez SycaPay : la fenêtre de paiement de la page envoie
 * ensuite le parent automatiquement dans l'application de son opérateur.
 */
function FormulaPaymentPanel({ formulaId, formulaName, price, kids, defaultPhone, onStart }: {
  formulaId: string; formulaName: string; price: number; kids: Child[];
  defaultPhone: string;
  onStart: (formulaId: string, childId: string, method: 'wave' | 'mobile_money', phone: string) => Promise<void>;
}) {
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [method, setMethod] = useState<'wave' | 'mobile_money'>('wave');
  const [phone, setPhone] = useState(defaultPhone.replace(/\D/g, '').slice(0, 9));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const methodLabel = method === 'wave' ? 'Wave' : 'Max it (Orange Money)';

  const handleValidate = async () => {
    setError(null);
    if (!childId) {
      setError('Choisissez l’enfant à abonner.');
      return;
    }
    if (!isValidSnPhone(phone)) {
      setError('Numéro mobile invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }
    setBusy(true);
    try {
      await onStart(formulaId, childId, method, phone);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Paiement impossible.';
      setError(text);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-slate-800">« {formulaName} » · {formatCurrency(price)}</p>
      <div>
        <label htmlFor={`pay-enfant-${formulaId}`} className="text-xs font-bold text-slate-600">Enfant à abonner</label>
        <select
          id={`pay-enfant-${formulaId}`}
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
        >
          <option value="">Choisir…</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>{k.firstName} {k.lastName} · {k.className}</option>
          ))}
        </select>
      </div>
      <div>
        <span id={`pay-methode-${formulaId}`} className="text-xs font-bold text-slate-600">Moyen de paiement</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMethod('wave')}
            aria-pressed={method === 'wave'}
            className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${method === 'wave' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
          >
            Wave
          </button>
          <button
            type="button"
            onClick={() => setMethod('mobile_money')}
            aria-pressed={method === 'mobile_money'}
            className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${method === 'mobile_money' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
          >
            Max it (Orange Money)
          </button>
        </div>
      </div>
      <div>
        <label htmlFor={`pay-tel-${formulaId}`} className="text-xs font-bold text-slate-600">Numéro mobile ({methodLabel})</label>
        <input
          id={`pay-tel-${formulaId}`}
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder="77 123 45 67"
          className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <button
        onClick={handleValidate}
        disabled={busy}
        className="w-full py-3 min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <Smartphone className="w-4 h-4" /> {busy ? 'Ouverture du paiement…' : 'Payer'} · {formatCurrency(price)}
      </button>
      <p className="text-[11px] text-slate-400">
        Vous partez automatiquement dans l’application {methodLabel} pour valider avec votre code secret. Rien n’est débité avant votre confirmation chez l’opérateur.
      </p>
    </div>
  );
}

/** Recharge carte : carte + montant + Wave ou Max it + téléphone.
 * La recharge est enregistrée « en attente », créancier SycaPay : le solde
 * est crédité dès la confirmation de l'opérateur (webhook).
 */
function RechargePanel({ kids, walletOf, defaultPhone, onLaunch, onDone, onCredited }: {
  kids: Child[]; walletOf: (id: string) => number; defaultPhone: string;
  onLaunch: (childId: string, amount: number, method: 'wave' | 'mobile_money', phone: string) => Promise<void>;
  onDone: (childId: string, amount: number) => void;
  onCredited?: (childId: string, amount: number) => void;
}) {
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [preset, setPreset] = useState<number | null>(2000);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<'wave' | 'mobile_money'>('wave');
  const [phone, setPhone] = useState(defaultPhone.replace(/\D/g, '').slice(0, 9));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kids.length > 0 && !kids.some((k) => k.id === childId)) setChildId(kids[0].id);
  }, [kids, childId]);

  const parsedCustom = parseInt(custom.replace(/\D/g, ''), 10);
  const amount = Number.isFinite(parsedCustom) && parsedCustom > 0 ? parsedCustom : (preset ?? 0);
  const methodLabel = method === 'wave' ? 'Wave' : 'Max it (Orange Money)';

  const handleValidate = async () => {
    setError(null);
    if (!childId) {
      setError('Choisissez la carte à recharger.');
      return;
    }
    if (!amount || amount <= 0) {
      setError('Choisissez ou saisissez un montant à recharger.');
      return;
    }
    if (!isValidSnPhone(phone)) {
      setError('Numéro mobile invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }
    setBusy(true);
    try {
      await onLaunch(childId, amount, method, phone);
      onDone(childId, amount);
      onCredited?.(childId, amount);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Recharge impossible.';
      setError(text);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">1 · Carte à recharger</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {kids.map((k) => {
            const sel = childId === k.id;
            return (
              <button
                key={k.id}
                onClick={() => setChildId(k.id)}
                aria-pressed={sel}
                className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${sel ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:shadow-sm'}`}
              >
                {k.firstName} {k.lastName} · <span className="tabular-nums">{formatCurrency(walletOf(k.id))}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">2 · Montant</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {[1000, 2000, 5000, 10000].map((a) => (
            <button
              key={a}
              onClick={() => { setPreset(a); setCustom(''); }}
              aria-pressed={preset === a && !custom}
              className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all tabular-nums ${preset === a && !custom ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:shadow-sm'}`}
            >
              {formatCurrency(a)}
            </button>
          ))}
          <input
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Autre montant"
            aria-label="Montant libre en FCFA"
            className={`px-3.5 py-2 min-h-[44px] rounded-xl border-2 text-xs font-bold w-36 outline-none transition-all tabular-nums ${custom ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-200 focus:border-emerald-600'}`}
          />
        </div>
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">3 · Moyen de paiement</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMethod('wave')}
            aria-pressed={method === 'wave'}
            className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${method === 'wave' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
          >
            Wave
          </button>
          <button
            type="button"
            onClick={() => setMethod('mobile_money')}
            aria-pressed={method === 'mobile_money'}
            className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${method === 'mobile_money' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
          >
            Max it (Orange Money)
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="recharge-tel" className="text-xs font-black uppercase tracking-widest text-slate-400">4 · Numéro mobile ({methodLabel})</label>
        <input
          id="recharge-tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder="77 123 45 67"
          className="mt-1.5 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm tabular-nums outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition-all"
        />
      </div>
      {error && (
        <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert">{error}</p>
      )}
      <button
        onClick={handleValidate}
        disabled={busy || !childId || !(amount > 0) || !isValidSnPhone(phone)}
        className="w-full py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-500 text-white text-sm font-bold hover:from-emerald-800 hover:to-emerald-600 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 shadow-md shadow-emerald-600/25 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
      >
        <Smartphone className="w-4 h-4" /> {busy ? 'Ouverture du paiement…' : 'Recharger'}{amount > 0 ? ' · ' : ''}{formatCurrency(amount)}
      </button>
      <p className="text-[11px] text-slate-400">
        Vous partez automatiquement dans l’application {methodLabel} pour valider. La carte est créditée dès la confirmation de l’opérateur.
      </p>
    </div>
  );
}


/**
 * Inscription rapide par cycle : la carte et le QR suivent seuls.
 *
 * Ergonomie : une ligne par enfant (jusqu'à 10), classes issues du
 * référentiel + « Autre classe » pour les écoles qui ont un libellé propre —
 * un parent ne doit JAMAIS être bloqué par un catalogue. Un enfant déjà
 * inscrit est refusé explicitement (c'est la source des doublons de QR).
 */
function QuickEnrollCycle({ cycleId, username, hasProfile, addChild, kidsCount, onDone, onError }: {
  cycleId: SchoolCycle; username: string; hasProfile: boolean;
  addChild: (parent: string, first: string, last: string, cls: string, cycle?: SchoolCycle) => { firstName: string; lastName: string };
  kidsCount: number; onDone: (text: string) => void; onError: (text: string) => void;
}) {
  const cycle = CYCLES.find((c) => c.id === cycleId)!;
  const emptyRow = () => ({ first: '', last: '', cls: '', custom: '' });
  const [count, setCount] = useState(1);
  const [rows, setRows] = useState([emptyRow()]);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const setRow = (i: number, patch: Partial<{ first: string; last: string; cls: string; custom: string }>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const changeCount = (n: number) => {
    const c = Math.min(10, Math.max(1, n || 1));
    setCount(c);
    setRows((prev) => Array.from({ length: c }, (_, i) => prev[i] ?? emptyRow()));
  };

  /** Classe retenue pour la ligne : le catalogue, ou la saisie libre. */
  const classOf = (r: { cls: string; custom: string }) =>
    r.cls === '__other__' ? r.custom.trim() : r.cls;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!hasProfile) {
      onError('Créez d’abord votre profil parent : nom, prénom et téléphone.');
      return;
    }
    const nextErrors: Record<number, string> = {};
    const created: string[] = [];
    rows.forEach((r, i) => {
      const cls = classOf(r);
      if (!r.first.trim() || !r.last.trim() || !cls) {
        nextErrors[i] = 'Nom, prénom et classe sont requis.';
        return;
      }
      try {
        const child = addChild(username, r.first, r.last, cls, cycleId);
        created.push(`${child.firstName} ${child.lastName}`);
      } catch (err) {
        nextErrors[i] = err instanceof Error ? err.message : 'Inscription impossible.';
      }
    });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      onError('Certaines lignes n’ont pas pu être inscrites — le détail est indiqué sous chaque enfant.');
      return;
    }
    setRows(Array.from({ length: count }, () => emptyRow()));
    onDone(
      `${created.join(', ')} inscrit(s) — QR Carte créé pour chacun. Choisissez une formule à l’étape 2.`,
    );
    setTimeout(() => scrollTo('abonnement'), 400);
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-white p-5" data-testid={`enroll-cycle-${cycleId}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-sm">{cycle.label}</p>
          <p className="text-xs text-slate-500 truncate">{kidsCount} déjà inscrit(s) · {cycle.classes.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-bold text-slate-600">Nombre</span>
          <span className="w-10 text-center text-sm font-bold border-2 border-slate-200 rounded-xl bg-white py-1">{count}</span>
          <button type="button" onClick={() => changeCount(count - 1)} disabled={count <= 1} aria-label="Un enfant de moins" className="w-8 h-8 rounded-xl border-2 border-slate-200 font-bold disabled:opacity-30">−</button>
          <button type="button" onClick={() => changeCount(count + 1)} disabled={count >= 10} aria-label="Un enfant de plus" className="w-8 h-8 rounded-xl border-2 border-slate-200 font-bold disabled:opacity-30">+</button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="space-y-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input value={r.last} onChange={(e) => setRow(i, { last: e.target.value })} placeholder={`Nom ${i + 1}`} required autoComplete="family-name" aria-label={`Nom de l’enfant ${i + 1}`} className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 w-full" />
              <input value={r.first} onChange={(e) => setRow(i, { first: e.target.value })} placeholder={`Prénom ${i + 1}`} required autoComplete="given-name" aria-label={`Prénom de l’enfant ${i + 1}`} className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 w-full" />
              {r.cls === '__other__' ? (
                <input value={r.custom} onChange={(e) => setRow(i, { custom: e.target.value })} placeholder="Classe (ex. CIA)" required aria-label={`Classe de l’enfant ${i + 1}`} className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 w-full" />
              ) : (
                <select value={r.cls} onChange={(e) => setRow(i, { cls: e.target.value, custom: '' })} required aria-label={`Classe de l’enfant ${i + 1}`} className="px-2 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 bg-white w-full">
                  <option value="">Classe</option>
                  {cycle.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
                  <option value="__other__">Autre classe…</option>
                </select>
              )}
            </div>
            {errors[i] && (
              <p role="alert" className="text-xs font-semibold text-red-600">{errors[i]}</p>
            )}
          </div>
        ))}
      </div>
      <button type="submit" className="mt-3 w-full py-3 min-h-[48px] rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700">
        Inscrire{count > 1 ? ` ces ${count} enfants` : ' cet enfant'}
      </button>
    </form>
  );
}

/** Carte enfant dark (style CARTE ACTIVE) : une carte par enfant inscrit.
 * Abonné : période + QR + Renouveler (Wave / Max it via SycaPay).
 * Sans abonnement : solde + recharge SycaPay intégrée. Gestion intégrée.
 */
function KidCard({ k, sub, pending, balance, walletOf, formulaName, defaultPhone, nextPeriod, onRenew, onRecharged, onRecharge, updateChild, deleteChild, flash }: {
  k: Child;
  sub: Subscription | undefined;
  pending: boolean;
  balance: number;
  walletOf: (id: string) => number;
  formulaName: string;
  defaultPhone: string;
  /** Période suivante déjà réglée (réabonnement de fin de mois). */
  nextPeriod?: Subscription;
  onRenew?: (method: 'wave' | 'mobile_money') => void;
  onRecharged: (childId: string, amount: number) => void;
  onRecharge: (childId: string, amount: number, method: 'wave' | 'mobile_money', phone: string) => Promise<void>;
  updateChild: (id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => void;
  deleteChild: (id: string) => void;
  flash: (ok: boolean, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [fFirst, setFFirst] = useState('');
  const [fLast, setFLast] = useState('');
  const [fClass, setFClass] = useState('');
  const [renewMethod, setRenewMethod] = useState<'wave' | 'mobile_money'>('wave');

  const startEdit = () => {
    setEditing(true);
    setConfirming(false);
    setFFirst(k.firstName);
    setFLast(k.lastName);
    setFClass(k.className);
  };

  const saveEdit = () => {
    if (!fFirst.trim() || !fLast.trim() || !fClass) {
      flash(false, 'Nom, prénom et classe sont requis.');
      return;
    }
    updateChild(k.id, { firstName: fFirst.trim(), lastName: fLast.trim(), className: fClass, cycle: cycleOfClass(fClass) });
    setEditing(false);
    flash(true, 'Enfant mis à jour.');
  };

  const askDelete = () => {
    if (sub) {
      flash(false, `${k.firstName} a une carte active.`);
      return;
    }
    if (pending) {
      flash(false, `${k.firstName} a un paiement en attente.`);
      return;
    }
    setConfirming(true);
    setEditing(false);
  };

  return (
    <li className="rounded-3xl bg-slate-900 text-white p-5 md:p-6 shadow-xl border border-slate-800 overflow-hidden relative">
      <div aria-hidden className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300 truncate">
          • {sub ? `Carte active – ${formulaName}` : pending ? 'Carte – En attente' : 'Carte – Sans abonnement'}
        </p>
      </div>
      {sub ? (
        <p className="relative mt-3 text-xs text-slate-400">
          {k.firstName} {k.lastName} · {k.className} · {periodLabel(sub.startDate)} — jusqu’au {shortDate(sub.endDate)}
        </p>
      ) : (
        <>
          <p className="relative mt-3 text-4xl font-black tracking-tight tabular-nums">{formatCurrency(balance)}</p>
          <p className="relative mt-1 text-xs text-slate-400">
            {k.firstName} {k.lastName} · {k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}
          </p>
        </>
      )}
      {nextPeriod && (
        <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-bold text-emerald-200" data-testid={`next-period-${k.id}`}>
          <CalendarClock className="w-3.5 h-3.5" /> Renouvelé pour {periodLabel(nextPeriod.startDate)} (dès le {shortDate(nextPeriod.startDate)})
        </p>
      )}
      <div className="relative mt-4 flex flex-wrap gap-2">
        {sub && onRenew && !nextPeriod && (
          <>
            <select
              value={renewMethod}
              onChange={(e) => setRenewMethod(e.target.value as 'wave' | 'mobile_money')}
              aria-label="Moyen de paiement du renouvellement"
              className="px-3 py-2.5 min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 text-sm text-white outline-none focus:border-emerald-400"
            >
              <option value="wave">Wave</option>
              <option value="mobile_money">Max it (Orange Money)</option>
            </select>
            <button
              onClick={() => {
                if (!isValidSnPhone(defaultPhone)) {
                  flash(false, 'Renseignez votre numéro de téléphone dans votre profil pour recevoir la demande de paiement.');
                  return;
                }
                onRenew(renewMethod);
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 active:scale-[0.99] transition-all"
            >
              <CalendarClock className="w-4 h-4" /> Renouveler pour {nextMonthLabel(sub.endDate)}
            </button>
          </>
        )}
        <button onClick={() => setShowRecharge((v) => !v)} aria-expanded={showRecharge} className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 active:scale-[0.99] transition-all">
          <Smartphone className="w-4 h-4" /> Recharger ma carte
        </button>
      </div>
      {showRecharge && (
        <div className="relative mt-3 rounded-2xl bg-white text-slate-900 p-4 shadow-inner">
          <RechargePanel
            kids={[k]}
            walletOf={walletOf}
            defaultPhone={defaultPhone}
            onLaunch={onRecharge}
            onDone={(id, amt) => { setShowRecharge(false); onRecharged(id, amt); }}
          />
        </div>
      )}
      {/*
        QR CARTE — le badge scannable de l'enfant, visible ici (Espace Abonné)
        et dans l'espace Superviseur > QR Élèves. Un seul et même token :
        c'est ce qui garantit qu'un scan à la cantine fonctionne.
      */}
      <div className="relative mt-4 rounded-2xl bg-white p-3 text-slate-900">
        <div className="flex items-center gap-3">
          <div className="p-1.5 border border-slate-200 rounded-xl bg-white flex-shrink-0">
            <QRCodeSVG value={k.qrToken} size={92} level="M" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">N° QR Carte</p>
            <p className="font-mono text-xs font-bold text-slate-800 tracking-wider break-all">{k.qrToken}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              À présenter à la cantine pour le repas.
            </p>
          </div>
        </div>
      </div>
      {editing ? (
        <div className="relative mt-4 space-y-2 rounded-2xl bg-white/5 border border-white/10 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={fLast} onChange={(e) => setFLast(e.target.value)} aria-label="Nom" placeholder="Nom" className="px-3 py-2 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400" />
            <input value={fFirst} onChange={(e) => setFFirst(e.target.value)} aria-label="Prénom" placeholder="Prénom" className="px-3 py-2 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400" />
          </div>
          <select value={fClass} onChange={(e) => setFClass(e.target.value)} aria-label="Classe" className="px-3 py-2 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-sm text-white w-full outline-none focus:border-emerald-400">
            <option value="" className="text-slate-900">Choisir…</option>
            {CYCLES.map((c) => (
              <optgroup key={c.id} label={c.label}>
                {c.classes.map((cls) => <option key={cls} value={cls} className="text-slate-900">{cls}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-bold">
              <Check className="w-4 h-4" /> Enregistrer
            </button>
            <button onClick={() => setEditing(false)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-sm">
              <X className="w-4 h-4" /> Annuler
            </button>
          </div>
        </div>
      ) : confirming ? (
        <div className="relative mt-4 rounded-xl bg-red-500/15 border border-red-500/30 p-3">
          <p className="text-sm font-semibold text-red-200">Retirer {k.firstName} {k.lastName} ?</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => { deleteChild(k.id); setConfirming(false); flash(true, `${k.firstName} ${k.lastName} retiré.`); }} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-bold">
              Oui, retirer
            </button>
            <button onClick={() => setConfirming(false)} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-xs">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mt-4 flex gap-2">
          <button onClick={startEdit} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-xs font-bold hover:bg-white/15 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Modifier
          </button>
          <button onClick={askDelete} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Retirer
          </button>
        </div>
      )}
    </li>
  );
}

export default EspaceParentPage;
