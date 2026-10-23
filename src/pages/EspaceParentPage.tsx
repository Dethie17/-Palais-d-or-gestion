import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { formatCurrency } from '@/lib/utils';
import { isMobileMethod, isValidSnPhone, type WavePaymentRequest } from '@/lib/wave';
import { officialPrice } from '@/lib/aboTariffs';
import { dayPhoto } from '@/data/cantineWeek';
import type {
  Complaint, ComplaintCategory, ComplaintStatus,
  ORestoPayment, ORestoPaymentStatus, PageName, Subscription, WalletTx,
} from '@/types/menu';
import {
  COMPLAINT_CATEGORY_LABEL, COMPLAINT_STATUS_LABEL,
} from '@/types/menu';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import QrCartesEnfants from '@/components/QrCartesEnfants';
import PayerAbonnementSection from '@/components/PayerAbonnementSection';
import {
  CheckCircle, AlertCircle, Smartphone,
  LogOut, CalendarClock, CreditCard, Megaphone,
  MessageSquareWarning, Send, X, MessagesSquare,
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
 * QR Codes des enfants → 1 abonnement (paiement Wave / Max it via SycaPay)
 * → 2 menu du jour → 3 kiosque (indisponible) → 4 annonces → 5 réclamations
 * → 6 historique. L'inscription des enfants se fait à l'import (ISM) ;
 * la recharge de carte n'existe plus : l'abonnement couvre le repas.
 */
const EspaceParentPage = ({ onNavigate }: { onNavigate?: (page: PageName) => void }) => {
  const { user, logout } = useAuth();
  const {
    formulas, mySubscriptions, myPayments, myValidations,
    paySubscription, confirmMobilePayment,
    myChildren, weeklyMenus, confirmWalletTopUpMobile,
    parentProfileOf, walletOf, childTxs,
    complaints, messagesOf,
    subscribeBundle,
    openProviderPayment, syncPaymentFromProvider,
  } = useResto();

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ kind: 'sub' | 'topup'; paymentId?: string; txId?: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [histChild, setHistChild] = useState('all');
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

  const totals = useMemo(() => {
    const spent = kids
      .flatMap((k) => childTxs(k.id))
      .filter((t) => t.status === 'paid' && (t.kind === 'debit' || t.kind === 'subscription') && new Date(t.createdAt) >= monthStartOf())
      .reduce((s, t) => s + t.amount, 0);
    const mealsLeft = activeSubs.reduce((s, sub) => s + sub.mealsRemaining, 0);
    return { spent, mealsLeft };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids, allMine, childTxs]);

  const paidCount = payments.filter((p) => p.status === 'paid').length;
  const pendingPaymentsCount = payments.filter((p) => p.status === 'pending').length;

  const childNameOf = (sub: Subscription | null | undefined) => {
    if (!sub?.childId) return null;
    const k = kids.find((x) => x.id === sub.childId);
    return k ? `${k.firstName} ${k.lastName}` : null;
  };

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
    // Tarif officiel ancré (F2 27 000 / F3 32 000) × nombre de mois.
    const montant = officialPrice(formulaId, formulas) * count;
    const { payment } = paySubscription(sub.id, method, sub, montant);
    const session = await openProviderPayment(
      { reference: payment.reference, amount: payment.amount, method, phone },
      'sub',
      payment.id,
    );
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
  }, [myPayments, username, kids, childTxs, histChild, myValidations, allMine, soldeAfterByTx]);

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

        {/* ===== QR DES ENFANTS (style clair, en haut de page) ===== */}
        <QrCartesEnfants kids={kids} />

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
          <SectionTitle step="2" title="Menu du jour" sub="Consultation — le menu du jour est servi à la cantine, sans achat en ligne" />

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
        <ReclamationsSection username={username} />

        {/* ===== 6. HISTORIQUE ===== */}
        <section id="historique" className="scroll-mt-24" data-testid="section-historique">
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
            {totals.mealsLeft > 0 && (
              <span className="text-sm font-bold text-slate-500">Repas restants : <span className="text-slate-900 tabular-nums">{totals.mealsLeft}</span></span>
            )}
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
          <p className="text-sm text-slate-500 mt-0.5">
            Une remarque sur les repas, la carte ou le service ? Écrivez au Superviseur — il répond dans ce fil.
          </p>
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
