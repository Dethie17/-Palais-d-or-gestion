import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import {
  Establishment,
  Formula,
  Subscription,
  ORestoPayment,
  ORestoPaymentMethod,
  MealValidation,
  Child,
  Wallet,
  WalletTx,
  FinanceSettings,
  FinanceExpense,
  ExpenseCategory,
  WeeklyMenu,
  WeeklyMenuItem,
  WEEK_DAYS,
  SchoolCycle,
  ParentProfile,
  KioskOrder,
} from '@/types/menu';
import { supabase } from '@/lib/supabase';
import {
  checkWaveCode,
  clearWaveCode,
  initiateWavePayment,
  isMobileMethod,
  WAVE_TTL_MS,
  type WavePaymentRequest,
} from '@/lib/wave';
import { getClientQrToken, isPersonalQrToken, getChildQrToken } from '@/lib/clientQr';
import { inferCycleFromClass } from '@/lib/schoolCycles';
import { referenceWeek } from '@/data/cantineWeek';

const LS_KEYS = {
  establishments: 'o-resto-establishments-v1',
  formulas: 'o-resto-formulas-v1',
  subscriptions: 'o-resto-subscriptions-v1',
  payments: 'o-resto-payments-v1',
  validations: 'o-resto-validations-v1',
  ticketIntents: 'o-resto-ticket-intents-v1',
  children: 'o-resto-children-v1',
  wallets: 'o-resto-wallets-v1',
  walletTxs: 'o-resto-wallettxs-v1',
  parentProfiles: 'o-resto-parentprofiles-v1',
  financeSettings: 'o-resto-financesettings-v1',
  financeExpenses: 'o-resto-financeexpenses-v1',
  weeklyMenus: 'o-resto-weeklymenus-v3',
};

// Migration douce depuis les anciennes clés sans version
const LEGACY_LS_KEYS: Record<string, string> = {
  'o-resto-establishments-v1': 'o-resto-establishments',
  'o-resto-formulas-v1': 'o-resto-formulas',
  'o-resto-subscriptions-v1': 'o-resto-subscriptions',
  'o-resto-payments-v1': 'o-resto-payments',
  'o-resto-validations-v1': 'o-resto-validations',
  'o-resto-ticket-intents-v1': 'o-resto-ticket-intents',
};

// Menus de la semaine : semaine de référence cantine (noms, composants, prix
// et photos validés) tant que le Personnel n'a rien publié. Le Personnel garde
// la main via Gestion Menu : composants, prix et publication (local + distant).
// La base distante, quand elle contient une semaine publiée, prend le dessus.
const DEFAULT_WEEKLY_MENUS: WeeklyMenu[] = referenceWeek();

// Semaine déjà enregistrée en local ? Absente = première installation → on
// présente la semaine de référence (jamais une cantine vide par défaut).
function hasStoredWeek(): boolean {
  try {
    return localStorage.getItem(LS_KEYS.weeklyMenus) !== null;
  } catch {
    return true;
  }
}

const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  ismSubscriptionPct: 10, schoolPerSubscription: 2000, otherSalesPct: 5,
  touchpointPct: 0.5, paydounyaPct: 1.5, ismPerSubscription: 2000, ismSalesPct: 5,
};

// Site unique : ISM Thiès (le logiciel ne couvre qu'un seul établissement pour le moment)
export const ISM_SITE: Establishment = {
  id: 'E-ISM', name: 'ISM Thiès', address: 'Thiès, Sénégal', manager: 'Direction ISM',
};

const DEFAULT_ESTABLISHMENTS: Establishment[] = [{ ...ISM_SITE }];

const DEFAULT_FORMULAS: Formula[] = [
  { id: 'F1', name: 'Abonnement Hebdomadaire — Plat du jour', description: 'Plat du jour, 5 repas du lundi au vendredi', price: 9500, durationDays: 7, mealsIncluded: 5, rules: '1 repas / jour, service du midi uniquement', kind: 'subscription' },
  { id: 'F2', name: 'Abonnement Mensuel — Préscolaire & Élémentaire', description: '1 repas le midi, jours d’école, pendant 30 jours', price: 27000, oldPrice: 30000, durationDays: 30, mealsIncluded: 20, rules: '1 repas / jour, service du midi uniquement', kind: 'subscription' },
  { id: 'F3', name: 'Abonnement Mensuel — Lycée', description: '1 repas le midi, jours d’école, pendant 30 jours', price: 32000, oldPrice: 35000, durationDays: 30, mealsIncluded: 20, rules: '1 repas / jour, service du midi uniquement', kind: 'subscription' },
  // Ticket à l'unité : 1 repas crédité, valable 7 jours
  { id: 'T1', name: 'Ticket — 1 repas', description: '1 repas à consommer librement', price: 1900, durationDays: 7, mealsIncluded: 1, rules: 'Ticket valable 7 jours, 1 repas', kind: 'ticket' },
  // Carnet 10 repas : 10 repas crédités, valable 60 jours
  { id: 'C10', name: 'Carnet — 10 repas', description: '10 repas à consommer librement', price: 18000, durationDays: 60, mealsIncluded: 10, rules: 'Carnet valable 60 jours, 10 repas', kind: 'ticket' },
];

// Tarifs officiels 2026 (flyer) : appliqués en douceur aux formules F1/F2/F3/T1/C10,
// sans écraser les formules personnalisées du Caissier ni l'historique.
// Migration unique (flag localStorage) : le Caissier peut ensuite réajuster ses prix.
const OFFICIAL_TARIFFS_2026: Record<string, Formula> = Object.fromEntries(
  DEFAULT_FORMULAS.map((f) => [f.id, f]),
);
const TARIFF_MIGRATION_FLAG = 'o-resto-tarifs-2026c-applied';

