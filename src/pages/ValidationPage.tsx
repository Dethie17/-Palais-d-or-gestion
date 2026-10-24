import { useEffect, useMemo, useRef, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { KioskOrder } from '@/types/menu';
import { CheckCircle, XCircle, ScanLine, Camera, ImagePlus, Square, Search, UtensilsCrossed, ShoppingBag, Ban, X, Clock3, Volume2, VolumeX, AlertTriangle, Inbox, CreditCard, Wallet, CalendarDays, Download } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { pickBackCameraId, isSecureScanContext, friendlyScanError, scanErrorName } from '@/lib/qrScan';
import { formatCurrency } from '@/lib/utils';
import { ABO_OFFICIAL } from '@/lib/aboTariffs';
import ConfirmDialog from '@/components/ConfirmDialog';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Période du journal des validations : jour / semaine / mois. */
type JournalPeriod = 'day' | 'week' | 'month';

/** Début (0 h) de la période demandée — lundi pour la semaine. */
function startOfPeriod(period: JournalPeriod, base = new Date()): number {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (period === 'day') return d.getTime();
  if (period === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  return new Date(base.getFullYear(), base.getMonth(), 1).getTime();
}

/**
 * Validation des repas — poste de service d'une cantine scolaire (poste + kiosque).
 *
 * Mise en page pensée pour le GUICHET :
 * 1. Colonne gauche collante = STATION DE SCAN (caméra, photo du badge, code manuel).
 *    C'est l'action n°1 du service : elle reste visible pendant qu'on parcourt la file.
 * 2. Colonne droite = DOSSIER DE L'ÉLÈVE scanné (ses commandes payées par carte,
 *    servies / annulées) puis la LISTE DES ÉLÈVES (recherche, classe, 1 clic = 1 repas).
 * 3. Bas de page = JOURNAL des passages du jour (horodaté, accepté / refusé + motif).
 *
 * 4 modes de contrôle : liste, scan caméra live (ZXing intégré), photo du badge
 * (décodage local, marche même en HTTP), saisie manuelle.
 * Contrôles auto : abonnement actif, date valide, repas restants, anti-double 1/jour/QR.
 * Règle carte : la carte prépayée sert aux TICKETS repas ; les abonnements
 * se paient Wave / espèces — jamais avec le solde.
 */
const READER_ID = 'o-resto-qr-reader';
const PHOTO_READER_ID = 'o-resto-qr-photo';
const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Bip de confirmation du guichet (succès aigu / refus grave). Silencieux si indisponible. */
function playBeep(ok: boolean) {
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = ok ? 'sine' : 'square';
    osc.frequency.setValueAtTime(ok ? 880 : 220, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.22 : 0.42));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => { void ctx.close(); };
  } catch {
    /* retour visuel suffit */
  }
}

