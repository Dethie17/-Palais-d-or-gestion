import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { formatCurrency } from '@/lib/utils';
import { getChildQrToken } from '@/lib/clientQr';
import { initiateWavePayment, isMobileMethod, isValidSnPhone, isValidWaveCode, type WavePaymentRequest } from '@/lib/wave';
import { CYCLES, CYCLE_LABEL, cycleOfClass, pricePerMeal } from '@/lib/schoolCycles';
import { isOfficialFormula } from '@/lib/formulas';
import type { Child, ORestoPayment, ORestoPaymentMethod, ORestoPaymentStatus, SchoolCycle, Subscription, WalletTx, WeeklyMenu } from '@/types/menu';
import { QRCodeSVG } from 'qrcode.react';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import TicketCard from '@/components/TicketCard';
import { dayPhoto } from '@/data/cantineWeek';
import { weeklyMenuTotal } from '@/lib/menus';
import {
  CheckCircle, AlertCircle, Smartphone, Timer, Ticket,
  Copy, Download, Printer,
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

/** Les 3 formules fixes de la section Abonnement. */
const ABO_IDS = ['F1', 'F2', 'F3'] as const;
const ABO_AUDIENCE: Record<string, string> = {
  F1: 'Tous niveaux · essai 1 semaine',
  F2: 'Préscolaire & Élémentaire',
  F3: 'Lycée · 6ème → Terminale',
};

const DAY_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** Titre d'étape premium : pastille numérotée émeraude + titre + sous-titre. */
function SectionTitle({ step, title, sub }: { step: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-sm font-black flex-shrink-0 shadow">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

/**
 * Espace Parent — parcours fluide :
 * 1 inscription (carte crédit + QR créés seuls) → 2 abonnement
 * (paiement InTouch intégré au pavé formule) → 3 menu du jour payé
 * par la carte + tickets → 4 cartes (recharge + QR) → 5 historique.
 */
const EspaceParentPage = () => {
  const { user } = useAuth();
  const {
    formulas, mySubscriptions, myPayments, myValidations,
    subscribe, paySubscription, confirmMobilePayment, resumeMobilePayment,
    renewSubscription, buyTicket, buyDayMenu, myChildren, addChild,
    updateChild, deleteChild, weeklyMenus, confirmWalletTopUpMobile,
    parentProfileOf, walletOf, childTxs,
  } = useResto();

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ kind: 'sub' | 'topup'; paymentId?: string; txId?: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [histChild, setHistChild] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);
  /** Formule dont le panneau de paiement intégré est ouvert. */
  const [payFor, setPayFor] = useState<string | null>(null);
  const [ticketAlt, setTicketAlt] = useState<{ formulaId: string; name: string } | null>(null);
  const [dayBuyer, setDayBuyer] = useState<Record<string, string>>({});
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
  const customTickets = formulas
    .filter((f) => f.kind === 'ticket')
    // Seuls les tickets PUBLIÉS par le Personnel (Gestion Menu) sont vendus ici :
    // les formules officielles internes (T1/C10) ne sont jamais proposées.
    .filter((f) => !isOfficialFormula(f.id))
    // Billets de test du personnel (ex : « Ticket QA Parent ») : masqués aux parents.
    .filter((f) => !/qa|test/i.test(f.name))
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

  const childNameOf = useCallback((sub: Subscription | null | undefined) => {
    if (!sub?.childId) return null;
    const k = kids.find((x) => x.id === sub.childId);
    return k ? `${k.firstName} ${k.lastName}` : null;
  }, [kids]);

  const pendingByChild = (childId: string) =>
    allMine.some((s) => s.status === 'pending' && s.childId === childId);

  const todayName = DAY_INDEX[new Date().getDay()];

  // ---------- Paiement formule depuis le panneau intégré ----------
  const startFormulaPayment = (formulaId: string, childId: string) => {
    const sub = subscribe(username, formulaId, childId);
    const { payment, wave } = paySubscription(sub.id, 'intouch', sub);
    if (!wave) throw new Error('Paiement InTouch indisponible pour le moment — réessayez.');
    return { payment, wave };
  };

  const handlePaidFormula = (paymentId: string) => {
    const paid = myPayments(username).find((p) => p.id === paymentId)
      ?? payments.find((p) => p.id === paymentId)
      ?? null;
    setPayFor(null);
    if (paid) setReceipt({ ...paid, status: 'paid' });
    flash(true, 'Abonnement activé — la carte est prête.');
    setTimeout(() => scrollTo('cartes'), 400);
  };

  // ---------- Recharge carte : panneau InTouch intégré (comme les abonnements) ----------
  const handleRecharged = (childId: string, amount: number) => {
    const k = kids.find((x) => x.id === childId);
    flash(true, `Carte de ${k?.firstName ?? 'l’enfant'} rechargée de ${formatCurrency(amount)} — nouveau solde : ${formatCurrency(walletOf(childId) + amount)}.`);
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
      flash(false, 'Renouvellement impossible.');
      return;
    }
    if (result.wave && isMobileMethod(method)) {
      setConfirmError(null);
      setWaveModal({ kind: 'sub', paymentId: result.payment.id, wave: result.wave });
      return;
    }
    flash(true, `Renouvellement réservé (${result.payment.reference}), en attente de confirmation.`);
  };

  // ---------- Menu du jour payé par la carte ----------
  const handleBuyDayMenu = (day: string, total: number) => {
    const childId = dayBuyer[day] || kids[0]?.id;
    if (!childId) {
      flash(false, 'Inscrivez d’abord un enfant à l’étape 1.');
      setTimeout(() => scrollTo('inscription'), 150);
      return;
    }
    try {
      buyDayMenu(username, childId, day, total);
      const k = kids.find((x) => x.id === childId);
      flash(true, `Menu ${day} payé avec la carte de ${k?.firstName ?? 'l’enfant'} : +1 repas crédité. Nouveau solde : ${formatCurrency(walletOf(childId) - total)}.`);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Achat impossible.');
    }
  };

  // ---------- Tickets ----------
  const handleBuyTicket = (formulaId: string, menuName: string) => {
    try {
      const { payment, wave } = buyTicket(username, formulaId, 'intouch');
      if (wave) {
        setConfirmError(null);
        setWaveModal({ kind: 'sub', paymentId: payment.id, wave });
        return;
      }
      flash(true, `« ${menuName} » : paiement ${payment.reference} (${formatCurrency(payment.amount)} via InTouch).`);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Achat impossible.');
    }
  };

  const openTicketAlt = (formulaId: string, name: string) => {
    if (kids.length === 0) {
      flash(false, 'Inscrivez d’abord un enfant à l’étape 1.');
      setTimeout(() => scrollTo('inscription'), 150);
      return;
    }
    setTicketAlt({ formulaId, name });
    setTimeout(() => scrollTo('ticket-choix-carte'), 150);
  };

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

        {message && (
          <div role="status" className={`rounded-xl p-4 flex gap-3 text-sm font-medium border ${message.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {message.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ===== 1. INSCRIPTION ===== */}
        <section id="inscription" className="scroll-mt-24">
          <SectionTitle step="1" title="J’inscris mes enfants" sub="La carte et le QR Code de chaque enfant sont créés automatiquement." />
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
                kidsCount={cycle.id === 'lycee' ? kidsLycee : kidsPrimaire}
                onDone={(n) => flash(true, n)}
              />
            ))}
          </div>
          {kids.length === 0 && (
            <p className="mt-4 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-4 text-center">
              Aucun enfant pour l’instant — remplissez un formulaire ci-dessus.
            </p>
          )}
        </section>

        {/* ===== 2. ABONNEMENT : les 3 formules ===== */}
        <section id="abonnement" className="scroll-mt-24">
          <SectionTitle step="2" title="Je choisis l’abonnement" sub="1 repas par jour, le midi, du lundi au vendredi. Paiement InTouch dans le pavé." />
          <div className="grid md:grid-cols-3 gap-4 mt-4 items-start">
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
                    onStart={startFormulaPayment}
                    onPaid={handlePaidFormula}
                    onError={(t) => flash(false, t)}
                  />
                }
              />
            ))}
          </div>
        </section>

        {/* ===== 3. MENU : jour + semaine + tickets ===== */}
        <section id="menu" className="scroll-mt-24">
          <SectionTitle step="3" title="Menu du jour" sub="Payé avec la carte de l’enfant : total débité, 1 repas crédité. Menus publiés par le Personnel." />

          {menuDuJour && (menuDuJour.items ?? []).length > 0 ? (
            <div className="mt-4 max-w-md">
              <p className="font-bold text-slate-800 mb-2">Menu du jour — {menuDuJour.day} : {menuDuJour.name || `Menu du ${menuDuJour.day}`}</p>
              <MenuTicketCard
                menu={menuDuJour}
                highlight
                kids={kids}
                walletOf={walletOf}
                buyer={dayBuyer[menuDuJour.day] ?? kids[0]?.id ?? ''}
                onBuyer={(id) => setDayBuyer((p) => ({ ...p, [menuDuJour.day]: id }))}
                onBuy={() => handleBuyDayMenu(menuDuJour.day, weeklyMenuTotal(menuDuJour.items))}
              />
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

          <h3 className="mt-8 font-bold text-slate-800">
            La semaine
            {publishedMenus.length > 0 && (
              <span className="ml-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 align-middle">
                {publishedMenus.length}/5 jours publiés
              </span>
            )}
          </h3>
          {publishedMenus.filter((m) => m.day !== menuDuJour?.day).length === 0 ? (
            <p className="mt-3 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-6 text-center">
              {publishedMenus.length === 0
                ? 'Semaine pas encore publiée par le Personnel.'
                : 'Un seul jour publié pour l’instant.'}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              {publishedMenus.filter((m) => m.day !== menuDuJour?.day).map((m) => (
                <MenuTicketCard
                  key={m.day}
                  menu={m}
                  highlight={false}
                  kids={kids}
                  walletOf={walletOf}
                  buyer={dayBuyer[m.day] ?? kids[0]?.id ?? ''}
                  onBuyer={(id) => setDayBuyer((p) => ({ ...p, [m.day]: id }))}
                  onBuy={() => handleBuyDayMenu(m.day, weeklyMenuTotal(m.items))}
                />
              ))}
            </div>
          )}

          <h3 className="mt-8 font-bold text-slate-800">Tickets repas <span className="font-normal text-sm text-slate-400">· prix fixe, payés par la carte</span></h3>
          {customTickets.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-6 text-center">
              Aucun ticket publié pour le moment — le Personnel les crée dans Gestion Menu.
            </p>
          ) : (
            <>
              {ticketAlt && (
                <div id="ticket-choix-carte" className="mt-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-4 scroll-mt-24">
                  <p className="text-sm font-bold text-orange-900">« {ticketAlt.name} » — quelle carte ?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {kids.map((k) => (
                      <button
                        key={k.id}
                        onClick={() => handleBuyTicketBalance(ticketAlt.formulaId, k.id)}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600"
                      >
                        {k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}
                      </button>
                    ))}
                    <button onClick={() => setTicketAlt(null)} className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white border text-sm hover:bg-slate-50">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                {customTickets.map((t) => (
                  <article key={t.id} className="bg-white rounded-2xl border-2 border-slate-100 p-5 md:p-6 flex flex-col shadow-sm hover:shadow-lg hover:border-slate-200 transition-all">
                    <h4 className="font-bold text-slate-900 leading-snug">{t.name}</h4>
                    <p className="text-sm text-slate-500 mt-1">{t.description}</p>
                    <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{formatCurrency(t.price)}</p>
                    <p className="text-[13px] text-slate-500 mt-0.5">{t.mealsIncluded} repas · {t.durationDays} jours · ≈ {formatCurrency(pricePerMeal(t.price, t.mealsIncluded))} / repas</p>
                    <button onClick={() => openTicketAlt(t.id, t.name)} className="mt-4 w-full py-3 min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 active:scale-[0.99] transition-all">
                      Payer avec la carte · {formatCurrency(t.price)}
                    </button>
                    <button onClick={() => handleBuyTicket(t.id, t.name)} className="mt-2 text-sm font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
                      Ou payer via InTouch
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ===== 4. CARTES ===== */}
        <section id="cartes" className="scroll-mt-24">
          <SectionTitle step="4" title="Mes cartes" sub="Rechargeables via InTouch, QR à présenter à la cantine. La carte sert aux tickets repas." />

          {activeSubs.length > 0 && (
            <ul className="mt-4 space-y-4">
              {activeSubs.map((s) => {
                const f = formulas.find((x) => x.id === s.formulaId);
                const total = f?.mealsIncluded && f.mealsIncluded > 0 ? f.mealsIncluded : s.mealsRemaining;
                const pct = total > 0 ? Math.min(100, Math.round((s.mealsRemaining / total) * 100)) : 0;
                return (
                  <li key={s.id} className="rounded-3xl bg-slate-900 text-white p-5 md:p-6 shadow-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                        • Carte active – {f?.name ?? 'Abonnement'}
                      </p>
                      <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-emerald-200">
                        J-{daysLeft(s)} restants
                      </span>
                    </div>
                    <p className="mt-3 text-4xl font-black tracking-tight">{s.mealsRemaining} <span className="text-lg font-bold text-slate-300">repas restants</span></p>
                    <p className="mt-1 text-xs text-slate-400">
                      {childNameOf(s) ? `${childNameOf(s)} · ` : ''}Du {new Date(s.startDate).toLocaleDateString('fr-FR')} au {new Date(s.endDate).toLocaleDateString('fr-FR')}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.childId && (
                        <button onClick={() => scrollTo(`carte-${s.childId}`)} className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-white text-slate-900 text-sm font-bold hover:bg-slate-100">
                          Mon QR
                        </button>
                      )}
                      <button onClick={() => handleRenew(s.id, 'intouch')} className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400">
                        <Smartphone className="w-4 h-4" /> Renouveler
                      </button>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs font-bold text-slate-300">Solde repas {s.mealsRemaining}/{total}</p>
                      <div className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {f?.rules && <p className="mt-2 text-[11px] text-slate-400">Règle : {f.rules}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {kids.length > 0 ? (
            <ul className="mt-4 grid sm:grid-cols-2 gap-3">
              {kids.map((k) => (
                <KidCard
                  key={k.id}
                  k={k}
                  sub={activeByChild(k.id)}
                  pending={pendingByChild(k.id)}
                  token={k.qrToken || getChildQrToken(k.id)}
                  balance={walletOf(k.id)}
                  copiedToken={copied}
                  onCopy={copyToken}
                  onPNG={downloadPNG}
                  onPrint={() => window.print()}
                  qrRefCb={(el) => { qrRefs.current[k.id] = el; }}
                  updateChild={updateChild}
                  deleteChild={deleteChild}
                  flash={flash}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400 bg-white rounded-xl border border-dashed px-4 py-6 text-center">
              Aucune carte pour l’instant — inscrivez un enfant à l’étape 1, sa carte se crée aussitôt.
            </p>
          )}
          {activeSubs.length === 0 && kids.length > 0 && (
            <p className="mt-3 text-sm text-slate-500 text-center">Choisissez une formule à l’étape 2 pour activer la carte.</p>
          )}

          {kids.length > 0 && (
            <div className="mt-4 rounded-3xl bg-slate-900 text-white p-5 md:p-6 shadow-xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                  • Recharger une carte
                </p>
                <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-emerald-200">
                  Solde total · {formatCurrency(totals.balance)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Choisissez la carte, le montant, puis validez avec votre code InTouch — comme pour les abonnements.
              </p>
              <div className="mt-4 rounded-2xl bg-white text-slate-900 p-4 md:p-5">
                <RechargePanel kids={kids} walletOf={walletOf} onDone={handleRecharged} onError={(t) => flash(false, t)} />
              </div>
            </div>
          )}
        </section>

        {/* ===== 5. HISTORIQUE ===== */}
        <section id="historique" className="scroll-mt-24">
          <SectionTitle step="5" title="Historique des dépenses" sub="Toutes les dépenses, par enfant." />
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
          error={confirmError}
          confirming={confirming}
          onConfirm={handleConfirmWave}
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

/** Carte formule premium : badge cycle, prix fort, CTA émeraude, panneau InTouch intégré. */
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
      <p className="text-[13px] text-slate-500 mt-0.5">{meals} repas · {days} jours · <span className="font-bold text-emerald-700">≈ {formatCurrency(pricePerMeal(price, meals))} / repas</span></p>
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

/** Panneau InTouch intégré au pavé formule : enfant → téléphone → code, tout ici. */
function FormulaPaymentPanel({ formulaId, formulaName, price, kids, onStart, onPaid, onError }: {
  formulaId: string; formulaName: string; price: number; kids: Child[];
  onStart: (formulaId: string, childId: string) => { payment: ORestoPayment; wave: WavePaymentRequest };
  onPaid: (paymentId: string) => void;
  onError: (text: string) => void;
}) {
  const { confirmMobilePayment } = useResto();
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [wave, setWave] = useState<WavePaymentRequest | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!wave) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wave]);

  const left = wave ? Math.max(0, new Date(wave.expiresAt).getTime() - now) : 0;
  const countdown = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;

  const handleValidate = () => {
    setError(null);
    if (!childId) {
      setError('Choisissez l’enfant à abonner.');
      return;
    }
    if (!isValidSnPhone(phone)) {
      setError('Numéro InTouch invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }
    try {
      const { payment, wave: w } = onStart(formulaId, childId);
      setPaymentId(payment.id);
      setWave(w);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Paiement impossible.';
      setError(text);
      onError(text);
    }
  };

  const handleConfirm = () => {
    setError(null);
    if (!paymentId) return;
    if (!isValidWaveCode(code)) {
      setError('Code à 6 chiffres requis.');
      return;
    }
    setConfirming(true);
    const { ok, message: text } = confirmMobilePayment(paymentId, code);
    setConfirming(false);
    if (!ok) {
      setError(text);
      return;
    }
    onPaid(paymentId);
  };

  if (!wave || !paymentId) {
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
          <label htmlFor={`pay-tel-${formulaId}`} className="text-xs font-bold text-slate-600">Numéro InTouch</label>
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
        <button onClick={handleValidate} className="w-full py-3 min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 inline-flex items-center justify-center gap-2">
          <Smartphone className="w-4 h-4" /> Valider · {formatCurrency(price)}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-900 text-white p-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400">Montant envoyé · {wave.merchantName}</p>
          <p className="text-xl font-bold">{wave.amountLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 flex items-center gap-1 justify-end"><Timer className="w-3.5 h-3.5" /> Expire</p>
          <p className={`text-lg font-bold font-mono ${left === 0 ? 'text-red-400' : ''}`}>{countdown}</p>
        </div>
      </div>
      <div>
        <label htmlFor={`pay-code-${formulaId}`} className="text-xs font-bold text-slate-600">Code InTouch à 6 chiffres</label>
        <input
          id={`pay-code-${formulaId}`}
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm text-center font-mono tracking-[0.3em] outline-none focus:border-emerald-600"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <button
        onClick={handleConfirm}
        disabled={confirming || left === 0}
        className="w-full py-3 min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40"
      >
        {confirming ? 'Confirmation…' : 'Confirmer le paiement'}
      </button>
    </div>
  );
}

/** Recharge carte : même finalisation InTouch que les abonnements.
 * 1) carte + montant + téléphone → Valider (demande InTouch)
 * 2) code à 6 chiffres → Confirmer (crédit immédiat + solde suivi).
 */
function RechargePanel({ kids, walletOf, onDone, onError }: {
  kids: Child[]; walletOf: (id: string) => number;
  onDone: (childId: string, amount: number) => void;
  onError: (text: string) => void;
}) {
  const { topUpChild, confirmWalletTopUpMobile } = useResto();
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [preset, setPreset] = useState<number | null>(2000);
  const [custom, setCustom] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [wave, setWave] = useState<WavePaymentRequest | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (kids.length > 0 && !kids.some((k) => k.id === childId)) setChildId(kids[0].id);
  }, [kids, childId]);

  useEffect(() => {
    if (!wave) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wave]);

  const parsedCustom = parseInt(custom.replace(/\D/g, ''), 10);
  const amount = Number.isFinite(parsedCustom) && parsedCustom > 0 ? parsedCustom : (preset ?? 0);
  const left = wave ? Math.max(0, new Date(wave.expiresAt).getTime() - now) : 0;
  const countdown = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;

  const handleValidate = () => {
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
      setError('Numéro InTouch invalide (9 chiffres, ex : 77 123 45 67).');
      return;
    }
    try {
      const res = topUpChild(childId, amount, 'intouch');
      const w = 'wave' in res ? res.wave : undefined;
      if (!w) {
        onDone(childId, amount);
        return;
      }
      setTxId(res.tx.id);
      setWave(w);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Recharge impossible.';
      setError(text);
      onError(text);
    }
  };

  const handleConfirm = () => {
    setError(null);
    if (!txId) return;
    if (!isValidWaveCode(code)) {
      setError('Code à 6 chiffres requis.');
      return;
    }
    setConfirming(true);
    const { ok, message: text } = confirmWalletTopUpMobile(txId, code);
    setConfirming(false);
    if (!ok) {
      setError(text);
      return;
    }
    const doneChild = childId;
    const doneAmount = amount;
    setWave(null);
    setTxId(null);
    setCode('');
    setCustom('');
    onDone(doneChild, doneAmount);
  };

  if (!wave || !txId) {
    return (
      <div className="space-y-3">
        <div>
          <span className="text-xs font-bold text-slate-600">Carte à recharger</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {kids.map((k) => {
              const sel = childId === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => setChildId(k.id)}
                  aria-pressed={sel}
                  className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                >
                  {k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="text-xs font-bold text-slate-600">Montant</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {[1000, 2000, 5000, 10000].map((a) => (
              <button
                key={a}
                onClick={() => { setPreset(a); setCustom(''); }}
                aria-pressed={preset === a && !custom}
                className={`px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border-2 transition-all ${preset === a && !custom ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
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
              className="px-3.5 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-xs font-bold w-36 outline-none focus:border-emerald-600"
            />
          </div>
        </div>
        <div>
          <label htmlFor="recharge-tel" className="text-xs font-bold text-slate-600">Numéro InTouch</label>
          <input
            id="recharge-tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="77 123 45 67"
            className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
          />
        </div>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <button onClick={handleValidate} className="w-full py-3 min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 inline-flex items-center justify-center gap-2">
          <Smartphone className="w-4 h-4" /> Recharger{amount > 0 ? ` · ${formatCurrency(amount)}` : ''}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-900 text-white p-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400">Montant envoyé · {wave.merchantName}</p>
          <p className="text-xl font-bold">{wave.amountLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 flex items-center gap-1 justify-end"><Timer className="w-3.5 h-3.5" /> Expire</p>
          <p className={`text-lg font-bold font-mono ${left === 0 ? 'text-red-400' : ''}`}>{countdown}</p>
        </div>
      </div>
      <div>
        <label htmlFor="recharge-code" className="text-xs font-bold text-slate-600">Code InTouch à 6 chiffres</label>
        <input
          id="recharge-code"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm text-center font-mono tracking-[0.3em] outline-none focus:border-emerald-600"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <button
        onClick={handleConfirm}
        disabled={confirming || left === 0}
        className="w-full py-3 min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40"
      >
        {confirming ? 'Confirmation…' : 'Confirmer la recharge'}
      </button>
    </div>
  );
}

/** Carte ticket du jour : photo, plats + prix, total, paiement par carte. */
function MenuTicketCard({ menu, highlight, kids, walletOf, buyer, onBuyer, onBuy }: {
  menu: WeeklyMenu; highlight: boolean; kids: Child[]; walletOf: (id: string) => number;
  buyer: string; onBuyer: (id: string) => void; onBuy: () => void;
}) {
  const total = weeklyMenuTotal(menu.items);
  const sel = kids.find((k) => k.id === (buyer || kids[0]?.id));
  return (
    <TicketCard
      day={menu.day}
      name={menu.name || `Menu du ${menu.day}`}
      description={menu.description}
      image={dayPhoto(menu.day)}
      items={menu.items}
      total={total}
      highlight={highlight}
      highlightLabel={highlight ? 'MENU DU JOUR' : undefined}
      showPrices
      action={
        kids.length > 0 && total > 0 ? (
          <>
            <select
              value={(buyer || kids[0]?.id) ?? ''}
              onChange={(e) => onBuyer(e.target.value)}
              aria-label={`Carte pour le menu ${menu.day}`}
              className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
            >
              {kids.map((k) => (
                <option key={k.id} value={k.id}>{k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}</option>
              ))}
            </select>
            <button onClick={onBuy} className="mt-2 w-full py-3 min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2">
              <Ticket className="w-4 h-4" /> Ticket · {formatCurrency(total)}
            </button>
            {sel && walletOf(sel.id) < total && (
              <p className="mt-1.5 text-xs font-semibold text-red-600">Solde insuffisant — rechargez la carte à l’étape 4.</p>
            )}
          </>
        ) : undefined
      }
    />
  );
}

/** Inscription rapide par cycle : la carte et le QR suivent seuls. */
function QuickEnrollCycle({ cycleId, username, hasProfile, addChild, kidsCount, onDone }: {
  cycleId: SchoolCycle; username: string; hasProfile: boolean;
  addChild: (parent: string, first: string, last: string, cls: string, cycle?: SchoolCycle) => { firstName: string; lastName: string };
  kidsCount: number; onDone: (text: string) => void;
}) {
  const cycle = CYCLES.find((c) => c.id === cycleId)!;
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
            onDone('Choisissez la classe de chaque enfant.');
            return;
          }
          const names: string[] = [];
          rows.forEach((r) => {
            const c = addChild(username, r.first, r.last, r.cls, cycleId);
            names.push(`${c.firstName} ${c.lastName}`);
          });
          setRows(Array.from({ length: count }, () => ({ first: '', last: '', cls: '' })));
          onDone(`${names.join(', ')} inscrit(s). Carte et QR créés — choisissez une formule à l’étape 2.`);
          setTimeout(() => scrollTo('abonnement'), 400);
        } catch {
          onDone('Vérifiez nom, prénom et classe de chaque enfant.');
        }
      }}
      className="rounded-2xl border bg-white p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-bold text-slate-800 text-sm">{cycle.label}</p>
          <p className="text-xs text-slate-500">{kidsCount} déjà inscrit(s) · {cycle.classes.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-bold text-slate-600">Nombre</span>
          <span className="w-10 text-center text-sm font-bold border-2 border-slate-200 rounded-xl bg-white py-1">{count}</span>
          <button type="button" onClick={() => changeCount(count - 1)} disabled={count <= 1} aria-label="Un enfant de moins" className="w-8 h-8 rounded-xl border-2 border-slate-200 font-bold disabled:opacity-30">−</button>
          <button type="button" onClick={() => changeCount(count + 1)} disabled={count >= 6} aria-label="Un enfant de plus" className="w-8 h-8 rounded-xl border-2 border-slate-200 font-bold disabled:opacity-30">+</button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={r.last} onChange={(e) => setRow(i, { last: e.target.value })} placeholder={`Nom ${i + 1}`} required autoComplete="family-name" aria-label={`Nom de l’enfant ${i + 1}`} className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 w-full" />
            <input value={r.first} onChange={(e) => setRow(i, { first: e.target.value })} placeholder={`Prénom ${i + 1}`} required autoComplete="given-name" aria-label={`Prénom de l’enfant ${i + 1}`} className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 w-full" />
            <select value={r.cls} onChange={(e) => setRow(i, { cls: e.target.value })} required aria-label={`Classe de l’enfant ${i + 1}`} className="px-2 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 bg-white w-full">
              <option value="">Classe</option>
              {cycle.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button type="submit" className="mt-3 w-full py-3 min-h-[48px] rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700">
        Inscrire{count > 1 ? ` ces ${count} enfants` : ' cet enfant'}
      </button>
    </form>
  );
}

/** Carte enfant premium : identité, solde tickets, QR + gestion (modifier / retirer).
 * La gestion vit ici (étape 4) — l'inscription (étape 1) ne fait qu'inscrire.
 * Règle carte : le solde sert aux tickets repas, jamais aux abonnements.
 */
function KidCard({ k, sub, pending, token, balance, copiedToken, onCopy, onPNG, onPrint, qrRefCb, updateChild, deleteChild, flash }: {
  k: Child;
  sub: Subscription | undefined;
  pending: boolean;
  token: string;
  balance: number;
  copiedToken: string | null;
  onCopy: (token: string) => void;
  onPNG: (childId: string, token: string, label: string) => void;
  onPrint: () => void;
  qrRefCb: (el: HTMLDivElement | null) => void;
  updateChild: (id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => void;
  deleteChild: (id: string) => void;
  flash: (ok: boolean, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fFirst, setFFirst] = useState('');
  const [fLast, setFLast] = useState('');
  const [fClass, setFClass] = useState('');

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
    <li id={`carte-${k.id}`} className="scroll-mt-24 bg-white rounded-3xl border-2 border-slate-100 shadow-sm hover:shadow-lg transition-shadow overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-5 pt-4 pb-4 text-white">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 text-white flex items-center justify-center text-lg font-black flex-shrink-0">
            {k.firstName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate">{k.firstName} {k.lastName}</p>
            <p className="text-xs text-slate-300 truncate">{k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}</p>
          </div>
          <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${sub ? 'bg-emerald-400 text-emerald-950' : pending ? 'bg-amber-300 text-amber-950' : 'bg-white/15 text-slate-200'}`}>
            {sub ? `${sub.mealsRemaining} repas` : pending ? 'En attente' : 'Sans abo'}
          </span>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-black tracking-tight tabular-nums">{formatCurrency(balance)}</p>
          <p className="text-[11px] text-slate-300">Solde carte · tickets repas</p>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 border p-3">
          <div ref={qrRefCb} className="p-1.5 border border-slate-200 bg-white flex-shrink-0 rounded-lg">
            <QRCodeSVG value={token} size={84} level="M" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold text-slate-600 tracking-wider truncate">{token}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <button onClick={() => onCopy(token)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
                <Copy className="w-3 h-3" /> {copiedToken === token ? 'Copié' : 'Copier'}
              </button>
              <button onClick={() => onPNG(k.id, token, `${k.firstName} ${k.lastName}`)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
                <Download className="w-3 h-3" /> PNG
              </button>
              <button onClick={onPrint} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">
                <Printer className="w-3 h-3" /> Imprimer
              </button>
            </div>
          </div>
        </div>
        {editing ? (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input value={fLast} onChange={(e) => setFLast(e.target.value)} aria-label="Nom" placeholder="Nom" className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600" />
              <input value={fFirst} onChange={(e) => setFFirst(e.target.value)} aria-label="Prénom" placeholder="Prénom" className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600" />
            </div>
            <select value={fClass} onChange={(e) => setFClass(e.target.value)} aria-label="Classe" className="px-3 py-2 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm bg-white w-full">
              <option value="">Choisir…</option>
              {CYCLES.map((c) => (
                <optgroup key={c.id} label={c.label}>
                  {c.classes.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold">
                <Check className="w-4 h-4" /> Enregistrer
              </button>
              <button onClick={() => setEditing(false)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-white border text-sm">
                <X className="w-4 h-4" /> Annuler
              </button>
            </div>
          </div>
        ) : confirming ? (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3">
            <p className="text-sm font-semibold text-red-800">Retirer {k.firstName} {k.lastName} ?</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => { deleteChild(k.id); setConfirming(false); flash(true, `${k.firstName} ${k.lastName} retiré.`); }} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-bold">
                Oui, retirer
              </button>
              <button onClick={() => setConfirming(false)} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-white border text-xs">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button onClick={startEdit} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border text-xs font-bold hover:bg-slate-50">
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
            <button onClick={askDelete} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Retirer
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default EspaceParentPage;