function applyOfficialTariffs(list: Formula[]): Formula[] {
  const byId = new Map(list.map((f) => [f.id, f]));
  // 1. Les formules officielles existantes reprennent les tarifs du flyer
  for (const [id, official] of Object.entries(OFFICIAL_TARIFFS_2026)) {
    const cur = byId.get(id);
    if (cur) byId.set(id, { ...cur, ...official });
    else byId.set(id, { ...official });
  }
  // 2. Ordre stable : officielles d'abord, personnalisées ensuite
  const order = ['F1', 'F2', 'F3', 'T1', 'C10'];
  return [...byId.values()].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
    // Migration depuis l'ancienne clé sans version
    const legacy = LEGACY_LS_KEYS[key];
    if (legacy) {
      const oldRaw = localStorage.getItem(legacy);
      if (oldRaw) {
        const parsed = JSON.parse(oldRaw) as T;
        try { localStorage.setItem(key, oldRaw); } catch { /* ignore */ }
        return parsed;
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface RestoContextType {
  establishments: Establishment[];
  formulas: Formula[];
  subscriptions: Subscription[];
  payments: ORestoPayment[];
  validations: MealValidation[];
  addEstablishment: (e: Omit<Establishment, 'id'>) => void;
  updateEstablishment: (id: string, updates: Partial<Establishment>) => void;
  deleteEstablishment: (id: string) => void;
  addFormula: (f: Omit<Formula, 'id'>) => void;
  updateFormula: (id: string, updates: Partial<Formula>) => void;
  deleteFormula: (id: string) => void;
  mySubscription: (username: string) => Subscription | undefined;
  mySubscriptions: (username: string) => Subscription[];
  myPayments: (username: string) => ORestoPayment[];
  myValidations: (username: string) => MealValidation[];
  // Réserve une formule : crée un abonnement "en attente de paiement" (sans paiement)
  subscribe: (clientUsername: string, formulaId: string, childId?: string) => Subscription;
  // Paie un abonnement en attente.
  // - Espèces : reste en attente jusqu'à encaissement au comptoir (Caissier).
  // - Wave : crée une demande de paiement mobile (pending) ;
  //   l'abonnement s'active à la confirmation du code à 6 chiffres.
  paySubscription: (
    subscriptionId: string,
    method: ORestoPaymentMethod,
    subOverride?: Subscription,
  ) => { payment: ORestoPayment; activated: boolean; wave?: WavePaymentRequest };
  // Client : confirme son paiement mobile avec le code à 6 chiffres →
  // paiement soldé + abonnement activé (ou repas ticket crédités).
  confirmMobilePayment: (paymentId: string, code: string) => { ok: boolean; message: string };
  // Client : reprend un paiement mobile en attente (renvoie les instructions + nouveau code).
  resumeMobilePayment: (paymentId: string) => WavePaymentRequest | null;
  // Staff : confirme un paiement espèces → active l'abonnement lié
  confirmCashPayment: (paymentId: string) => boolean;
  // Encaissement comptant en une passe (back-office/comptoir), sans pending stale
  collectCashPayment: (subscriptionId: string) => ORestoPayment | null;
  // Staff (Caissier) : confirme la réception d'un paiement EXTERNE (Wave/OM/espèces/carte)
  // → paiement soldé + abonnement activé ou repas ticket crédités. Coche manuelle.
  confirmManualPayment: (paymentId: string) => boolean;
  // Annule un abonnement en attente (et son paiement en attente)
  cancelSubscription: (subscriptionId: string) => void;
  // Renouvelle : même règles que paySubscription (mobile = code à confirmer).
  renewSubscription: (
    subscriptionId: string,
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; wave?: WavePaymentRequest } | null;
  // Achat d'un ticket repas : espèces = crédit immédiat après enregistrement ;
  // Wave/OM = demande mobile à confirmer (repas crédités à la confirmation) ;
  // 'balance' = débit immédiat de la carte prépayée de l'enfant (childId requis,
  // formules 'ticket' UNIQUEMENT — un abonnement ne se paie jamais avec la carte).
  buyTicket: (
    clientUsername: string,
    formulaId: string,
    method: ORestoPaymentMethod,
    childId?: string,
  ) => { payment: ORestoPayment; addedMeals: number; wave?: WavePaymentRequest };
  // Menu du jour payé par la carte prépayée : débit du total + 1 repas crédité
  // (sur l'abonnement actif de l'enfant, sinon pass 1 jour). Lève une Error
  // si solde insuffisant (message affichable tel quel).
  buyDayMenu: (
    clientUsername: string,
    childId: string,
    day: string,
    total: number,
  ) => { addedMeals: number };
  // Vente au comptoir (Caissier) : formules + tickets pour un client nommé.
  // - Espèces : activation / crédit immédiats + reçu imprimable.
  // - Wave : demande mobile en attente, le client confirme avec son code.
  counterSale: (
    clientUsername: string,
    formulaId: string,
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; wave?: WavePaymentRequest; activated: boolean; addedMeals: number };
  validateMeal: (qrToken: string, establishmentId: string) => { ok: boolean; message: string; validation: MealValidation | null };
  stats: { activeClients: number; mealsToday: number; revenue: number };
  // ---- Enfants + wallet QR (espace parents) ----
  children: Child[];
  wallets: Wallet[];
  walletTxs: WalletTx[];
  financeSettings: FinanceSettings;
  myChildren: (parentUsername: string) => Child[];
  parentProfiles: ParentProfile[];
  parentProfileOf: (parentUsername: string) => ParentProfile | undefined;
  saveParentProfile: (parentUsername: string, firstName: string, lastName: string, phone: string) => ParentProfile;
  walletOf: (childId: string) => number;
  childTxs: (childId: string) => WalletTx[];
  addChild: (parentUsername: string, firstName: string, lastName: string, className: string, cycle?: SchoolCycle) => Child;
  updateChild: (id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => void;
  deleteChild: (id: string) => void;
  deleteParent: (username: string) => void;
  buyKiosk: (clientUsername: string, childId: string, items: { productId: string; productName: string; price: number; qty: number }[]) => { order: KioskOrder; balance: number };
  // Recharge QR Carte : espèces = crédit immédiat, externe = pending à confirmer
  topUpChild: (childId: string, amount: number, method: ORestoPaymentMethod) => { tx: WalletTx; wave?: WavePaymentRequest };
  confirmWalletTopUp: (txId: string) => boolean;
  confirmWalletTopUpMobile: (txId: string, code: string) => { ok: boolean; message: string };
  // Débit interne (validation repas sans abonnement) — retourne faux si solde insuffisant
  debitWallet: (childId: string, amount: number, label: string) => boolean;
  // Règle carte : la carte prépayée sert aux TICKETS repas (débit immédiat).
  // Les ABONNEMENTS se paient InTouch / espèces / Wave — jamais avec le solde.
  setFinanceSettings: (s: Partial<FinanceSettings>) => void;
  // ---- Dépenses manuelles DG (loyer, salaires, fournisseurs...) ----
  financeExpenses: FinanceExpense[];
  addExpense: (label: string, category: ExpenseCategory, amount: number, spentAt: string, createdBy?: string) => FinanceExpense;
  deleteExpense: (id: string) => void;
  // ---- Menu de la semaine (informatif) ----
  weeklyMenus: WeeklyMenu[];
  updateWeeklyMenu: (day: WeeklyMenu['day'], name: string, description: string, items?: WeeklyMenuItem[], price?: number) => void;
  // ---- Ticket visiteur (walk-in) ----
  walkInTickets: { token: string; reference: string; menuName: string; menuDay: string; price: number; items: WeeklyMenuItem[]; method: string; status: string; createdAt: string }[];
  createWalkInTicket: (menu: WeeklyMenu, method: 'cash' | 'intouch' | 'wave') => { token: string; reference: string; ticket: { token: string; reference: string; menuName: string; menuDay: string; price: number; items: WeeklyMenuItem[]; method: string; status: string; createdAt: string } };
}

const RestoContext = createContext<RestoContextType | undefined>(undefined);

/**
 * Site unique ISM Thiès : remplace les anciens sites démo par le seul
 * établissement couvert, en rattachant l'historique des validations.
 * Exécuté une seule fois.
 */
const SITE_CLEANUP_FLAG = 'o-resto-cleanup-site-ism-applied';

function cleanupSingleSite() {
  try {
    if (localStorage.getItem(SITE_CLEANUP_FLAG)) return;
    try { localStorage.setItem(LS_KEYS.establishments, JSON.stringify([{ ...ISM_SITE }])); } catch { /* ignore */ }
    const rawV = localStorage.getItem(LS_KEYS.validations);
    if (rawV) {
      try {
        const vals = JSON.parse(rawV) as MealValidation[];
        const fixed = vals.map((v) => (v.establishmentId && v.establishmentId !== ISM_SITE.id ? { ...v, establishmentId: ISM_SITE.id } : v));
        localStorage.setItem(LS_KEYS.validations, JSON.stringify(fixed));
      } catch { /* ignore */ }
    }
    try { localStorage.setItem(SITE_CLEANUP_FLAG, '1'); } catch { /* ignore */ }
  } catch { /* stockage indisponible */ }
}

/**
 * Nettoyage direct de l'ancienne formule « Midi Semaine 7 500 » (remplacée
 * par l'Hebdo officiel 9 500 au catalogue) : exécuté une seule fois.
 * - La formule personnalisée est supprimée du catalogue ;
 * - ses abonnements (actifs / en attente) sont rattachés à F1 :
 *   repas restants, dates et historique conservés.
 */
const LEGACY_CLEANUP_FLAG = 'o-resto-cleanup-midisemaine-applied';

function cleanupLegacyFormulas() {
  try {
    if (localStorage.getItem(LEGACY_CLEANUP_FLAG)) return;
    const rawF = localStorage.getItem(LS_KEYS.formulas);
    if (rawF) {
      const list = JSON.parse(rawF) as Formula[];
      const doomed = list
        .filter((f) => !OFFICIAL_TARIFFS_2026[f.id] && /midi\s*semaine/i.test(f.name ?? ''))
        .map((f) => f.id);
      if (doomed.length > 0) {
        const rawS = localStorage.getItem(LS_KEYS.subscriptions);
        if (rawS) {
          const subs = JSON.parse(rawS) as Subscription[];
          const fixed = subs.map((s) => (doomed.includes(s.formulaId) ? { ...s, formulaId: 'F1' } : s));
          try { localStorage.setItem(LS_KEYS.subscriptions, JSON.stringify(fixed)); } catch { /* ignore */ }
        }
        try { localStorage.setItem(LS_KEYS.formulas, JSON.stringify(list.filter((f) => !doomed.includes(f.id)))); } catch { /* ignore */ }
      }
    }
    try { localStorage.setItem(LEGACY_CLEANUP_FLAG, '1'); } catch { /* ignore */ }
  } catch { /* stockage indisponible */ }
}

export function RestoProvider({ children }: { children: ReactNode }) {
  // Converge le site unique + purge l'ancienne formule avant tout chargement d'état
  cleanupSingleSite();
  cleanupLegacyFormulas();
  const [establishments, setEstablishments] = useState<Establishment[]>(() =>
    load(LS_KEYS.establishments, DEFAULT_ESTABLISHMENTS),
  );
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() =>
    load<Subscription[]>(LS_KEYS.subscriptions, [
      {
        id: 'S-DEMO-CLIENT',
        clientUsername: 'client',
        formulaId: 'F1',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: 'active',
        mealsRemaining: 4,
        qrToken: getClientQrToken('client'),
      },
    ]),
  );
  const [formulas, setFormulas] = useState<Formula[]>(() => {
    const stored = load(LS_KEYS.formulas, DEFAULT_FORMULAS);
    try {
      // Migration tarifs flyer 2026 : une seule fois, conserve les formules du Caissier
      if (!localStorage.getItem(TARIFF_MIGRATION_FLAG)) {
        const migrated = applyOfficialTariffs(stored);
        try { localStorage.setItem(TARIFF_MIGRATION_FLAG, '1'); } catch { /* ignore */ }
        return migrated;
      }
    } catch { /* stockage indisponible */ }
    return stored;
  });
  const [payments, setPayments] = useState<ORestoPayment[]>(() => load(LS_KEYS.payments, []));
  const [validations, setValidations] = useState<MealValidation[]>(() => load(LS_KEYS.validations, []));
  const [childrenList, setChildrenList] = useState<Child[]>(() => {
    const stored = load<Child[]>(LS_KEYS.children, []);
    // Migration cycles : les enfants déjà inscrits héritent de leur cycle via leur classe
    let changed = false;
    const migrated = stored.map((c) => {
      if (!c.cycle) {
        changed = true;
        return { ...c, cycle: inferCycleFromClass(c.className ?? '') };
      }
      return c;
    });
    if (changed) {
      try { localStorage.setItem(LS_KEYS.children, JSON.stringify(migrated)); } catch { /* ignore */ }
    }
    return migrated;
  });
  const [wallets, setWallets] = useState<Wallet[]>(() => load<Wallet[]>(LS_KEYS.wallets, []));
  const [parentProfiles, setParentProfiles] = useState<ParentProfile[]>(() =>
    load<ParentProfile[]>(LS_KEYS.parentProfiles, []),
  );
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>(() => load<WalletTx[]>(LS_KEYS.walletTxs, []));
  const [financeSettings, setFinanceSettingsState] = useState<FinanceSettings>(() => ({
    ...DEFAULT_FINANCE_SETTINGS,
    ...load<Partial<FinanceSettings>>(LS_KEYS.financeSettings, {}),
  }));
  const [financeExpenses, setFinanceExpenses] = useState<FinanceExpense[]>(() =>
    load<FinanceExpense[]>(LS_KEYS.financeExpenses, []),
  );
  const [weeklyMenus, setWeeklyMenus] = useState<WeeklyMenu[]>(() => {
    // Migration douce : les menus enregistrés avant la composition (sans items) sont normalisés.
    // Première installation (rien en local) : semaine de référence validée.
    if (!hasStoredWeek()) return referenceWeek();
    return load<WeeklyMenu[]>(LS_KEYS.weeklyMenus, DEFAULT_WEEKLY_MENUS).map((m) => ({
      ...m,
      items: Array.isArray((m as Partial<WeeklyMenu>).items) ? (m as WeeklyMenu).items : [],
    }));
  });
  const [walkInTickets, setWalkInTickets] = useState<{ token: string; reference: string; menuName: string; menuDay: string; price: number; items: WeeklyMenuItem[]; method: string; status: string; createdAt: string }[]>([]);

  useEffect(() => save(LS_KEYS.establishments, establishments), [establishments]);
  useEffect(() => save(LS_KEYS.formulas, formulas), [formulas]);
  useEffect(() => save(LS_KEYS.subscriptions, subscriptions), [subscriptions]);
  useEffect(() => save(LS_KEYS.payments, payments), [payments]);
  useEffect(() => save(LS_KEYS.validations, validations), [validations]);
  useEffect(() => save(LS_KEYS.children, childrenList), [childrenList]);
  useEffect(() => save(LS_KEYS.wallets, wallets), [wallets]);
  useEffect(() => save(LS_KEYS.parentProfiles, parentProfiles), [parentProfiles]);
  useEffect(() => save(LS_KEYS.walletTxs, walletTxs), [walletTxs]);
  useEffect(() => save(LS_KEYS.financeSettings, financeSettings), [financeSettings]);
  useEffect(() => save(LS_KEYS.financeExpenses, financeExpenses), [financeExpenses]);
  useEffect(() => save(LS_KEYS.weeklyMenus, weeklyMenus), [weeklyMenus]);

  // Full Supabase : chargement initial distant (puis localStorage en repli),
  // + synchronisation best-effort vers Supabase.
  // Tables requises : establishments, formulas, subscriptions, oresto_payments, validations
  // (+ supabase-oresto-full.sql pour formulas.kind et intentions ticket).
  useEffect(() => {
    (async () => {
      try {
        const [estRes, formRes, subRes, payRes, valRes, childRes, walletRes, txRes, setRes, expRes, weekRes, profRes] = await Promise.all([
          supabase.from('establishments').select('*'),
          supabase.from('formulas').select('*'),
          supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('oresto_payments').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('validations').select('*').order('validated_at', { ascending: false }).limit(500),
          supabase.from('children').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('wallets').select('*').limit(500),
          supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('finance_settings').select('*'),
          supabase.from('finance_expenses').select('*').order('spent_at', { ascending: false }).limit(500),
          supabase.from('weekly_menus').select('*'),
          supabase.from('parent_profiles').select('*').limit(500),
        ]);
        if (estRes.data && estRes.data.length > 0) {
          setEstablishments(
            estRes.data.map((r) => ({
              id: r.id, name: r.name, address: r.address ?? undefined,
              manager: r.manager ?? undefined, phone: r.phone ?? undefined,
            })),
          );
        }
        // Anciennes formules perso « Midi Semaine » : écartées de l'état local
        // (rattachées à F1), la base distante est réparée par healRemoteCatalog().
        const droppedRemoteIds = (formRes.data ?? [])
          .filter((r) => !OFFICIAL_TARIFFS_2026[r.id] && /midi\s*semaine/i.test(r.name ?? ''))
          .map((r) => r.id as string);
        if (formRes.data && formRes.data.length > 0) {
          // Tolérant aux schémas anciens (sans kind/old_price) : les valeurs
          // officielles comblent les trous, sans écraser les prix du Caissier.
          const mapped = formRes.data.map((r) => {
            const official = OFFICIAL_TARIFFS_2026[r.id];
            const kind = r.kind === 'ticket' || r.kind === 'subscription' ? r.kind : official?.kind ?? 'subscription';
            return {
              id: r.id as string,
              name: (r.name as string) ?? official?.name ?? r.id as string,
              description: (r.description as string) ?? official?.description ?? '',
              price: Number(r.price),
              oldPrice: r.old_price != null ? Number(r.old_price) : official?.oldPrice,
              durationDays: Number(r.duration_days ?? official?.durationDays ?? 30),
              mealsIncluded: Number(r.meals_included ?? official?.mealsIncluded ?? 1),
              rules: (r.rules as string) ?? official?.rules,
              kind,
            };
          });
          setFormulas(mapped.filter((f) => !droppedRemoteIds.includes(f.id)));
        }
        if (subRes.data && subRes.data.length > 0) {
          setSubscriptions(
            subRes.data.map((r) => ({
              id: r.id, clientUsername: r.client_username,
              formulaId: droppedRemoteIds.includes(r.formula_id) ? 'F1' : r.formula_id,
              startDate: r.start_date, endDate: r.end_date, status: r.status,
              mealsRemaining: r.meals_remaining, qrToken: r.qr_token,
              childId: r.child_id ?? undefined,
            })),
          );
        }
        if (payRes.data && payRes.data.length > 0) {
          setPayments(
            payRes.data.map((r) => ({
              id: r.id, subscriptionId: r.subscription_id ?? undefined,
              clientUsername: r.client_username ?? undefined, formulaId: r.formula_id ?? undefined,
              amount: Number(r.amount), method: r.method, status: r.status,
              reference: r.reference, createdAt: r.created_at,
            })),
          );
        }
        if (valRes.data && valRes.data.length > 0) {
          setValidations(
            valRes.data.map((r) => ({
              id: r.id, qrToken: r.qr_token, clientUsername: r.client_username,
              establishmentId: r.establishment_id, validatedAt: r.validated_at,
              status: r.status, reason: r.reason ?? undefined,
              childId: r.child_id ?? undefined,
            })),
          );
        }
        if (childRes.data && childRes.data.length > 0) {
          setChildrenList(
            childRes.data.map((r) => ({
              id: r.id, parentUsername: r.parent_username, firstName: r.first_name,
              lastName: r.last_name, className: r.class_name,
              cycle: (r.cycle === 'lycee' ? 'lycee' : r.cycle === 'primaire' ? 'primaire' : inferCycleFromClass(r.class_name ?? '')) as SchoolCycle,
              qrToken: r.qr_token,
              createdAt: r.created_at,
            })),
          );
        }
        if (walletRes.data && walletRes.data.length > 0) {
          setWallets(
            walletRes.data.map((r) => ({ childId: r.child_id, balance: Number(r.balance), updatedAt: r.updated_at })),
          );
        }
        if (txRes.data && txRes.data.length > 0) {
          setWalletTxs(
            txRes.data.map((r) => ({
              id: r.id, childId: r.child_id, kind: r.kind, amount: Number(r.amount),
              method: r.method, status: r.status, reference: r.reference,
              paymentId: r.payment_id ?? undefined, label: r.label ?? undefined,
              createdAt: r.created_at,
            })),
          );
        }
        if (setRes.data && setRes.data.length > 0) {
          const map = Object.fromEntries(setRes.data.map((r) => [r.key, r.value]));
          setFinanceSettingsState((prev) => {
            const migrated = { ...prev } as Record<string, unknown> & FinanceSettings;
            // Migration depuis l'ancien schéma (ism_sales_pct → nouvelles clés 2026)
            delete migrated.ismSalesPct;
            const next: FinanceSettings = {
              ismSubscriptionPct: Number(map.ism_subscription_pct ?? migrated.ismSubscriptionPct ?? 10) || 0,
              schoolPerSubscription: Number(map.school_per_subscription ?? migrated.schoolPerSubscription ?? 2000) || 0,
              otherSalesPct: Number(map.other_sales_pct ?? migrated.otherSalesPct ?? 5) || 0,
              touchpointPct: Number(map.touchpoint_pct ?? migrated.touchpointPct ?? 0.5) || 0,
              paydounyaPct: Number(map.paydounya_pct ?? migrated.paydounyaPct ?? 1.5) || 0,
              ismPerSubscription: Number(map.ism_per_subscription ?? (migrated as FinanceSettings).ismPerSubscription ?? 2000) || 0,
              ismSalesPct: Number(map.ism_sales_pct ?? (migrated as FinanceSettings).ismSalesPct ?? 5) || 0,
            };
            return next;
          });
        }
        if (expRes.data && expRes.data.length > 0) {
          setFinanceExpenses(
            expRes.data.map((r) => ({
              id: r.id, label: r.label, category: r.category,
              amount: Number(r.amount), spentAt: r.spent_at,
              createdBy: r.created_by ?? undefined,
            })),
          );
        }
        if (weekRes.data && weekRes.data.length > 0) {
          const byDay = new Map(weekRes.data.map((r) => [r.day, r]));
          const cleanItems = (raw: unknown): WeeklyMenuItem[] => {
            if (!Array.isArray(raw)) return [];
            return raw
              .filter((it): it is WeeklyMenuItem =>
                !!it && typeof (it as WeeklyMenuItem).name === 'string')
              .map((it) => ({ name: (it as WeeklyMenuItem).name.trim().slice(0, 60), price: Math.max(0, Math.floor(Number((it as WeeklyMenuItem).price) || 0)) }));
          };
          const remote = WEEK_DAYS.map((d) => {
            const r = byDay.get(d);
            return r
              ? { day: d, name: r.name ?? '', description: r.description ?? '', items: cleanItems((r as { items?: unknown }).items), price: Math.max(0, Math.floor(Number((r as { price?: unknown }).price) || 0)) }
              : { day: d, name: '', description: '', items: [] as WeeklyMenuItem[], price: 0 };
          });
          // La base distante est la vérité quand le Personnel a publié ;
          // sinon (première installation) on présente la semaine de référence.
          if (remote.some((m) => m.items.length > 0)) {
            setWeeklyMenus(remote);
          } else if (!hasStoredWeek()) {
            setWeeklyMenus(referenceWeek());
          }
        }
        if (profRes.data && profRes.data.length > 0) {
          setParentProfiles(
            profRes.data.map((r) => ({
              parentUsername: r.parent_username, firstName: r.first_name,
              lastName: r.last_name, phone: r.phone ?? '', updatedAt: r.updated_at,
            })),
          );
        }
      } catch {
        /* offline : le localStorage reste la source de vérité */
      }
    })();
  }, []);

  // Répare la base distante : site unique ISM Thiès, tarifs officiels 2026
  // et suppression de l'ancienne « Midi Semaine ». Best-effort.
  useEffect(() => {
    (async () => {
      try {
        if (localStorage.getItem('o-resto-remote-heal-2026d')) return;
        const fullRows = Object.values(OFFICIAL_TARIFFS_2026).map((f) => ({
          id: f.id, name: f.name, description: f.description, price: f.price,
          old_price: f.oldPrice ?? null, duration_days: f.durationDays,
          meals_included: f.mealsIncluded, rules: f.rules ?? null, kind: f.kind,
        }));
        const res = await supabase.from('formulas').upsert(fullRows);
        if (res.error) {
          // Schéma ancien (sans kind/old_price) : mise à jour minimale (sans abandonner la suite)
          for (const f of Object.values(OFFICIAL_TARIFFS_2026)) {
            const r = await supabase.from('formulas').update({
              name: f.name, description: f.description, price: f.price,
              duration_days: f.durationDays, meals_included: f.mealsIncluded, rules: f.rules ?? null,
            }).eq('id', f.id);
            if (r.error) break;
          }
        }
        const found = await supabase.from('formulas').select('id').ilike('name', '%midi%semaine%');
        if (!found.error) {
          const ids = (found.data ?? []).map((r) => r.id as string).filter((id) => !OFFICIAL_TARIFFS_2026[id]);
          if (ids.length > 0) {
            await supabase.from('subscriptions').update({ formula_id: 'F1' }).in('formula_id', ids);
            await supabase.from('formulas').delete().in('id', ids);
          }
        }
        // Site unique ISM Thiès : crée le site, rattache les validations, retire E1/E2
        const siteUp = await supabase.from('establishments').upsert({
          id: ISM_SITE.id, name: ISM_SITE.name, address: ISM_SITE.address, manager: ISM_SITE.manager,
        });
        if (!siteUp.error) {
          await supabase.from('validations').update({ establishment_id: ISM_SITE.id }).neq('establishment_id', ISM_SITE.id);
          await supabase.from('establishments').delete().in('id', ['E1', 'E2']);
          setEstablishments([{ ...ISM_SITE }]);
        }
        try { localStorage.setItem('o-resto-remote-heal-2026d', '1'); } catch { /* ignore */ }
        // Ré-applique les tarifs officiels sur l'état local (au cas où le
        // chargement distant aurait précédé la réparation).
        setFormulas((prev) => applyOfficialTariffs(prev));
      } catch { /* ignore */ }
    })();
  }, []);

  // Synchronisation best-effort vers Supabase (tables créées par supabase-oresto-migration.sql)
  useEffect(() => {
    (async () => {
      try {
        await supabase.from('establishments').upsert(
          establishments.map((e) => ({ id: e.id, name: e.name, address: e.address ?? null, manager: e.manager ?? null, phone: e.phone ?? null })),
        );
      } catch {
        /* offline ou tables non migrées : le localStorage reste la source de vérité */
      }
    })();
  }, [establishments]);

  const mySubscription = useCallback(
    (username: string) => {
      const nowMs = Date.now();
      return subscriptions.find(
        (s) => s.clientUsername === username && s.status === 'active' && new Date(s.endDate).getTime() >= nowMs,
      );
    },
    [subscriptions],
  );

  const mySubscriptions = useCallback(
    (username: string) => subscriptions.filter((s) => s.clientUsername === username),
    [subscriptions],
  );

  const myPayments = useCallback(
    (username: string) => {
      const ids = new Set(subscriptions.filter((s) => s.clientUsername === username).map((s) => s.id));
      return payments.filter(
        (p) => (p.subscriptionId && ids.has(p.subscriptionId)) || p.clientUsername === username,
      );
    },
    [subscriptions, payments],
  );

  const myValidations = useCallback(
    (username: string) => validations.filter((v) => v.clientUsername === username),
    [validations],
  );

  // Réserve une formule : crée un abonnement "en attente" (QR parent ou QR enfant si childId)
  const subscribe = useCallback(
    (clientUsername: string, formulaId: string, childId?: string) => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      const now = new Date();
      const child = childId ? childrenList.find((c) => c.id === childId) : undefined;
      const subscription: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
        status: 'pending',
        mealsRemaining: formula.mealsIncluded,
        qrToken: child ? child.qrToken : getClientQrToken(clientUsername),
        childId: child?.id,
      };
      setSubscriptions((prev) => [...prev, subscription]);
      supabase.from('subscriptions').insert({
        id: subscription.id,
        client_username: subscription.clientUsername,
        formula_id: subscription.formulaId,
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        status: subscription.status,
        meals_remaining: subscription.mealsRemaining,
        qr_token: subscription.qrToken,
        child_id: subscription.childId ?? null,
      }).then(() => undefined, () => undefined);
      return subscription;
    },
    [formulas, childrenList],
  );

  // Activation interne idempotente : n'écrase jamais un actif existant,
  // préserve les crédits tickets (max), n'expire les autres qu'en transition.
  const activateSubscription = useCallback(
    (subscriptionId: string) => {
      const target = subscriptions.find((s) => s.id === subscriptionId);
      if (!target) return;
      if (target.status === 'active') return; // déjà actif → ne pas écraser le solde
      const formula = formulas.find((f) => f.id === target.formulaId);
      if (!formula) return;
      const now = new Date();
      const endDate = new Date(now.getTime() + formula.durationDays * 86400000).toISOString();
      const startDate = now.toISOString();
      setSubscriptions((prev) =>
        prev.map((s) => {
          if (s.id === subscriptionId) {
            return {
              ...s,
              status: 'active' as const,
              mealsRemaining: Math.max(s.mealsRemaining, formula.mealsIncluded),
              startDate,
              endDate,
            };
          }
          // Un seul actif par bénéficiaire (enfant si childId, sinon compte parent)
          const sameOwner = target.childId
            ? s.childId === target.childId
            : !s.childId && s.clientUsername === target.clientUsername;
          if (sameOwner && s.status === 'active') {
            return { ...s, status: 'expired' as const };
          }
          return s;
        }),
      );
      supabase.from('subscriptions').update({
        status: 'active',
        meals_remaining: Math.max(target.mealsRemaining, formula.mealsIncluded),
        start_date: startDate,
        end_date: endDate,
      }).eq('id', subscriptionId).then(() => undefined, () => undefined);
    },
    [formulas, subscriptions],
  );

  // Tout mode non-espèces = confirmation externe (Wave/OM/carte), jamais immédiat.
  // 'balance' (solde carte) : interne, activation immédiate, jamais de confirmation externe.
  const needsExternalConfirm = (method: ORestoPaymentMethod) => method !== 'cash' && method !== 'balance';

  // Paiement d'un abonnement en attente (avec déduplication).
  // Espèces → pending (encaissement au comptoir par le Caissier).
  // Wave/OM/carte → demande pending à confirmer (manuelle ou code Wave).
  // 'balance' REFUSÉ : un abonnement ne se paie jamais avec la carte
  // (la carte sert aux tickets repas). InTouch / espèces uniquement.
  const paySubscription = useCallback(
    (subscriptionId: string, method: ORestoPaymentMethod, subOverride?: Subscription) => {
      if (method === 'balance') {
        throw new Error('Abonnement : paiement par carte impossible — payez via InTouch ou en espèces. La carte sert aux tickets repas.');
      }
      // subOverride : objet frais retourné par subscribe() — permet d'enchaîner
      // subscribe() + paySubscription() dans le même handler (state pas encore à jour).
      const sub = subscriptions.find((s) => s.id === subscriptionId) ?? subOverride;
      if (!sub) throw new Error('Abonnement introuvable');
      if (sub.status === 'cancelled') throw new Error('Abonnement annulé');
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula) throw new Error('Formule inconnue');
      // Déduplication : réutiliser le pending existant même méthode
      const existingPending = payments.find(
        (p) => p.subscriptionId === subscriptionId && p.status === 'pending' && p.method === method,
      );
      if (existingPending) {
        if (isMobileMethod(method)) {
          const wave = initiateWavePayment(formula.price, method, existingPending.reference);
          return { payment: existingPending, activated: false, wave };
        }
        return { payment: existingPending, activated: false };
      }
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId: sub.id,
        amount: formula.price,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        client_username: sub.clientUsername,
        formula_id: sub.formulaId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      if (!needsExternalConfirm(method)) return { payment, activated: false };
      if (isMobileMethod(method)) {
        const wave = initiateWavePayment(formula.price, method, reference);
        return { payment, activated: false, wave };
      }
      return { payment, activated: false };
    },
    [formulas, subscriptions, payments],
  );

  // Règle carte : un abonnement ne se paie JAMAIS avec le solde prépayé
  // (InTouch / espèces / Wave uniquement). La carte sert aux tickets repas.

  // Crédite les repas d'un ticket (abonnement actif existant ou mini-abonnement ticket)
  const creditTicketMeals = useCallback(
    (clientUsername: string, formulaId: string): { added: number; subscriptionId: string | undefined } => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) return { added: 0, subscriptionId: undefined };
      const now = new Date();
      const existing = subscriptions.find((s) => s.clientUsername === clientUsername && s.status === 'active');
      if (existing) {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === existing.id ? { ...s, mealsRemaining: s.mealsRemaining + formula.mealsIncluded } : s)),
        );
        supabase.from('subscriptions').update({
          meals_remaining: existing.mealsRemaining + formula.mealsIncluded,
        }).eq('id', existing.id).then(() => undefined, () => undefined);
        return { added: formula.mealsIncluded, subscriptionId: existing.id };
      }
      const ticket: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
        status: 'active',
        mealsRemaining: formula.mealsIncluded,
        qrToken: getClientQrToken(clientUsername),
      };
      setSubscriptions((prev) => [...prev, ticket]);
      supabase.from('subscriptions').insert({
        id: ticket.id,
        client_username: ticket.clientUsername,
        formula_id: ticket.formulaId,
        start_date: ticket.startDate,
        end_date: ticket.endDate,
        status: ticket.status,
        meals_remaining: ticket.mealsRemaining,
        qr_token: ticket.qrToken,
      }).then(() => undefined, () => undefined);
      return { added: formula.mealsIncluded, subscriptionId: ticket.id };
    },
    [formulas, subscriptions],
  );

  // Client : reprend un paiement mobile en attente (instructions + code actualisés).
  const resumeMobilePayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending' || !isMobileMethod(payment.method)) return null;
      return initiateWavePayment(payment.amount, payment.method, payment.reference);
    },
    [payments],
  );

  // Client : confirme son paiement Wave avec le code à 6 chiffres (+ TTL 15 min).
  const confirmMobilePayment = useCallback(
    (paymentId: string, code: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment) return { ok: false, message: 'Paiement introuvable.' };
      if (payment.status === 'paid') return { ok: true, message: 'Paiement déjà confirmé.' };
      if (payment.status !== 'pending') return { ok: false, message: 'Ce paiement ne peut plus être confirmé.' };
      if (!isMobileMethod(payment.method)) {
        return { ok: false, message: 'Ce moyen se confirme au comptoir (coche manuelle du caissier).' };
      }
      // Expiration 15 min de la demande (wave.ts)
      const created = new Date(payment.createdAt).getTime();
      if (Number.isFinite(created) && Date.now() - created > WAVE_TTL_MS) {
        setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'failed' as const } : p)));
        supabase.from('oresto_payments').update({ status: 'failed' }).eq('id', paymentId).then(() => undefined, () => undefined);
        return { ok: false, message: 'Demande expirée (15 min). Relancez le paiement.' };
      }
      if (!checkWaveCode(payment.reference, code)) {
        return { ok: false, message: 'Code incorrect : vérifiez le code à 6 chiffres reçu après votre envoi.' };
      }
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId).then(() => undefined, () => undefined);
      clearWaveCode(payment.reference);
      // Discriminant : abonnement d'abord (subscriptionId), ticket ensuite.
      if (payment.subscriptionId) {
        activateSubscription(payment.subscriptionId);
        return { ok: true, message: 'Paiement confirmé : votre carte est ACTIVE. Présentez votre QR Code.' };
      }
      // Intention ticket en attente (local puis colonnes persistées)
      const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
      const intent = intents[paymentId]
        ?? (payment.clientUsername && payment.formulaId
          ? { username: payment.clientUsername, formulaId: payment.formulaId }
          : undefined);
      if (intent) {
        const { added } = creditTicketMeals(intent.username, intent.formulaId);
        const next = { ...intents };
        delete next[paymentId];
        save(LS_KEYS.ticketIntents, next);
        return { ok: true, message: `Paiement confirmé : ${added} repas crédité(s). Présentez votre QR Code.` };
      }
      return { ok: true, message: 'Paiement confirmé.' };
    },
    [payments, activateSubscription, creditTicketMeals],
  );

  // Staff : encaisse les espèces → paiement soldé + abonnement activé.
  // N'accepte que cash avec subscriptionId (tickets Wave/OM/carte → coche manuelle).
  const confirmCashPayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending' || !payment.subscriptionId) return false;
      if (payment.method !== 'cash') return false;
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId).then(() => undefined, () => undefined);
      activateSubscription(payment.subscriptionId);
      return true;
    },
    [payments, activateSubscription],
  );

  // Encaissement comptant en une passe (sans pending stale) : crée un paiement
  // soldé + active l'abonnement. Utilisé par le back-office et le comptoir.
  const collectCashPayment = useCallback(
    (subscriptionId: string) => {
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub || sub.status !== 'pending') return null;
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula) return null;
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'), subscriptionId: sub.id, amount: formula.price,
        method: 'cash', status: 'paid', reference, createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id, subscription_id: payment.subscriptionId, client_username: sub.clientUsername,
        formula_id: sub.formulaId, amount: payment.amount, method: 'cash',
        status: 'paid', reference: payment.reference,
      }).then(() => undefined, () => undefined);
      const startDate = now.toISOString();
      const endDate = new Date(now.getTime() + formula.durationDays * 86400000).toISOString();
      setSubscriptions((prev) => prev.map((s) => {
        if (s.id === subscriptionId) {
          return { ...s, status: 'active' as const, mealsRemaining: Math.max(s.mealsRemaining, formula.mealsIncluded), startDate, endDate };
        }
        const sameOwner = sub.childId
          ? s.childId === sub.childId
          : !s.childId && s.clientUsername === sub.clientUsername;
        if (sameOwner && s.status === 'active') return { ...s, status: 'expired' as const };
        return s;
      }));
      supabase.from('subscriptions').update({
        status: 'active', meals_remaining: formula.mealsIncluded, start_date: startDate, end_date: endDate,
      }).eq('id', subscriptionId).then(() => undefined, () => undefined);
      return payment;
    },
    [subscriptions, formulas],
  );

  // Staff (Caissier) : confirme la réception d'un paiement EXTERNE (Wave/OM/espèces/carte).
  // Coche manuelle : le caissier vérifie sur son téléphone Wave puis coche.
  // → paiement soldé + abonnement activé ou repas ticket crédités.
  const confirmManualPayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending') return false;
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId).then(() => undefined, () => undefined);
      if (payment.reference) clearWaveCode(payment.reference);
      // Abonnement d'abord, ticket ensuite (évite de transformer un abo en crédit)
      if (payment.subscriptionId) {
        activateSubscription(payment.subscriptionId);
        const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
        if (intents[paymentId]) {
          const next = { ...intents };
          delete next[paymentId];
          save(LS_KEYS.ticketIntents, next);
        }
        return true;
      }
      const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
      const intent = intents[paymentId]
        ?? (payment.clientUsername && payment.formulaId
          ? { username: payment.clientUsername, formulaId: payment.formulaId }
          : undefined);
      if (intent) {
        creditTicketMeals(intent.username, intent.formulaId);
        const next = { ...intents };
        delete next[paymentId];
        save(LS_KEYS.ticketIntents, next);
        return true;
      }
      return true;
    },
    [payments, activateSubscription, creditTicketMeals],
  );

  // Annulation d'une réservation en attente (+ paiements en attente, tickets inclus)
  const cancelSubscription = useCallback(
    (subscriptionId: string) => {
      const target = subscriptions.find((s) => s.id === subscriptionId);
      setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId && s.status === 'pending' ? { ...s, status: 'cancelled' as const } : s)));
      setPayments((prev) => prev.map((p) => (p.subscriptionId === subscriptionId && p.status === 'pending' ? { ...p, status: 'cancelled' as const } : p)));
      supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId).then(() => undefined, () => undefined);
      supabase.from('oresto_payments').update({ status: 'cancelled' }).eq('subscription_id', subscriptionId).then(() => undefined, () => undefined);
      if (target) {
        // Annule aussi les tickets externes en attente du même client/formule + nettoie intents/codes
        supabase.from('oresto_payments').update({ status: 'cancelled' })
          .eq('client_username', target.clientUsername).eq('formula_id', target.formulaId).eq('status', 'pending')
          .then(() => undefined, () => undefined);
        setPayments((prev) => prev.map((p) =>
          p.status === 'pending' && !p.subscriptionId && p.clientUsername === target.clientUsername && p.formulaId === target.formulaId
            ? { ...p, status: 'cancelled' as const } : p));
        const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
        const next = Object.fromEntries(
          Object.entries(intents).filter(([, v]) => !(v.username === target.clientUsername && v.formulaId === target.formulaId)),
        );
        save(LS_KEYS.ticketIntents, next);
      }
    },
    [subscriptions],
  );

  const renewSubscription = useCallback(    (subscriptionId: string, method: ORestoPaymentMethod) => {
      // Renouvellement = nouvel abonnement : jamais payé avec la carte.
      if (method === 'balance') return null;
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) return null;
      // Garde : on ne renouvelle qu'un actif/expiré (pas pending/cancelled)
      if (sub.status === 'pending' || sub.status === 'cancelled') return null;
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula) return null;
      // Déduplication : pending existant même méthode
      const existingPending = payments.find(
        (p) => p.subscriptionId === subscriptionId && p.status === 'pending' && p.method === method,
      );
      if (existingPending) {
        if (isMobileMethod(method)) {
          const wave = initiateWavePayment(formula.price, method, existingPending.reference);
          return { payment: existingPending, wave };
        }
        return { payment: existingPending };
      }
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId: sub.id,
        amount: formula.price,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        client_username: sub.clientUsername,
        formula_id: sub.formulaId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      // Espèces : le Caissier encaisse au comptoir (Abonnés & paiements).
      // Wave : code à 6 chiffres. OM/carte : coche manuelle (pas de code).
      if (!needsExternalConfirm(method)) return { payment };
      if (isMobileMethod(method)) {
        const wave = initiateWavePayment(formula.price, method, reference);
        return { payment, wave };
      }
      return { payment };
    },
    [subscriptions, formulas, payments],
  );

  // Achat d'un ticket repas (menu de la semaine) : crédite des repas SANS résilier
  // l'abonnement actif ; crée un mini-abonnement ticket s'il n'y en a aucun.
  // Espèces → crédit immédiat (vente comptoir). Wave/OM/carte → pending externe à confirmer.
  // Solde ('balance' + childId) → débit immédiat de la carte prépayée de l'enfant,
  // UNIQUEMENT pour les formules 'ticket' (un abonnement ne se paie jamais avec la carte).
  const buyTicket = useCallback(
    (clientUsername: string, formulaId: string, method: ORestoPaymentMethod, childId?: string) => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      if (method === 'balance' && formula.kind !== 'ticket') {
        throw new Error('Abonnement : paiement par carte impossible — payez via InTouch ou en espèces. La carte sert aux tickets repas.');
      }
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      if (method === 'balance') {
        if (!childId) throw new Error('Choisissez la carte à débiter');
        const child = childrenList.find((c) => c.id === childId);
        if (!child) throw new Error('Enfant introuvable');
        const balance = wallets.find((w) => w.childId === childId)?.balance ?? 0;
        if (balance < formula.price) {
          throw new Error(`Solde insuffisant : ${balance} FCFA sur la carte de ${child.firstName}, ticket ${formula.price} FCFA. Rechargez la carte.`);
        }
        const rand = Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase();
        const tx: WalletTx = {
          id: uid('W'), childId, kind: 'debit', amount: formula.price,
          method: 'card', status: 'paid',
          reference: `TCK-${Date.now().toString(36).toUpperCase()}${rand}`,
          label: `Ticket ${formula.name} — carte prépayée`,
          createdAt: now.toISOString(),
        };
        const { added: addedMeals, subscriptionId } = creditTicketMeals(clientUsername, formulaId);
        const payment: ORestoPayment = {
          id: uid('P'), subscriptionId,
          clientUsername, formulaId,
          amount: formula.price, method: 'balance',
          status: 'paid', reference,
          createdAt: now.toISOString(),
        };
        const nextBalance = balance - formula.price;
        setWalletTxs((prev) => [...prev, tx]);
        setWallets((prev) => prev.map((w) => (w.childId === childId ? { ...w, balance: w.balance - formula.price } : w)));
        setPayments((prev) => [...prev, payment]);
        supabase.from('wallet_transactions').insert({
          id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
          method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
        }).then(() => undefined, () => undefined);
        supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
          .then(() => undefined, () => undefined);
        supabase.from('oresto_payments').insert({
          id: payment.id, subscription_id: payment.subscriptionId,
          client_username: clientUsername, formula_id: formulaId,
          amount: payment.amount, method: payment.method, status: payment.status,
          reference: payment.reference,
        }).then(() => undefined, () => undefined);
        return { payment, addedMeals };
      }
      if (needsExternalConfirm(method)) {
        const payment: ORestoPayment = {
          id: uid('P'),
          clientUsername,
          formulaId,
          amount: formula.price,
          method,
          status: 'pending',
          reference,
          createdAt: now.toISOString(),
        };
        setPayments((prev) => [...prev, payment]);
        supabase.from('oresto_payments').insert({
          id: payment.id,
          subscription_id: null,
          client_username: clientUsername,
          formula_id: formulaId,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
          reference: payment.reference,
        }).then(() => undefined, () => undefined);
        const intents = load<Record<string, { username: string; formulaId: string }>>(LS_KEYS.ticketIntents, {});
        save(LS_KEYS.ticketIntents, { ...intents, [payment.id]: { username: clientUsername, formulaId } });
        if (isMobileMethod(method)) {
          const wave = initiateWavePayment(formula.price, method, reference);
          return { payment, addedMeals: 0, wave };
        }
        return { payment, addedMeals: 0 };
      }
      const { added: addedMeals, subscriptionId } = creditTicketMeals(clientUsername, formulaId);
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId,
        amount: formula.price,
        method,
        status: 'paid',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        client_username: clientUsername,
        formula_id: formulaId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      return { payment, addedMeals };
    },
    [formulas, creditTicketMeals, childrenList, wallets],
  );

  // Menu du jour payé par la carte prépayée : débit du total + 1 repas crédité
  // (ajouté à l'abonnement actif de l'enfant, sinon pass 1 jour créé).
  // Lève une Error si solde insuffisant — message affichable tel quel.
  const buyDayMenu = useCallback(
    (clientUsername: string, childId: string, day: string, total: number) => {
      const child = childrenList.find((c) => c.id === childId);
      if (!child) throw new Error('Enfant introuvable');
      if (!Number.isFinite(total) || total <= 0) throw new Error('Menu indisponible');
      const balance = wallets.find((w) => w.childId === childId)?.balance ?? 0;
      if (balance < total) {
        throw new Error(`Solde insuffisant : ${balance} FCFA sur la carte de ${child.firstName}, menu ${total} FCFA. Rechargez la carte.`);
      }
      const now = new Date();
      const rand = Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase();
      const tx: WalletTx = {
        id: uid('W'), childId, kind: 'debit', amount: total,
        method: 'card', status: 'paid',
        reference: `MENU-${Date.now().toString(36).toUpperCase()}${rand}`,
        label: `Menu ${day} — carte prépayée`,
        createdAt: now.toISOString(),
      };
      const nowTs = now.getTime();
      const active = subscriptions.find(
        (s) => s.childId === childId && s.status === 'active' && new Date(s.endDate).getTime() >= nowTs,
      );
      let subscriptionId: string;
      if (active) {
        subscriptionId = active.id;
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === active.id ? { ...s, mealsRemaining: s.mealsRemaining + 1 } : s)),
        );
        supabase.from('subscriptions').update({
          meals_remaining: active.mealsRemaining + 1,
        }).eq('id', active.id).then(() => undefined, () => undefined);
      } else {
        const pass: Subscription = {
          id: uid('S'),
          clientUsername,
          formulaId: 'T1',
          startDate: now.toISOString(),
          endDate: new Date(nowTs + 86400000).toISOString(),
          status: 'active',
          mealsRemaining: 1,
          qrToken: child.qrToken,
          childId,
        };
        subscriptionId = pass.id;
        setSubscriptions((prev) => [...prev, pass]);
        supabase.from('subscriptions').insert({
          id: pass.id,
          client_username: pass.clientUsername,
          formula_id: pass.formulaId,
          start_date: pass.startDate,
          end_date: pass.endDate,
          status: pass.status,
          meals_remaining: pass.mealsRemaining,
          qr_token: pass.qrToken,
          child_id: pass.childId ?? null,
        }).then(() => undefined, () => undefined);
      }
      const payment: ORestoPayment = {
        id: uid('P'), subscriptionId,
        clientUsername, formulaId: 'T1',
        amount: total, method: 'balance',
        status: 'paid',
        reference: `PAY-${Date.now().toString(36).toUpperCase()}${rand}`,
        createdAt: now.toISOString(),
      };
      const nextBalance = balance - total;
      setWalletTxs((prev) => [...prev, tx]);
      setWallets((prev) => prev.map((w) => (w.childId === childId ? { ...w, balance: w.balance - total } : w)));
      setPayments((prev) => [...prev, payment]);
      supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
        method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
      }).then(() => undefined, () => undefined);
      supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
        .then(() => undefined, () => undefined);
      supabase.from('oresto_payments').insert({
        id: payment.id, subscription_id: payment.subscriptionId,
        client_username: clientUsername, formula_id: payment.formulaId,
        amount: payment.amount, method: payment.method, status: payment.status,
        reference: payment.reference,
      }).then(() => undefined, () => undefined);
      return { addedMeals: 1 };
    },
    [childrenList, wallets, subscriptions],
  );

  // Kiosque Récréation & Pause : achat d'articles (snacks/boissons) payés par la carte prépayée
  // Crée une commande kiosque pour le personnel + débit immédiat du wallet enfant.
  const buyKiosk = useCallback(
    (clientUsername: string, childId: string, items: { productId: string; productName: string; price: number; qty: number }[]) => {
      const child = childrenList.find((c) => c.id === childId);
      if (!child) throw new Error('Enfant introuvable');
      if (!items.length) throw new Error('Panier vide');
      const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
      const balance = wallets.find((w) => w.childId === childId)?.balance ?? 0;
      // Solde insuffisant : on bloque le débit (impossible de passer en négatif)
      if (balance < total) {
        throw new Error(`Solde insuffisant (${balance} FCFA disponibles, ${total} FCFA requis)`);
      }
      const now = new Date();
      const rand = Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase();
      const tx: WalletTx = {
        id: uid('W'), childId, kind: 'debit', amount: total,
        method: 'card', status: 'paid',
        reference: `KIOSK-${Date.now().toString(36).toUpperCase()}${rand}`,
        label: `Kiosque récréation/pause — ${items.map(i => `${i.productName}×${i.qty}`).join(', ')}`,
        createdAt: now.toISOString(),
      };
      const orderRef = `KIOSK-${Date.now().toString(36).toUpperCase()}`;
      const kioskOrder = {
        id: `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        childId,
        parentUsername: clientUsername,
        items: items.map(it => ({ productId: it.productId, name: it.productName, price: it.price, qty: it.qty })),
        total,
        status: 'pending' as const,
        reference: orderRef,
        createdAt: now.toISOString(),
        servedAt: null,
      };
      const nextBalance = balance - total;
      setWalletTxs((prev) => [...prev, tx]);
      setWallets((prev) => prev.map((w) => (w.childId === childId ? { ...w, balance: nextBalance } : w)));
      // Persist wallet
      supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
        method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
      }).then(() => undefined, () => undefined);
      supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
        .then(() => undefined, () => undefined);
      // Persist kiosk order (best-effort)
      supabase.from('kiosk_orders').insert({
        id: kioskOrder.id,
        child_id: childId,
        parent_username: clientUsername,
        items: kioskOrder.items,
        total: kioskOrder.total,
        status: 'pending',
        reference: orderRef,
        created_at: now.toISOString(),
        served_at: null,
      }).then(() => undefined, () => undefined);
      return { order: kioskOrder, balance: nextBalance };
    },
    [childrenList, wallets],
  );

  // Créer un ticket visiteur (walk-in) pour le menu du jour — génère un QR TICKET-XXXXXX
  const createWalkInTicket = useCallback(
    (menu: WeeklyMenu, method: 'cash' | 'intouch' | 'wave') => {
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const token = `TICKET-${Date.now().toString(36).toUpperCase()}${rand}`;
      const reference = `WLK-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date();
      const ticket = {
        token,
        reference,
        menuName: menu.name || `Menu du ${menu.day}`,
        menuDay: menu.day,
        price: menu.price ?? 0,
        items: menu.items ?? [],
        method,
        status: method === 'cash' ? 'paid' : 'pending',
        createdAt: now.toISOString(),
      };
      // Stocker le ticket pour validation ultérieure
      setWalkInTickets((prev) => [...prev, ticket]);
      return { token, reference, ticket };
    },
    [],
  );

  // Vente au comptoir par le Caissier : ticket ou abonnement pour un client nommé.
  // Espèces : activation / crédit immédiats + reçu (sans passer par un pending stale).
  // Externe : demande pending à confirmer via coche manuelle.
  const counterSale = useCallback(
    (clientUsername: string, formulaId: string, method: ORestoPaymentMethod) => {
      const name = clientUsername.trim().toLowerCase();
      if (!name) throw new Error('Nom du client requis');
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      if (formula.kind === 'ticket') {
        const result = buyTicket(name, formulaId, method);
        return { ...result, activated: method === 'cash' };
      }
      if (method === 'cash') {
        // Cash comptoir : crée abo pending si besoin puis solde + active en une passe
        const pendingSub = subscriptions.find(
          (s) => s.clientUsername === name && s.formulaId === formulaId && s.status === 'pending',
        );
        const now = new Date();
        const sub: Subscription = pendingSub ?? {
          id: uid('S'),
          clientUsername: name,
          formulaId,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + formula.durationDays * 86400000).toISOString(),
          status: 'pending' as const,
          mealsRemaining: formula.mealsIncluded,
          qrToken: getClientQrToken(name),
        };
        if (!pendingSub) {
          setSubscriptions((prev) => [...prev, sub]);
          supabase.from('subscriptions').insert({
            id: sub.id, client_username: sub.clientUsername, formula_id: sub.formulaId,
            start_date: sub.startDate, end_date: sub.endDate, status: sub.status,
            meals_remaining: sub.mealsRemaining, qr_token: sub.qrToken,
          }).then(() => undefined, () => undefined);
        }
        const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
        const payment: ORestoPayment = {
          id: uid('P'), subscriptionId: sub.id, amount: formula.price,
          method, status: 'paid', reference, createdAt: now.toISOString(),
        };
        setPayments((prev) => [...prev, payment]);
        supabase.from('oresto_payments').insert({
          id: payment.id, subscription_id: payment.subscriptionId, client_username: name,
          formula_id: formulaId, amount: payment.amount, method: payment.method,
          status: 'paid', reference: payment.reference,
        }).then(() => undefined, () => undefined);
        // Activation directe (sans re-lecture stale)
        const startDate = now.toISOString();
        const endDate = new Date(now.getTime() + formula.durationDays * 86400000).toISOString();
        setSubscriptions((prev) => prev.map((s) => {
          if (s.id === sub.id) {
            return { ...s, status: 'active' as const, mealsRemaining: Math.max(s.mealsRemaining, formula.mealsIncluded), startDate, endDate };
          }
          if (s.clientUsername === name && s.status === 'active') return { ...s, status: 'expired' as const };
          return s;
        }));
        supabase.from('subscriptions').update({
          status: 'active', meals_remaining: formula.mealsIncluded, start_date: startDate, end_date: endDate,
        }).eq('id', sub.id).then(() => undefined, () => undefined);
        return { payment, addedMeals: formula.mealsIncluded, activated: true };
      }
      const pending = subscriptions.find(
        (s) => s.clientUsername === name && s.formulaId === formulaId && s.status === 'pending',
      );
      const sub = pending ?? subscribe(name, formulaId);
      const { payment, wave } = paySubscription(sub.id, method);
      return { payment, wave, addedMeals: 0, activated: false };
    },
    [formulas, subscriptions, subscribe, paySubscription, buyTicket],
  );

  const validateMeal = useCallback(
    (qrToken: string, establishmentId: string) => {
      const token = qrToken.trim().toUpperCase();
      const now = new Date();
      const fail = (message: string, clientUsername = 'inconnu', childId?: string): { ok: boolean; message: string; validation: MealValidation | null } => {
        const validation: MealValidation = {
          id: uid('V'),
          qrToken: token,
          clientUsername,
          establishmentId,
          validatedAt: now.toISOString(),
          status: 'rejected',
          reason: message,
          childId,
        };
        setValidations((prev) => [...prev, validation]);
        supabase.from('validations').insert({
          id: validation.id,
          qr_token: validation.qrToken,
          client_username: validation.clientUsername,
          establishment_id: validation.establishmentId,
          status: 'rejected',
          reason: message,
          child_id: childId ?? null,
        }).then(() => undefined, () => undefined);
        return { ok: false, message, validation };
      };

      // --- Ticket visiteur (walk-in) : QR format "TICKET-XXXXXX" ---
      if (token.startsWith('TICKET-')) {
        const ticketRef = token;
        const existing = validations.find((v) => v.qrToken === ticketRef);
        if (existing) {
          if (existing.status === 'accepted') {
            return fail('Ce ticket a déjà été servi.', existing.clientUsername);
          }
          return fail('Ticket déjà scanné (en attente).', existing.clientUsername);
        }
        // Créer validation acceptée pour ticket visiteur
        const validation: MealValidation = {
          id: uid('V'),
          qrToken: ticketRef,
          clientUsername: 'visiteur',
          establishmentId,
          validatedAt: now.toISOString(),
          status: 'accepted',
          childId: undefined,
        };
        setValidations((prev) => [...prev, validation]);
        supabase.from('validations').insert({
          id: validation.id,
          qr_token: validation.qrToken,
          client_username: validation.clientUsername,
          establishment_id: validation.establishmentId,
          status: 'accepted',
          reason: null,
          child_id: null,
        }).then(() => undefined, () => undefined);
        return { ok: true, message: 'Repas visiteur validé ✓', validation };
      }

      // QR enfant : carte prépayée (abonnement enfant d'abord, sinon débit wallet)
      const child = childrenList.find((c) => c.qrToken.toUpperCase() === token);
      if (child) {
        const childName = `${child.firstName} ${child.lastName}`;
        const nowMsChild = now.getTime();
        const liveChildSub = subscriptions.find(
          (s) => s.childId === child.id && s.status === 'active' && new Date(s.endDate).getTime() >= nowMsChild,
        );
        const formulaChild = liveChildSub ? formulas.find((f) => f.id === liveChildSub.formulaId) : undefined;
        const maxPerDayChild = 1;
        const servedChild = validations.filter(
          (v) => v.childId === child.id && v.status === 'accepted' && sameDay(new Date(v.validatedAt), now),
        ).length;
        if (servedChild >= maxPerDayChild) {
          return fail(`Quota du jour atteint pour ${childName}.`, child.parentUsername, child.id);
        }
        if (liveChildSub && liveChildSub.mealsRemaining > 0) {
          const validation: MealValidation = {
            id: uid('V'), qrToken: token, clientUsername: liveChildSub.clientUsername,
            establishmentId, validatedAt: now.toISOString(), status: 'accepted', childId: child.id,
          };
          setValidations((prev) => [...prev, validation]);
          setSubscriptions((prev) => prev.map((s) => (s.id === liveChildSub.id ? { ...s, mealsRemaining: s.mealsRemaining - 1 } : s)));
          supabase.from('subscriptions').update({ meals_remaining: liveChildSub.mealsRemaining - 1 }).eq('id', liveChildSub.id).then(() => undefined, () => undefined);
          supabase.from('validations').insert({
            id: validation.id, qr_token: token, client_username: validation.clientUsername,
            establishment_id: establishmentId, status: 'accepted', reason: null, child_id: child.id,
          }).then(() => undefined, () => undefined);
          return { ok: true, message: `Repas validé pour ${childName} (${child.className}). Repas restants : ${liveChildSub.mealsRemaining - 1}.`, validation };
        }
        // Sans abonnement : débit du prix du repas sur la carte
        const ticketPrices = formulas.filter((f) => f.kind === 'ticket').map((f) => f.price);
        const mealPrice = ticketPrices.length > 0 ? Math.min(...ticketPrices) : 500;
        const balance = wallets.find((w) => w.childId === child.id)?.balance ?? 0;
        if (balance < mealPrice) {
          return fail(`Solde insuffisant sur la carte de ${childName} (${balance} FCFA, repas ${mealPrice} FCFA). Rechargez le QR.`, child.parentUsername, child.id);
        }
        const txId = uid('W');
        const reference = `DEB-${Date.now().toString(36).toUpperCase()}`;
        const label = `Repas ${childName} (${child.className})`;
        setWalletTxs((prev) => [...prev, {
          id: txId, childId: child.id, kind: 'debit', amount: mealPrice, method: 'card',
          status: 'paid', reference, label, createdAt: now.toISOString(),
        }]);
        setWallets((prev) => prev.map((w) => (w.childId === child.id ? { ...w, balance: w.balance - mealPrice } : w)));
        supabase.from('wallet_transactions').insert({
          id: txId, child_id: child.id, kind: 'debit', amount: mealPrice,
          method: 'card', status: 'paid', reference, label,
        }).then(() => undefined, () => undefined);
        supabase.from('wallets').upsert({ child_id: child.id, balance: balance - mealPrice }).then(() => undefined, () => undefined);
        const validation: MealValidation = {
          id: uid('V'), qrToken: token, clientUsername: child.parentUsername,
          establishmentId, validatedAt: now.toISOString(), status: 'accepted', childId: child.id,
        };
        setValidations((prev) => [...prev, validation]);
        supabase.from('validations').insert({
          id: validation.id, qr_token: token, client_username: validation.clientUsername,
          establishment_id: establishmentId, status: 'accepted', reason: null, child_id: child.id,
        }).then(() => undefined, () => undefined);
        return { ok: true, message: `Repas validé pour ${childName}. Débité ${mealPrice} FCFA. Solde : ${balance - mealPrice} FCFA.`, validation };
      }

      // QR acceptés : on privilégie toujours un abonnement ACTIF et non expiré.
      // D'abord les actifs dont le token correspond, puis les personnels actifs,
      // puis seulement les inactifs (pour un message d'erreur précis).
      const nowMs = now.getTime();
      const isLive = (s: Subscription) => s.status === 'active' && new Date(s.endDate).getTime() >= nowMs;
      const candidates = subscriptions.filter(
        (s) => s.qrToken.toUpperCase() === token || isPersonalQrToken(s.clientUsername, token),
      );
      const sub = candidates.find((s) => isLive(s) && s.qrToken.toUpperCase() === token)
        ?? candidates.find((s) => isLive(s))
        ?? candidates.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))[0];
      if (!sub) return fail('QR Code inconnu : aucun abonnement associé.');
      if (sub.status !== 'active') return fail('Abonnement inactif ou expiré.', sub.clientUsername);
      if (new Date(sub.endDate).getTime() < now.getTime()) {
        setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: 'expired' as const } : s)));
        supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id).then(() => undefined, () => undefined);
        return fail('Abonnement expiré.', sub.clientUsername);
      }
      if (sub.mealsRemaining <= 0) return fail('Plus de repas disponibles sur cet abonnement.', sub.clientUsername);
      // Anti-double PAR CLIENT (pas par token) : 1 repas / jour pour toutes les formules 2026.
      const maxPerDay = 1;
      const servedToday = validations.filter(
        (v) => v.clientUsername === sub.clientUsername && v.status === 'accepted' && sameDay(new Date(v.validatedAt), now),
      ).length;
      if (servedToday >= maxPerDay) {
        return fail(
          'Double validation : un repas a déjà été validé aujourd’hui pour ce client.',
          sub.clientUsername,
        );
      }

      const validation: MealValidation = {
        id: uid('V'),
        qrToken: token,
        clientUsername: sub.clientUsername,
        establishmentId,
        validatedAt: now.toISOString(),
        status: 'accepted',
      };
      setValidations((prev) => [...prev, validation]);
      setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? { ...s, mealsRemaining: s.mealsRemaining - 1 } : s)));
      supabase.from('subscriptions').update({ meals_remaining: sub.mealsRemaining - 1 }).eq('id', sub.id).then(() => undefined, () => undefined);
      supabase.from('validations').insert({
        id: validation.id,
        qr_token: validation.qrToken,
        client_username: validation.clientUsername,
        establishment_id: validation.establishmentId,
        status: validation.status,
        reason: validation.reason ?? null,
        child_id: sub.childId ?? null,
      }).then(() => undefined, () => undefined);
      return { ok: true, message: `Repas validé pour ${sub.clientUsername}. Repas restants : ${sub.mealsRemaining - 1}.`, validation };
    },
    [subscriptions, validations, formulas, childrenList, wallets],
  );

  // Expiration automatique des abonnements dépassés (toutes les 60s + au chargement)
  useEffect(() => {
    const expire = () => {
      const nowMs = Date.now();
      setSubscriptions((prev) => {
        let changed = false;
        const next = prev.map((s) => {
          if (s.status === 'active' && new Date(s.endDate).getTime() < nowMs) {
            changed = true;
            supabase.from('subscriptions').update({ status: 'expired' }).eq('id', s.id)
              .then(() => undefined, () => undefined);
            return { ...s, status: 'expired' as const };
          }
          return s;
        });
        return changed ? next : prev;
      });
    };
    expire();
    const t = window.setInterval(expire, 60000);
    return () => window.clearInterval(t);
  }, []);

  const addEstablishment = useCallback((e: Omit<Establishment, 'id'>) => {
    const created: Establishment = { ...e, id: uid('E') };
    setEstablishments((prev) => [...prev, created]);
    supabase.from('establishments').insert({
      id: created.id, name: created.name, address: created.address ?? null,
      manager: created.manager ?? null, phone: created.phone ?? null,
    }).then(() => undefined, () => undefined);
  }, []);

  const updateEstablishment = useCallback((id: string, updates: Partial<Establishment>) => {
    setEstablishments((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.address !== undefined) payload.address = updates.address ?? null;
    if (updates.manager !== undefined) payload.manager = updates.manager ?? null;
    if (updates.phone !== undefined) payload.phone = updates.phone ?? null;
    if (Object.keys(payload).length > 0) {
      supabase.from('establishments').update(payload).eq('id', id).then(() => undefined, () => undefined);
    }
  }, []);

  const deleteEstablishment = useCallback((id: string) => {
    setEstablishments((prev) => prev.filter((e) => e.id !== id));
    supabase.from('establishments').delete().eq('id', id).then(() => undefined, () => undefined);
  }, []);

  const addFormula = useCallback((f: Omit<Formula, 'id'>) => {
    const formula: Formula = { ...f, id: uid('F') };
    setFormulas((prev) => [...prev, formula]);
    supabase.from('formulas').insert({
      id: formula.id,
      name: formula.name,
      description: formula.description,
      price: formula.price,
      old_price: formula.oldPrice ?? null,
      duration_days: formula.durationDays,
      meals_included: formula.mealsIncluded,
      rules: formula.rules ?? null,
      kind: formula.kind ?? 'subscription',
    }).then(() => undefined, () => undefined);
  }, []);

  const updateFormula = useCallback((id: string, updates: Partial<Formula>) => {
    setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.price !== undefined) payload.price = updates.price;
    if (updates.oldPrice !== undefined) payload.old_price = updates.oldPrice ?? null;
    if (updates.durationDays !== undefined) payload.duration_days = updates.durationDays;
    if (updates.mealsIncluded !== undefined) payload.meals_included = updates.mealsIncluded;
    if (updates.rules !== undefined) payload.rules = updates.rules ?? null;
    if (updates.kind !== undefined) payload.kind = updates.kind;
    if (Object.keys(payload).length > 0) {
      supabase.from('formulas').update(payload).eq('id', id).then(() => undefined, () => undefined);
    }
  }, []);

  const deleteFormula = useCallback((id: string) => {
    setFormulas((prev) => prev.filter((f) => f.id !== id));
    supabase.from('formulas').delete().eq('id', id).then(() => undefined, () => undefined);
  }, []);

  // ================= Profil parent (fiche identité + contact) =================

  const parentProfileOf = useCallback(
    (parentUsername: string) =>
      parentProfiles.find((p) => p.parentUsername === parentUsername.trim().toLowerCase()),
    [parentProfiles],
  );

  const saveParentProfile = useCallback((parentUsername: string, firstName: string, lastName: string, phone: string) => {
    const parent = parentUsername.trim().toLowerCase();
    const first = firstName.trim();
    const last = lastName.trim();
    const digits = phone.replace(/\D/g, '');
    if (!parent || !first || !last) throw new Error('Nom et prénom du parent requis');
    if (digits.length < 9) throw new Error('Numéro de téléphone invalide (9 chiffres minimum)');
    const profile: ParentProfile = {
      parentUsername: parent, firstName: first, lastName: last,
      phone: digits, updatedAt: new Date().toISOString(),
    };
    setParentProfiles((prev) => {
      const next = prev.filter((p) => p.parentUsername !== parent);
      return [...next, profile];
    });
    supabase.from('parent_profiles').upsert({
      parent_username: profile.parentUsername, first_name: profile.firstName,
      last_name: profile.lastName, phone: profile.phone,
    }).then(() => undefined, () => undefined);
    return profile;
  }, []);

  // ================= Enfants + wallet QR (espace parents) =================

  const myChildren = useCallback(
    (parentUsername: string) =>
      childrenList
        .filter((c) => c.parentUsername === parentUsername.trim().toLowerCase())
        .sort((a, b) => a.firstName.localeCompare(b.firstName)),
    [childrenList],
  );

  const walletOf = useCallback(
    (childId: string) => wallets.find((w) => w.childId === childId)?.balance ?? 0,
    [wallets],
  );

  const childTxs = useCallback(
    (childId: string) =>
      walletTxs.filter((t) => t.childId === childId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [walletTxs],
  );

  const addChild = useCallback((parentUsername: string, firstName: string, lastName: string, className: string, cycle?: SchoolCycle) => {
    const parent = parentUsername.trim().toLowerCase();
    const first = firstName.trim();
    const last = lastName.trim();
    const cls = className.trim();
    if (!parent || !first || !last || !cls) throw new Error('Nom, prénom et classe requis');
    if (!parentProfiles.some((p) => p.parentUsername === parent)) {
      throw new Error('Complétez d’abord votre profil parent (nom, prénom, téléphone).');
    }
    const id = uid('C');
    const child: Child = {
      id, parentUsername: parent, firstName: first, lastName: last,
      className: cls, cycle: cycle ?? inferCycleFromClass(cls),
      qrToken: getChildQrToken(id), createdAt: new Date().toISOString(),
    };
    setChildrenList((prev) => [...prev, child]);
    setWallets((prev) => [...prev, { childId: id, balance: 0 }]);
    supabase.from('children').insert({
      id: child.id, parent_username: child.parentUsername, first_name: child.firstName,
      last_name: child.lastName, class_name: child.className, cycle: child.cycle,
      qr_token: child.qrToken,
    }).then(() => undefined, () => undefined);
    supabase.from('wallets').upsert({ child_id: id, balance: 0 }).then(() => undefined, () => undefined);
    return child;
  }, [parentProfiles]);

  const updateChild = useCallback((id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => {
    setChildrenList((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    const payload: Record<string, unknown> = {};
    if (updates.firstName !== undefined) payload.first_name = updates.firstName;
    if (updates.lastName !== undefined) payload.last_name = updates.lastName;
    if (updates.className !== undefined) payload.class_name = updates.className;
    if (updates.cycle !== undefined) payload.cycle = updates.cycle;
    if (Object.keys(payload).length > 0) {
      supabase.from('children').update(payload).eq('id', id).then(() => undefined, () => undefined);
    }
  }, []);

  const deleteChild = useCallback((id: string) => {
    setChildrenList((prev) => prev.filter((c) => c.id !== id));
    setWallets((prev) => prev.filter((w) => w.childId !== id));
    setWalletTxs((prev) => prev.filter((t) => t.childId !== id));
    supabase.from('children').delete().eq('id', id).then(() => undefined, () => undefined);
  }, []);

  const deleteParent = useCallback((username: string) => {
    // Supprimer les enfants du parent
    const childrenToDelete = childrenList.filter((c) => c.parentUsername === username);
    childrenToDelete.forEach((child) => {
      setChildrenList((prev) => prev.filter((c) => c.id !== child.id));
      setWallets((prev) => prev.filter((w) => w.childId !== child.id));
      setWalletTxs((prev) => prev.filter((t) => t.childId !== child.id));
    });
    supabase.from('children').delete().eq('parent_username', username).then(() => undefined, () => undefined);

    // Supprimer les abonnements
    setSubscriptions((prev) => prev.filter((s) => s.clientUsername !== username));
    supabase.from('subscriptions').delete().eq('client_username', username).then(() => undefined, () => undefined);

    // Supprimer les paiements
    setPayments((prev) => prev.filter((p) => p.clientUsername !== username));
    supabase.from('oresto_payments').delete().eq('client_username', username).then(() => undefined, () => undefined);

    // Supprimer les validations
    setValidations((prev) => prev.filter((v) => v.clientUsername !== username));
    supabase.from('validations').delete().eq('client_username', username).then(() => undefined, () => undefined);

    // Supprimer le profil parent
    setParentProfiles((prev) => prev.filter((p) => p.parentUsername !== username));
    supabase.from('parent_profiles').delete().eq('parent_username', username).then(() => undefined, () => undefined);

    // Supprimer le wallet (via enfants déjà supprimés)
    // Les wallets sont déjà supprimés via les enfants
  }, [childrenList, subscriptions, payments, validations, parentProfiles]);

  // Recharge QR Carte : cash = crédit immédiat, externe = pending à confirmer
  const topUpChild = useCallback(
    (childId: string, amount: number, method: ORestoPaymentMethod) => {
      const child = childrenList.find((c) => c.id === childId);
      if (!child) throw new Error('Enfant introuvable');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');
      const now = new Date();
      const reference = `TOP-${Date.now().toString(36).toUpperCase()}`;
      if (method === 'cash') {
        const tx: WalletTx = {
          id: uid('W'), childId, kind: 'topup', amount, method,
          status: 'paid', reference, label: `Recharge ${child.firstName} ${child.lastName}`,
          createdAt: now.toISOString(),
        };
        setWalletTxs((prev) => [...prev, tx]);
        setWallets((prev) => {
          const cur = prev.find((w) => w.childId === childId)?.balance ?? 0;
          const next = prev.filter((w) => w.childId !== childId);
          return [...next, { childId, balance: cur + amount }];
        });
        supabase.from('wallet_transactions').insert({
          id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
          method: tx.method, status: 'paid', reference: tx.reference, label: tx.label,
        }).then(() => undefined, () => undefined);
        supabase.from('wallets').upsert({ child_id: childId, balance: walletOf(childId) + amount })
          .then(() => undefined, () => undefined);
        return { tx };
      }
      const tx: WalletTx = {
        id: uid('W'), childId, kind: 'topup', amount, method,
        status: 'pending', reference, label: `Recharge ${child.firstName} ${child.lastName}`,
        createdAt: now.toISOString(),
      };
      setWalletTxs((prev) => [...prev, tx]);
      supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
        method: tx.method, status: 'pending', reference: tx.reference, label: tx.label,
      }).then(() => undefined, () => undefined);
      if (isMobileMethod(method)) {
        const wave = initiateWavePayment(amount, method, reference);
        return { tx, wave };
      }
      return { tx };
    },
    [childrenList, walletOf],
  );

  const creditWalletTx = useCallback((txId: string) => {
    const tx = walletTxs.find((t) => t.id === txId);
    if (!tx || tx.status !== 'pending') return false;
    setWalletTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, status: 'paid' as const } : t)));
    setWallets((prev) => {
      const cur = prev.find((w) => w.childId === tx.childId)?.balance ?? 0;
      const next = prev.filter((w) => w.childId !== tx.childId);
      return [...next, { childId: tx.childId, balance: cur + tx.amount }];
    });
    supabase.from('wallet_transactions').update({ status: 'paid' }).eq('id', txId)
      .then(() => undefined, () => undefined);
    supabase.from('wallets').upsert({ child_id: tx.childId, balance: walletOf(tx.childId) + tx.amount })
      .then(() => undefined, () => undefined);
    return true;
  }, [walletTxs, walletOf]);

  // Coche manuelle caissier : recharge externe vérifiée sur son téléphone
  const confirmWalletTopUp = useCallback((txId: string) => {
    const tx = walletTxs.find((t) => t.id === txId);
    if (!tx) return false;
    if (tx.reference) clearWaveCode(tx.reference);
    return creditWalletTx(txId);
  }, [walletTxs, creditWalletTx]);

  const confirmWalletTopUpMobile = useCallback((txId: string, code: string) => {
    const tx = walletTxs.find((t) => t.id === txId);
    if (!tx) return { ok: false, message: 'Recharge introuvable.' };
    if (tx.status === 'paid') return { ok: true, message: 'Recharge déjà confirmée.' };
    if (tx.status !== 'pending') return { ok: false, message: 'Cette recharge ne peut plus être confirmée.' };
    if (!isMobileMethod(tx.method)) return { ok: false, message: 'Recharge espèces : coche manuelle du caissier.' };
    const created = new Date(tx.createdAt).getTime();
    if (Number.isFinite(created) && Date.now() - created > WAVE_TTL_MS) {
      setWalletTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, status: 'failed' as const } : t)));
      supabase.from('wallet_transactions').update({ status: 'failed' }).eq('id', txId)
        .then(() => undefined, () => undefined);
      return { ok: false, message: 'Demande expirée (15 min). Relancez la recharge.' };
    }
    if (!checkWaveCode(tx.reference, code)) {
      return { ok: false, message: 'Code incorrect : vérifiez le code à 6 chiffres.' };
    }
    clearWaveCode(tx.reference);
    creditWalletTx(txId);
    return { ok: true, message: `Recharge confirmée : +${tx.amount} FCFA sur la carte.` };
  }, [walletTxs, creditWalletTx]);

  // Débit interne (repas sans abonnement) — faux si solde insuffisant
  const debitWallet = useCallback((childId: string, amount: number, label: string) => {
    const balance = wallets.find((w) => w.childId === childId)?.balance ?? 0;
    if (balance < amount) return false;
    const tx: WalletTx = {
      id: uid('W'), childId, kind: 'debit', amount, method: 'card',
      status: 'paid', reference: `DEB-${Date.now().toString(36).toUpperCase()}`,
      label, createdAt: new Date().toISOString(),
    };
    setWalletTxs((prev) => [...prev, tx]);
    setWallets((prev) => prev.map((w) => (w.childId === childId ? { ...w, balance: w.balance - amount } : w)));
    supabase.from('wallet_transactions').insert({
      id: tx.id, child_id: tx.childId, kind: 'debit', amount: tx.amount,
      method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
    }).then(() => undefined, () => undefined);
    supabase.from('wallets').upsert({ child_id: childId, balance: balance - amount })
      .then(() => undefined, () => undefined);
    return true;
  }, [wallets]);

  const setFinanceSettings = useCallback((s: Partial<FinanceSettings>) => {
    setFinanceSettingsState((prev) => {
      const next = { ...prev, ...s };
      supabase.from('finance_settings').upsert([
        { key: 'ism_subscription_pct', value: String(next.ismSubscriptionPct) },
        { key: 'school_per_subscription', value: String(next.schoolPerSubscription) },
        { key: 'other_sales_pct', value: String(next.otherSalesPct) },
        { key: 'touchpoint_pct', value: String(next.touchpointPct) },
        { key: 'paydounya_pct', value: String(next.paydounyaPct) },
        { key: 'ism_per_subscription', value: String(next.ismPerSubscription) },
        { key: 'ism_sales_pct', value: String(next.ismSalesPct) },
      ]).then(() => undefined, () => undefined);
      return next;
    });
  }, []);

  const addExpense = useCallback((label: string, category: ExpenseCategory, amount: number, spentAt: string, createdBy?: string) => {
    const clean = label.trim();
    if (!clean) throw new Error('Libellé requis');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');
    const expense: FinanceExpense = {
      id: uid('D'), label: clean, category, amount,
      spentAt: spentAt || new Date().toISOString(), createdBy,
    };
    setFinanceExpenses((prev) => [expense, ...prev]);
    supabase.from('finance_expenses').insert({
      id: expense.id, label: expense.label, category: expense.category,
      amount: expense.amount, spent_at: expense.spentAt, created_by: expense.createdBy ?? null,
    }).then(() => undefined, () => undefined);
    return expense;
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setFinanceExpenses((prev) => prev.filter((e) => e.id !== id));
    supabase.from('finance_expenses').delete().eq('id', id).then(() => undefined, () => undefined);
  }, []);

  const updateWeeklyMenu = useCallback((day: WeeklyMenu['day'], name: string, description: string, items: WeeklyMenuItem[] = [], price?: number) => {
    const clean = items
      .filter((it) => it && typeof it.name === 'string')
      .map((it) => ({ name: it.name.trim().slice(0, 60), price: Math.max(0, Math.floor(Number(it.price) || 0)) }))
      .filter((it) => it.name)
      .slice(0, 8);
    const dayPrice = Math.max(0, Math.floor(Number(price) || 0));
    setWeeklyMenus((prev) => prev.map((m) => (m.day === day ? { ...m, name, description, items: clean, price: dayPrice } : m)));
    supabase.from('weekly_menus').upsert({ day, name, description, items: clean, price: dayPrice }).then(() => undefined, () => undefined);
  }, []);

  const nowMsStats = Date.now();
  const stats = {
    activeClients: subscriptions.filter((s) => s.status === 'active' && new Date(s.endDate).getTime() >= nowMsStats).length,
    mealsToday: validations.filter((v) => v.status === 'accepted' && sameDay(new Date(v.validatedAt), new Date())).length,
    revenue: payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
  };

  return (
    <RestoContext.Provider
      value={{
        establishments,
        formulas,
        subscriptions,
        payments,
        validations,
        addEstablishment,
        updateEstablishment,
        deleteEstablishment,
        addFormula,
        updateFormula,
        deleteFormula,
        mySubscription,
        mySubscriptions,
        myPayments,
        myValidations,
        subscribe,
        paySubscription,
        confirmMobilePayment,
        resumeMobilePayment,
        confirmCashPayment,
        collectCashPayment,
        confirmManualPayment,
        cancelSubscription,
        renewSubscription,
        buyTicket,
        buyDayMenu,
        buyKiosk,
        counterSale,
        validateMeal,
        stats,
        children: childrenList,
        wallets,
        walletTxs,
        financeSettings,
        myChildren,
        parentProfiles,
        parentProfileOf,
        saveParentProfile,
        walletOf,
        childTxs,
        addChild,
        updateChild,
        deleteChild,
        deleteParent,
        topUpChild,
        confirmWalletTopUp,
        confirmWalletTopUpMobile,
        debitWallet,
        setFinanceSettings,
        financeExpenses,
        addExpense,
        deleteExpense,
        weeklyMenus,
        updateWeeklyMenu,
        createWalkInTicket,
        walkInTickets,
      }}
    >
      {children}
    </RestoContext.Provider>
  );
}

export function useResto() {
  const ctx = useContext(RestoContext);
  if (!ctx) throw new Error('useResto must be used within a RestoProvider');
  return ctx;
}