const ValidationPage = () => {
  const { establishments, subscriptions, formulas, validateMeal, validations, children: kids, walletOf, weeklyMenus, kioskOrders, serveKioskOrder, cancelKioskOrder, resolveChildQr } = useResto();
  const [token, setToken] = useState('');
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? '');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  /** Scan en attente : on montre la fiche + le détail avant tout débit. */
  const [pendingScan, setPendingScan] = useState<{ code: string } | null>(null);
  /** Commande que le superviseur s'apprête à annuler (remboursement carte). */
  const [orderToCancel, setOrderToCancel] = useState<KioskOrder | null>(null);
  /** Élève désigné par le scan (ou par un clic sur la liste) : sa file de commandes. */
  const [scannedChildId, setScannedChildId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [clock, setClock] = useState(() => new Date());
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPanelRef = useRef<HTMLElement | null>(null);
  const estabRef = useRef(establishmentId);
  estabRef.current = establishmentId;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const today = useMemo(
    () => validations.filter((v) => sameDay(new Date(v.validatedAt), new Date())),
    [validations],
  );
  const servedToday = today.filter((v) => v.status === 'accepted').length;
  const refusedToday = today.filter((v) => v.status === 'rejected').length;
  /** Commandes payées par carte qui attendent leur remise au guichet. */
  const queueLength = useMemo(() => kioskOrders.filter((o) => o.status === 'pending').length, [kioskOrders]);

  // ---- Journal des validations : période jour / semaine / mois + export ----
  const [journalPeriod, setJournalPeriod] = useState<JournalPeriod>('day');
  const journalSince = useMemo(() => startOfPeriod(journalPeriod), [journalPeriod]);
  const journalRows = useMemo(
    () => validations
      .filter((v) => new Date(v.validatedAt).getTime() >= journalSince)
      .sort((a, b) => +new Date(b.validatedAt) - +new Date(a.validatedAt)),
    [validations, journalSince],
  );

  /**
   * Répartition du service DU JOUR par formule officielle :
   * F2 = préscolaire/élémentaire, F3 = collège/lycée.
   */
  const repartitionDuJour = useMemo(() => {
    const split = { F2: 0, F3: 0 };
    today
      .filter((v) => v.status === 'accepted' && v.childId)
      .forEach((v) => {
        const sub = subscriptions.find((s) => s.childId === v.childId && s.status === 'active');
        if (sub?.formulaId === 'F2') split.F2 += 1;
        else if (sub?.formulaId === 'F3') split.F3 += 1;
      });
    return split;
  }, [today, subscriptions]);

  /** Export CSV (Excel-friendly) du journal sur la période affichée. */
  const exportJournal = () => {
    const ba = (iso: string | Date, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('fr-FR', opts);
    const rows: string[][] = [['Date', 'Heure', 'Élève', 'Formule', 'Statut', 'Motif']];
    journalRows.forEach((v) => {
      const k = v.childId ? kids.find((c) => c.id === v.childId) : undefined;
      const sub = v.childId ? subscriptions.find((s) => s.childId === v.childId && s.status === 'active') : undefined;
      const formule = sub?.formulaId === 'F2'
        ? 'Préscolaire & Élémentaire'
        : sub?.formulaId === 'F3'
          ? 'Collège & Lycée'
          : v.clientUsername?.startsWith('TICKET-') ? 'Ticket' : sub?.formulaId ?? '—';
      rows.push([
        ba(v.validatedAt, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        ba(v.validatedAt, { hour: '2-digit', minute: '2-digit' }),
        k ? `${k.firstName} ${k.lastName}` : v.clientUsername,
        formule,
        v.status === 'accepted' ? 'Servie' : 'Refusé',
        v.reason ?? '',
      ]);
    });
    const csv = '﻿' + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal-repas-${journalPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Élèves avec abonnement actif (compteur d'en-tête)
  const activeSubs = useMemo(
    () => subscriptions.filter((s) => s.status === 'active' && new Date(s.endDate).getTime() >= Date.now()),
    [subscriptions],
  );
  const classes = useMemo(
    () => Array.from(new Set(kids.map((k) => k.className))).sort(),
    [kids],
  );
  const filteredKids = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cf = classFilter.trim().toLowerCase();
    return kids
      .filter((k) => !cf || (k.className ?? '').toLowerCase().includes(cf))
      .filter((k) => !q || `${k.firstName} ${k.lastName} ${k.className}`.toLowerCase().includes(q) || k.qrToken.toLowerCase().includes(q))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [kids, search, classFilter]);

  // Enfant → abonnement actif (repas décomptés) ou solde carte (tickets).
  const nowMs = Date.now();
  const activeSubOf = (childId: string) =>
    subscriptions.find((s) => s.childId === childId && s.status === 'active' && new Date(s.endDate).getTime() >= nowMs);
  const servedTodayOf = (childId: string) =>
    today.filter((v) => v.status === 'accepted' && v.childId === childId).length;
  const hasSite = establishments.length > 0;

  // ---- File des commandes carte de l'élève
  // Une commande payée par carte (achat parent au kiosque, vente comptoir)
  // arrive en « en attente » : c'est l'élève qui présente son QR au service.
  const pendingOf = (childId: string) => kioskOrders.filter((o) => o.childId === childId && o.status === 'pending').length;
  const scannedChild = scannedChildId ? kids.find((k) => k.id === scannedChildId) : undefined;
  const scannedOrders = useMemo(() => {
    if (!scannedChildId) return [];
    return kioskOrders
      .filter((o) => o.childId === scannedChildId)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [kioskOrders, scannedChildId]);
  const scannedPending = scannedOrders.filter((o) => o.status === 'pending');

  // Plat du jour : publié par le Personnel (menus cantine). Sert de référence
  // affichée sur chaque ligne — sans menu publié, on sert par abonnement/solde.
  const publishedMenus = weeklyMenus.filter((m) => (m.items ?? []).length > 0);
  const menuOfDate = (d: Date) => publishedMenus.find((m) => m.day === DAY_NAMES[d.getDay()]);
  const dishOfDate = (d: Date) => {
    const m = menuOfDate(d);
    if (!m) return null;
    return m.name || `Menu du ${m.day}`;
  };
  const todayDish = dishOfDate(new Date());
  const todayItems = menuOfDate(new Date())?.items ?? [];

  // Nom d'élève d'un passage : prénom + nom de l'enfant, sinon compte.
  const eleveOfValidation = (v: { childId?: string; clientUsername: string }) => {
    const k = v.childId ? kids.find((c) => c.id === v.childId) : undefined;
    return k ? `${k.firstName} ${k.lastName}` : v.clientUsername;
  };

  // Horloge du guichet (heure visible pendant le service)
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Retour visuel auto-effaçant : le guichet enchaîne vite, le bandeau se retire
  // tout seul (succès = rapide, refus = un peu plus long pour lire le motif).
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => setResult(null), result.ok ? 4000 : 7000);
    return () => window.clearTimeout(id);
  }, [result]);

  const notify = (ok: boolean) => {
    if (soundRef.current) playBeep(ok);
  };

  // ---- Étape 1 : le scan OUVRE la fiche, il ne débite rien.
  // Le superviseur voit l'élève, sa carte, son abonnement, son solde, le plat
  // et les commandes en attente ; il confirme ensuite explicitement.
  const prepareValidation = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setResult({ ok: false, message: 'Saisissez ou scannez un code élève.' });
      notify(false);
      return;
    }
    if (!estabRef.current) {
      setResult({ ok: false, message: 'Aucune cantine : créez un établissement dans la section Établissement.' });
      notify(false);
      return;
    }
    const scanned = resolveChildQr(clean);
    const isTicket = clean.startsWith('TICKET-');
    const isSubQr = subscriptions.some((s) => (s.qrToken ?? '').toUpperCase() === clean);
    // QR inconnu : on ne crée pas de refus dans le journal, on prévient le guichet.
    if (!scanned.child && !isTicket && !isSubQr) {
      setPendingScan(null);
      setScannedChildId(null);
      setResult({ ok: false, message: scanned.message || 'QR Code inconnu : aucun élève, ticket ou abonnement associé.' });
      notify(false);
      return;
    }
    if (scanned.child) setScannedChildId(scanned.child.id);
    setResult(null);
    setPendingScan({ code: clean });
  };

  /** Étape 2 : confirmation explicite → là seulement, le repas est débité. */
  const confirmPendingMeal = () => {
    if (!pendingScan) return;
    const r = validateMeal(pendingScan.code, estabRef.current);
    setResult({ ok: r.ok, message: r.message });
    notify(r.ok);
    if (r.ok) {
      setPendingScan(null);
      setToken('');
    }
  };

  const cancelPendingScan = () => {
    setPendingScan(null);
    setResult(null);
  };

  const pending = pendingScan ? resolveChildQr(pendingScan.code) : null;
  const pendingChild = pending?.child;
  const pendingSub = pending?.subscription;
  const pendingBalance = pending?.balance ?? 0;
  const pendingServedToday = pendingChild ? servedTodayOf(pendingChild.id) : 0;
  const pendingOrders = pendingChild
    ? kioskOrders.filter((o) => o.childId === pendingChild.id && o.status === 'pending')
    : [];
  const pendingOrdersTotal = pendingOrders.reduce((s, o) => s + o.total, 0);
  const pendingTicket = !!pendingScan && pendingScan.code.startsWith('TICKET-');
  const pendingSubQr = !!pendingScan && subscriptions.some((s) => (s.qrToken ?? '').toUpperCase() === pendingScan.code);
  // Règle de service : un repas ne se sert qu'uniquement si l'élève a un
  // abonnement actif (ou un ticket). La carte prépayée ne débitant plus le
  // repas, le solde carte n'est plus une alternative au déjeuner.
  const pendingSubServes = !!pendingSub && pendingSub.mealsRemaining > 0;
  const canServeMeal = !!pendingScan && hasSite && !pendingTicket
    ? pendingServedToday < 1 && (pendingSubServes || pendingSubQr)
    : !!pendingScan && hasSite;

  const confirmPendingOrders = () => {
    const list = pendingOrders;
    if (list.length === 0) return;
    list.forEach((o) => serveKioskOrder(o.id));
    const name = pendingChild ? `${pendingChild.firstName} ${pendingChild.lastName}` : 'l’élève';
    setResult({ ok: true, message: `${list.length} commande(s) remise(s) à ${name} — ${formatCurrency(list.reduce((s, o) => s + o.total, 0))}.` });
    notify(true);
  };

  useEffect(() => {
    const panel = pendingPanelRef.current;
    if (pendingScan && typeof panel?.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [pendingScan]);

  // Annulation d'une commande pas encore remise → remboursement sur la carte.
  const confirmCancelOrder = () => {
    if (!orderToCancel) return;
    const res = cancelKioskOrder(orderToCancel.id);
    setResult({ ok: res.ok, message: res.message });
    notify(res.ok);
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await scanner.stop();
        }
      } catch {
        /* déjà arrêté */
      }
      try {
        await scanner.clear();
      } catch {
        /* ignore */
      }
    }
  };

  const stopScan = () => {
    void stopScanner();
    setScanning(false);
  };

  // Arrêt caméra à la sortie de la page
  useEffect(() => () => {
    void stopScanner();
  }, []);

  // Démarrage du scan live dès que le lecteur est affiché.
  // html5-qrcode embarque ZXing → tous navigateurs ; détecteur natif utilisé
  // en priorité quand le navigateur le propose.
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      try {
        const scanner = new Html5Qrcode(READER_ID, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        });
        scannerRef.current = scanner;
        let cameraConfig: Parameters<Html5Qrcode['start']>[0] = { facingMode: 'environment' };
        try {
          const cameras = await Html5Qrcode.getCameras();
          const backId = pickBackCameraId(cameras.map((c) => ({ id: c.id, label: c.label })));
          if (backId) cameraConfig = { deviceId: { exact: backId } };
        } catch {
          /* repli : facingMode environment */
        }
        await scanner.start(
          cameraConfig,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            if (cancelled) return;
            const code = text.trim();
            setToken(code);
            void stopScanner();
            setScanning(false);
            prepareValidation(code);
          },
          () => undefined,
        );
        if (cancelled) await stopScanner();
      } catch (err) {
        if (cancelled) return;
        await stopScanner();
        setScanning(false);
        const secure = typeof window !== 'undefined'
          ? isSecureScanContext(window.location.hostname, window.location.protocol)
          : true;
        setScanError(friendlyScanError(scanErrorName(err), secure));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const startScan = () => {
    setScanError('');
    setResult(null);
    setScanning(true);
  };

  // Repli universel : photo du badge décodée en local (aucune API caméra requise,
  // marche dans tous les navigateurs, même en HTTP non sécurisé).
  const handlePhotoScan = async (file: File) => {
    setScanError('');
    setResult(null);
    const reader = new Html5Qrcode(PHOTO_READER_ID, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    try {
      const text = await reader.scanFile(file, false);
      const code = text.trim();
      setToken(code);
      prepareValidation(code);
    } catch {
      setScanError('QR illisible sur cette photo : rapprochez le badge, évitez flou et reflets, ou saisissez le code manuellement.');
    } finally {
      try {
        await reader.clear();
      } catch {
        /* ignore */
      }
    }
  };

  const handleValidate = (e: React.FormEvent) => {
    e.preventDefault();
    prepareValidation(token);
  };

  const kpis = [
    { label: 'repas servis', value: servedToday, tone: 'text-emerald-300' },
    { label: 'refus du jour', value: refusedToday, tone: 'text-red-300' },
    { label: 'file d’attente', value: queueLength, tone: 'text-amber-300' },
    { label: 'abonnés actifs', value: activeSubs.length, tone: 'text-white' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      {/* ============ EN-TÊTE DU POSTE DE SERVICE ============ */}
      <header className="bg-slate-900 rounded-3xl p-5 md:p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Contrôle des repas · Point de service</p>
            <h1 className="text-xl md:text-3xl font-black flex items-center gap-2 mt-1">
              <ScanLine className="w-6 h-6 md:w-7 md:h-7 text-emerald-400" /> Validation des repas
            </h1>
            <p className="text-slate-400 text-sm mt-1">Contrôle automatique : abonnement actif, date valide, anti-double 1 repas / jour / QR.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white/10 rounded-xl border border-white/10 px-4 py-2.5 text-center">
              <p className="text-xl font-black leading-none tabular-nums flex items-center justify-center gap-1.5">
                <Clock3 className="w-4 h-4 text-emerald-400" aria-hidden />
                {clock.toLocaleTimeString('fr-FR')}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                {DAY_NAMES[clock.getDay()]} {clock.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSoundOn((s) => !s)}
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Désactiver le bip sonore' : 'Activer le bip sonore'}
              title={soundOn ? 'Bip sonore activé' : 'Bip sonore désactivé'}
              className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center hover:bg-white/20"
            >
              {soundOn ? <Volume2 className="w-5 h-5 text-emerald-300" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(240px,340px)_1fr]">
          <div>
            <label htmlFor="cantine-service" className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Cantine · lieu du service
            </label>
            <select
              id="cantine-service"
              value={establishmentId}
              onChange={(e) => setEstablishmentId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white font-bold outline-none focus:border-emerald-400 [&>option]:bg-slate-900 [&>option]:text-white"
            >
              {establishments.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {kpis.map((k) => (
              <div key={k.label} className="bg-white/10 rounded-xl border border-white/10 px-3 py-2.5 text-center">
                <p className={`text-2xl font-black leading-none tabular-nums ${k.tone}`}>{k.value}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ============ RETOUR DU SERVICE (bandeau collant) ============ */}
      {result && (
        <div
          role="status"
          aria-live="polite"
          className={`sticky top-2 z-30 rounded-2xl p-4 flex items-center gap-3 text-sm font-medium shadow-xl animate-fade-in ${result.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {result.ok ? <CheckCircle className="w-7 h-7 flex-shrink-0" /> : <XCircle className="w-7 h-7 flex-shrink-0" />}
          <span className="min-w-0 flex-1">
            {result.ok && (
              <span className="block text-2xl font-black uppercase tracking-[0.2em] leading-none">Servie</span>
            )}
            {!result.ok && (
              <span className="block text-xl font-black uppercase tracking-wider leading-none mb-1">Refus</span>
            )}
            <span className={result.ok ? 'block mt-1 text-green-50' : 'block text-red-50'}>{result.message}</span>
          </span>
          <button
            type="button"
            onClick={() => setResult(null)}
            aria-label="Fermer le message"
            className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============ CONFIRMATION DU SCAN : fiche + détail avant débit ============ */}
      {pendingScan && (
        <section
          ref={pendingPanelRef}
          aria-labelledby="confirm-scan-title"
          className="rounded-3xl border-2 border-amber-300 bg-white shadow-xl overflow-hidden animate-fade-in"
        >
          <div className="bg-gradient-to-r from-amber-50 to-emerald-50 border-b-2 border-amber-200 p-4 md:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Scan reçu — rien n’est encore débité</p>
              <h2 id="confirm-scan-title" className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-600 flex-shrink-0" /> Confirmer l’achat / la commande
              </h2>
            </div>
            <button
              type="button"
              onClick={cancelPendingScan}
              aria-label="Annuler ce scan"
              className="w-10 h-10 rounded-xl bg-white border-2 border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 flex items-center justify-center flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 md:p-5 grid gap-4 lg:grid-cols-2">
            {/* Identité + carte + abonnement */}
            <div className="space-y-3">
              {pendingChild ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-700 to-emerald-600 text-white font-black flex items-center justify-center text-lg flex-shrink-0">
                    {pendingChild.firstName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate capitalize">{pendingChild.firstName} {pendingChild.lastName}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Classe {pendingChild.className} · Carte élève</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-black text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    {pendingTicket ? 'Ticket visiteur' : 'Abonnement scanné'}
                  </p>
                  <p className="font-mono text-sm text-slate-600 mt-0.5 break-all">{pendingScan.code}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {pendingTicket
                      ? 'Ticket repas à usage unique — aucune fiche élève associée.'
                      : 'Le QR est rattaché à un abonnement : le repas sera décompté du solde de repas.'}
                  </p>
                </div>
              )}

              {pendingChild && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carte</p>
                    <p className="text-xs font-mono font-bold text-slate-700 break-all">{pendingChild.qrToken}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Wallet className="w-3 h-3" /> Solde carte</p>
                    <p className="text-sm font-black text-slate-900">{formatCurrency(pendingBalance)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Abonnement</p>
                    <p className="text-sm font-bold text-slate-800">
                      {pendingSub
                        ? `${formulas.find((f) => f.id === pendingSub.formulaId)?.name ?? 'Abonnement'} · ${pendingSub.mealsRemaining} repas`
                        : 'Aucun abonnement actif'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Échéance</p>
                    <p className="text-sm font-bold text-slate-800">
                      {pendingSub ? new Date(pendingSub.endDate).toLocaleDateString('fr-FR') : '—'}
                    </p>
                  </div>
                </div>
              )}

              <div className={`rounded-xl border-2 p-3 text-sm font-semibold flex items-start gap-2 ${
                pendingServedToday >= 1 || (!pendingTicket && !canServeMeal)
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                <span>
                  {pendingTicket
                    ? 'Repas visiteur : 1 repas, ticket consommé dès confirmation.'
                    : !hasSite
                      ? 'Aucune cantine sélectionnée.'
                      : pendingServedToday >= 1
                        ? 'Un repas a déjà été servi aujourd’hui à cet élève (1 repas / jour).'
                        : pendingSubServes && pendingSub
                          ? `Abonnement : 1 repas sera décompté (${pendingSub.mealsRemaining} → ${pendingSub.mealsRemaining - 1} restants).`
                          : pendingSubQr
                            ? 'Abonnement : 1 repas sera décompté de la formule scannée.'
                            : 'Aucun abonnement de repas actif pour cet élève : le repas ne peut pas être servi (cartes parents / Espace ISM).'}
                </span>
              </div>
            </div>

            {/* Détail de l'achat / des commandes */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5" /> Détail du repas
                </p>
                {todayDish ? (
                  <>
                    <p className="font-black text-slate-900 mt-1">{todayDish}</p>
                    {todayItems.length > 0 && (
                      <p className="text-xs text-slate-600 mt-1 flex flex-wrap gap-1.5">
                        {todayItems.map((it) => (
                          <span key={it.name} className="bg-slate-100 rounded-full px-2 py-0.5 font-bold">{it.name}</span>
                        ))}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500 mt-1">Aucun menu publié aujourd’hui — repas standard décompté de l’abonnement ou de la carte.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5" /> Commandes à remettre
                  </p>
                  {pendingOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black">
                      {pendingOrders.length} · {formatCurrency(pendingOrdersTotal)}
                    </span>
                  )}
                </div>
                {pendingOrders.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {pendingOrders.map((o) => (
                      <li key={o.id} className="rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-2">
                        <p className="text-sm font-bold text-slate-800">
                          {o.items.length > 0 ? o.items.map((i) => `${i.name} ×${i.qty}`).join(' · ') : 'Commande'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatCurrency(o.total)} · Réf {o.reference} · {new Date(o.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500 mt-1">
                    {pendingChild ? 'Aucune commande payée en attente : seule la validation du repas est concernée.' : 'Aucune commande liée à ce QR.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 md:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={cancelPendingScan}
              className="min-h-[48px] px-5 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-bold text-sm hover:border-slate-300"
            >
              Annuler
            </button>
            {pendingOrders.length > 0 && (
              <button
                type="button"
                onClick={confirmPendingOrders}
                className="min-h-[48px] px-5 rounded-xl bg-amber-500 text-slate-900 font-black text-sm hover:bg-amber-400 flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" /> Remettre {pendingOrders.length} commande{pendingOrders.length > 1 ? 's' : ''} · {formatCurrency(pendingOrdersTotal)}
              </button>
            )}
            <button
              type="button"
              onClick={confirmPendingMeal}
              disabled={!canServeMeal}
              className="min-h-[48px] px-6 rounded-xl bg-green-700 text-white font-black text-sm hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle className="w-4 h-4" />
              {pendingTicket ? 'Confirmer le repas visiteur' : 'Confirmer le repas servi'}
            </button>
          </div>
        </section>
      )}

      {!hasSite && (
        <div className="rounded-2xl p-4 flex gap-2 text-sm font-medium bg-red-50 text-red-800 border border-red-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>Aucune cantine enregistrée — créez votre établissement dans la section Établissement avant de servir.</span>
        </div>
      )}

      {/* ============ POSTE : SCAN | FILE + ÉLÈVES ============ */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] items-start">
        {/* --- Station de scan (collante : visible pendant le parcours de la file) --- */}
        <section className="bg-white rounded-3xl border-2 border-slate-100 p-5 space-y-4 lg:sticky lg:top-4 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <p className="font-black text-slate-900 flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-green-700" /> Station de scan
            </p>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Guichet</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!scanning ? (
              <button
                type="button"
                onClick={startScan}
                className="min-h-[56px] flex items-center justify-center gap-2 rounded-2xl font-black text-sm bg-green-700 text-white hover:bg-green-800 shadow-sm"
              >
                <Camera className="w-5 h-5" /> Scanner le badge
              </button>
            ) : (
              <button
                type="button"
                onClick={stopScan}
                className="min-h-[56px] flex items-center justify-center gap-2 rounded-2xl font-black text-sm bg-slate-900 text-white hover:bg-slate-800"
              >
                <Square className="w-5 h-5" /> Arrêter
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[56px] flex items-center justify-center gap-2 rounded-2xl font-black text-sm bg-white border-2 border-slate-200 text-slate-800 hover:border-slate-300"
            >
              <ImagePlus className="w-5 h-5" /> Photo du badge
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Photo du badge QR à décoder"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handlePhotoScan(file);
            }}
          />

          {scanning && (
            <div>
              <div id={READER_ID} className="rounded-2xl overflow-hidden border-2 border-slate-700 bg-black min-h-[260px]" />
              <p className="text-center text-xs text-slate-500 py-2">Présentez le badge de l’élève devant la caméra…</p>
            </div>
          )}

          {scanError && (
            <div className="rounded-xl p-4 flex gap-2 text-sm font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <XCircle className="w-5 h-5 flex-shrink-0" /> {scanError}
            </div>
          )}
          {/* Lecteur caché pour le décodage des photos (aucune caméra requise) */}
          <div id={PHOTO_READER_ID} className="hidden" aria-hidden="true" />

          <form onSubmit={handleValidate} className="space-y-2">
            <label htmlFor="code-manuel" className="text-xs font-black uppercase tracking-widest text-slate-500">
              Saisie manuelle du code
            </label>
            <div className="flex gap-2">
              <input
                id="code-manuel"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ORESTO-XXXXXX"
                className="min-w-0 flex-1 px-4 py-3.5 rounded-xl border-2 border-slate-200 font-mono uppercase outline-none focus:border-emerald-500 text-sm"
              />
              <button type="submit" className="px-5 py-3.5 rounded-xl bg-slate-900 text-white font-black text-sm hover:bg-slate-800">
                Valider
              </button>
            </div>
          </form>
        </section>

        {/* --- Dossier de l'élève + liste --- */}
        <div className="space-y-5 min-w-0">
          {scannedChildId && (
            <section className="bg-white rounded-3xl border-2 border-slate-100 p-5 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-700 to-emerald-600 text-white font-black flex items-center justify-center flex-shrink-0 text-lg">
                    {(scannedChild?.firstName ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate">
                      {scannedChild ? `${scannedChild.firstName} ${scannedChild.lastName}` : 'Dossier élève'}
                    </p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {scannedChild ? scannedChild.className : 'QR scanné'} · {scannedPending.length} commande{scannedPending.length > 1 ? 's' : ''} en attente
                    </p>
                  </div>
                </div>
                {scannedPending.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => scannedPending.forEach((o) => serveKioskOrder(o.id))}
                    className="px-5 py-3 min-h-[44px] rounded-xl bg-green-700 text-white text-sm font-black hover:bg-green-800 flex items-center gap-2 shadow-sm"
                  >
                    <CheckCircle className="w-4 h-4" /> Tout servir ({scannedPending.length})
                  </button>
                ) : (
                  <span className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle aria-hidden className="w-3.5 h-3.5" /> Rien à servir
                  </span>
                )}
              </div>

              {/* Fiche carte élève : ce que le superviseur doit voir au scan */}
              {scannedChild && (() => {
                const sub = activeSubOf(scannedChild.id);
                const formula = sub ? formulas.find((f) => f.id === sub.formulaId) : undefined;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carte</p>
                      <p className="text-xs font-mono font-bold text-slate-700 break-all">{scannedChild.qrToken}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Abonnement</p>
                      <p className="text-sm font-bold text-slate-800">
                        {sub ? `${formula?.name ?? 'Abonnement'} · ${sub.mealsRemaining} repas` : 'Aucun actif'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Échéance</p>
                      <p className="text-sm font-bold text-slate-800">{sub ? new Date(sub.endDate).toLocaleDateString('fr-FR') : '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Solde carte</p>
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(walletOf(scannedChild.id))}</p>
                    </div>
                  </div>
                );
              })()}

              {scannedOrders.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-5 text-center">
                  Aucune commande payée par carte pour cet élève.
                  <span className="block text-xs text-slate-400 mt-1">
                    Un achat au kiosque ou une vente au comptoir s’affiche ici dès qu’elle est enregistrée.
                  </span>
                </p>
              ) : (
                <ul className="space-y-2">
                  {scannedOrders.map((o) => (
                    <li
                      key={o.id}
                      className={`rounded-2xl border p-3.5 ${o.status === 'pending' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm">
                            {o.items.length > 0 ? o.items.map((i) => `${i.name} ×${i.qty}`).join(' · ') : 'Commande'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatCurrency(o.total)} · Réf {o.reference} ·{' '}
                            {new Date(o.createdAt).toLocaleString('fr-FR', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                        {o.status === 'pending' ? (
                          <div className="flex items-center gap-2 self-start">
                            <button
                              type="button"
                              onClick={() => serveKioskOrder(o.id)}
                              aria-label={`Servir la commande ${o.reference}`}
                              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800 flex items-center gap-1.5"
                            >
                              <CheckCircle aria-hidden className="w-4 h-4" /> Servir
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderToCancel(o)}
                              aria-label={`Annuler la commande ${o.reference}`}
                              className="px-3 py-2.5 min-h-[44px] rounded-xl bg-red-50 border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-100 flex items-center gap-1.5"
                            >
                              <Ban aria-hidden className="w-4 h-4" /> Annuler
                            </button>
                          </div>
                        ) : o.status === 'cancelled' ? (
                          <span className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 flex items-center gap-1 self-start">
                            <Ban aria-hidden className="w-3.5 h-3.5" /> Annulée · remboursée
                          </span>
                        ) : (
                          <span className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 self-start">
                            <CheckCircle aria-hidden className="w-3.5 h-3.5" /> Servie
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Liste des élèves — file du self : 1 clic = 1 repas */}
          <section className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <p className="font-black text-slate-900 flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-green-700" /> Élèves
                <span className="text-xs font-bold text-slate-400">({filteredKids.length})</span>
              </p>
              <div className="relative flex-1 min-w-[200px]">
                <Search aria-hidden className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <label htmlFor="search-eleve" className="sr-only">Rechercher un élève</label>
                <input id="search-eleve" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, classe ou code QR…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-green-700" />
              </div>
              <label htmlFor="classe-eleve" className="sr-only">Filtrer par classe</label>
              <input
                id="classe-eleve"
                list="classes-eleve-suggestions"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                placeholder="Toutes classes"
                spellCheck={false}
                className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-green-600"
              />
              <datalist id="classes-eleve-suggestions">
                {classes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            {filteredKids.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Aucun élève{search || classFilter ? ' pour cette recherche' : ' inscrit'}.</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto order-scrollbar">
                {filteredKids.map((k) => {
                  const sub = activeSubOf(k.id);
                  const served = servedTodayOf(k.id);
                  const already = served >= 1;
                  const aServir = pendingOf(k.id);
                  const ouvert = scannedChildId === k.id;
                  return (
                    <li
                      key={k.id}
                      className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${ouvert ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                      onClick={() => setScannedChildId(k.id)}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-700 to-emerald-600 text-white font-black flex items-center justify-center flex-shrink-0">
                        {k.firstName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 capitalize truncate">{k.firstName} {k.lastName} <span className="font-normal text-slate-400">• {k.className}</span></p>
                        <p className="text-xs text-slate-500 truncate">
                          {sub ? `${formulas.find((f) => f.id === sub.formulaId)?.name ?? 'Abonnement'} • ${sub.mealsRemaining} repas restants` : `Sans abonnement • solde ${walletOf(k.id)} FCFA`}
                          {todayDish ? ` • plat : ${todayDish}` : ''}
                        </p>
                      </div>
                      {aServir > 0 && (
                        <span className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 flex-shrink-0">
                          <ShoppingBag aria-hidden className="w-3.5 h-3.5" /> {aServir} à servir
                        </span>
                      )}
                      {already ? (
                        <span className="px-3 py-2 rounded-xl text-xs font-bold bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle aria-hidden className="w-3.5 h-3.5" /> Servie</span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); prepareValidation(k.qrToken); }} disabled={!hasSite} aria-label={`Préparer le repas de ${k.firstName} ${k.lastName}`} title="Ouvrir la fiche et confirmer" className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-bold bg-green-700 text-white hover:bg-green-800 disabled:opacity-40">
                          Confirmer
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ============ JOURNAL DES VALIDATIONS ============ */}
      <section className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden" data-testid="journal-repas">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-slate-900 flex items-center gap-2">
              <Inbox className="w-5 h-5 text-green-700" /> Journal des validations
              <span className="text-xs font-bold text-slate-400">
                ({journalRows.length} passage{journalRows.length > 1 ? 's' : ''} — {journalPeriod === 'day' ? 'jour' : journalPeriod === 'week' ? 'semaine' : 'mois'})
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 mr-1">Répartition du jour</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white" data-testid="repartition-f2">
                Préscolaire & Élémentaire · {repartitionDuJour.F2}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-white" data-testid="repartition-f3">
                Collège & Lycée · {repartitionDuJour.F3}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">{servedToday} servis</span>
              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700">{refusedToday} refus</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden" role="group" aria-label="Période du journal">
              {(['day', 'week', 'month'] as JournalPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setJournalPeriod(p)}
                  aria-pressed={journalPeriod === p}
                  data-testid={`journal-periode-${p}`}
                  className={`px-3.5 py-2 min-h-[40px] text-xs font-bold transition ${journalPeriod === p ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {p === 'day' ? 'Jour' : p === 'week' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportJournal}
              disabled={journalRows.length === 0}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-green-700 text-white text-xs font-black hover:bg-green-800 disabled:opacity-40 inline-flex items-center gap-1.5"
              data-testid="journal-export"
            >
              <Download className="w-3.5 h-3.5" /> Exporter
            </button>
          </div>
        </div>
        {journalRows.length === 0 ? (
          <p className="px-4 pb-4 pt-1 text-sm text-slate-500">
            Aucun passage sur la période ({journalPeriod === 'day' ? 'aujourd’hui' : journalPeriod === 'week' ? 'semaine en cours' : 'mois en cours'}).
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Heure</th><th className="text-left p-3">Élève</th><th className="text-left p-3">Formule</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Motif</th></tr>
              </thead>
              <tbody>
                {journalRows.map((v) => {
                  const k = v.childId ? kids.find((c) => c.id === v.childId) : undefined;
                  const sub = v.childId ? subscriptions.find((s) => s.childId === v.childId && s.status === 'active') : undefined;
                  const formuleLabel = sub?.formulaId === 'F2'
                    ? 'Préscolaire & Élémentaire'
                    : sub?.formulaId === 'F3'
                      ? 'Collège & Lycée'
                      : v.clientUsername?.startsWith('TICKET-') ? 'Ticket' : sub?.formulaId ?? '—';
                  return (
                    <tr key={v.id} className="border-t">
                      <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(v.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</td>
                      <td className="p-3 whitespace-nowrap">{new Date(v.validatedAt).toLocaleTimeString('fr-FR')}</td>
                      <td className="p-3 font-semibold capitalize">{eleveOfValidation(v)}</td>
                      <td className="p-3 text-slate-600">{formuleLabel}</td>
                      <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${v.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{v.status === 'accepted' ? 'SERVIE' : 'Refusé'}</span></td>
                      <td className="p-3 text-slate-500">{v.reason ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Annulation d'une commande payée par carte : remboursement sur la carte */}
      <ConfirmDialog
        isOpen={!!orderToCancel}
        onClose={() => setOrderToCancel(null)}
        onConfirm={confirmCancelOrder}
        title="Annuler la commande ?"
        message={
          orderToCancel
            ? `Commande ${orderToCancel.reference} · ${formatCurrency(orderToCancel.total)}. Le montant sera recrédité sur la carte prépayée de l'élève.`
            : ''
        }
        type="danger"
        confirmText="Annuler la commande"
        cancelText="Retour"
      />
    </div>
  );
};

export default ValidationPage;
