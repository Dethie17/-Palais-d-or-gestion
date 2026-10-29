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
  KioskOrderStatus,
  Complaint,
  ComplaintMessage,
  ComplaintCategory,
  ComplaintStatus,
} from '@/types/menu';
import { isDemoAccount } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  checkWaveCode,
  clearWaveCode,
  initiateWavePayment,
  isMobileMethod,
  WAVE_TTL_MS,
  type WavePaymentRequest,
} from '@/lib/wave';
import {
  checkPaymentStatus,
  initProvider,
  isProviderMethod,
  provider,
  startPayment,
  stepsFor,
} from '@/lib/payments';
import { recallPayerPhone, rememberPayerPhone } from '@/lib/payments/payerPhone';
import type { PaymentStatus, ProviderMethod, StartPaymentInput, StartPaymentResult } from '@/lib/payments/types';
import { getClientQrToken, isPersonalQrToken, getChildQrToken } from '@/lib/clientQr';
import { generateSecureQrToken } from '@/lib/secureQr';
import { postAdminJson } from '@/lib/adminApi';
import { settlePaymentOnServer } from '@/lib/financeApi';
import { normalizeParentPhone, isValidParentPhone, formatParentPhone } from '@/lib/parentIdentity';
import { dedupeChildren, childNaturalKey } from '@/lib/childIdentity';
import { inferCycleFromClass, normalizeCycle, canonicalClassName } from '@/lib/schoolCycles';
import { foldDayPriceIntoItems } from '@/lib/menus';
import { referenceWeek } from '@/data/cantineWeek';

/**
 * Écritures Supabase « best-effort » : l'application continue en local quand
 * la base refuse (politique RLS, colonne absente, hors ligne…), mais l'échec
 * est MAINTENANT affiché en console au lieu d'être avalé. Sans ce log, le
 * local et la base divergent silencieusement et on croit à tort que tout est
 * synchronisé.
 */
const writeStats = { ok: 0, failed: 0 };

/**
 * Écritures dont une autre dépend par clé étrangère.
 *
 * Un abonnement et le paiement qui le référence (ou un élève et sa carte)
 * partent en parallèle : la seconde insertion arrive parfois avant que la
 * première ne soit visible, Postgres refuse alors la clé étrangère (23503)
 * et la ligne était perdue — le parent ne recevait jamais son lien Wave.
 * On garde la promesse de l'écriture « parente » pour pouvoir l'attendre.
 */
const parentWrites = new Map<string, Promise<void>>();

function persist(label: string, query: PromiseLike<unknown>): Promise<void> {
  const done = Promise.resolve(query).then(
    () => {
      writeStats.ok += 1;
    },
    (error: unknown) => {
      writeStats.failed += 1;
      console.warn(
        `[O RESTO] écriture Supabase refusée — ${label} (la donnée reste en local)`,
        error,
      );
    },
  );
  return done;
}

/**
 * Écriture d'une ligne qui référence une ligne tout juste écrite.
 *
 * On attend d'abord l'écriture parente quand on la connaît, puis on réessaie
 * uniquement la violation de clé étrangère (23503) le temps que la ligne
 * parente devienne visible ; toute autre erreur est réelle et journalisée.
 */
async function persistAfterParent(
  label: string,
  parentId: string | undefined,
  makeQuery: () => PromiseLike<unknown>,
): Promise<void> {
  if (parentId) {
    const pending = parentWrites.get(parentId);
    if (pending) await pending.catch(() => undefined);
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = (await makeQuery()) as { error?: { code?: string | null; message?: string } | null };
    const error = result?.error ?? null;
    if (!error) {
      writeStats.ok += 1;
      return;
    }
    if (error.code !== '23503') {
      writeStats.failed += 1;
      console.warn(
        `[O RESTO] écriture Supabase refusée — ${label} (la donnée reste en local)`,
        error,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  writeStats.failed += 1;
  console.warn(
    `[O RESTO] écriture Supabase refusée — ${label} : ligne liée introuvable après plusieurs essais.`,
  );
}

// Compteur consultable depuis la console : __orestoWrites.failed doit rester
// à 0 ; sinon, la base refuse les écritures (RLS / colonne manquante).
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__orestoWrites', { value: writeStats, writable: false });
}

/**
 * Réponse de /api/sycapay/initiate quand la commande n'est pas encore visible
 * en base : ce n'est pas un refus du client, seulement une course.
 */
const TRANSACTION_INCONNUE = /n['’]est pas la v/;

/**
 * Démarre un paiement chez la passerelle en tolérant le délai de visibilité
 * de la ligne de commande.
 *
 * La commande et la requête de paiement sont écrites au moment même où la
 * passerelle est appelée. Si l'écriture n'est pas encore visible, la route
 * répond 403 et le parent verrait un échec alors qu'il n'a rien envoyé :
 * on réessaie ce seul cas quelques instants, sans jamais rejouer un vrai refus.
 */
async function startPaymentWhenVisible(input: StartPaymentInput): Promise<StartPaymentResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await startPayment(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (attempt >= 4 || !TRANSACTION_INCONNUE.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

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
  inactiveParents: 'o-resto-inactiveparents-v1',
  dayTicket: 'o-resto-dayticket-v1',
  weeklyMenus: 'o-resto-weeklymenus-v3',
  complaints: 'o-resto-reclamations-v1',
  complaintMessages: 'o-resto-reclamationmessages-v1',
  kioskOrders: 'o-resto-kioskorders-v1',
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
  touchpointPct: 0.5, sycapayPct: 1, paydounyaPct: 1.5, ismPerSubscription: 2000, ismSalesPct: 5,
};

/** Fin du mois civil en cours, 23:59:59.999 : expiration de tous les repas achetés. */
function endOfMonthIso(d = new Date()): string {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return end.toISOString();
}

/**
 * Début de la période SUIVANTE pour un réabonnement : le lendemain de la fin
 * de la période en cours, jamais dans le passé. Un abonnement qui se termine
 * le 31/10 est donc renouvelé à partir du 01/11 — pas « à la date du jour ».
 */
function nextPeriodStart(endDateIso: string, now = new Date()): Date {
  const end = new Date(endDateIso);
  const dayAfter = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dayAfter.getTime() > today.getTime() ? dayAfter : today;
}

/** Fin du mois civil de `d`, à 23:59:59.999. */
function endOfThatMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Un abonnement est UTILISABLE s'il est actif ET dans sa période : un
 * réabonnement daté du mois suivant ne doit pas servir de repas avant son
 * premier jour.
 */
function isLiveSub(
  s: { status: string; startDate: string; endDate: string },
  nowMs = Date.now(),
): boolean {
  if (s.status !== 'active') return false;
  const end = new Date(s.endDate).getTime();
  if (!Number.isFinite(end) || end < nowMs) return false;
  const start = new Date(s.startDate).getTime();
  if (Number.isFinite(start) && start > nowMs) return false;
  return true;
}

/** Ticket du jour publié par le Superviseur (clé finance_settings `day_ticket`). */
export type DayTicket = {
  date: string;
  name: string;
  price: number;
  active: boolean;
};

// Site unique : ISM Thiès (le logiciel ne couvre qu'un seul établissement pour le moment)
export const ISM_SITE: Establishment = {
  id: 'E-ISM', name: 'ISM Thiès', address: 'Thiès, Sénégal', manager: 'Direction ISM',
};

const DEFAULT_ESTABLISHMENTS: Establishment[] = [{ ...ISM_SITE }];

const DEFAULT_FORMULAS: Formula[] = [
  // Abonnement Hebdomadaire (F1) retiré du catalogue à la demande du patron :
  // seuls des abonnements mensuels sont proposés, les héritages F1 sont
  // décommissionnés par healRemoteCatalog() / supabase-hebdo-retire.sql.
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
  const order = ['F2', 'F3', 'T1', 'C10'];
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

/**
 * Jeton QR d'une carte/abonnement : 128 bits aléatoires (base64url), uniques,
 * indévinaables. Repli : l'ancien jeton faible si l'environnement n'a aucun
 * aléa cryptographique (jamais le cas d'un navigateur de la dernière décennie).
 */
function newQrToken(): string {
  return generateSecureQrToken() ?? getClientQrToken(uid('QR'));
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
  // Réserve PLUSIEURS MOIS consécutifs d'une même formule pour un enfant :
  // un seul abonnement (start = 1er du premier mois, end = 1er du mois
  // suivant le dernier mois), quota multiplié par le nombre de mois.
  subscribeBundle: (
    clientUsername: string,
    formulaId: string,
    childId: string | undefined,
    monthsCount: number,
    firstMonthISO: string,
  ) => Subscription;
  // Paie un abonnement en attente.
  // - Espèces : reste en attente jusqu'à encaissement au comptoir (Caissier).
  // - Wave : crée une demande de paiement mobile (pending) ;
  //   l'abonnement s'active à la confirmation du code à 6 chiffres.
  // - amountOverride : montant d'un abonnement multi-mois (prix formule × n).
  paySubscription: (
    subscriptionId: string,
    method: ORestoPaymentMethod,
    subOverride?: Subscription,
    amountOverride?: number,
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
  deactivateSubscription: (subscriptionId: string) => void;
  reactivateSubscription: (subscriptionId: string) => void;
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
  /** Clé canonique du parent (son numéro) à partir de n'importe quel identifiant. */
  parentKeyOf: (parentUsername: string) => string;
  saveParentProfile: (parentUsername: string, firstName: string, lastName: string, phone: string) => ParentProfile;
  walletOf: (childId: string) => number;
  resolveChildQr: (qrToken: string) => { ok: boolean; message: string; child?: Child; subscription?: Subscription; balance: number };
  sellToChildCard: (
    childId: string,
    items: { productId: string; productName: string; price: number; qty: number }[],
    cashier?: string,
  ) => { ok: boolean; message: string; reference?: string; balance: number; order?: KioskOrder };
  childTxs: (childId: string) => WalletTx[];
  addChild: (parentUsername: string, firstName: string, lastName: string, className: string, cycle?: SchoolCycle) => Child;
  /** Inscription vérifiée d'une ligne d'import Excel (admin). */
  importStudentRow: (row: {
    parentUsername: string;
    parentNom: string;
    parentPrenom: string;
    parentTel: string;
    prenom: string;
    nom: string;
    classe: string;
    cycle: SchoolCycle;
  }) => Promise<{ childId: string; parentCreated: boolean; duplicate: boolean }>;
  updateChild: (id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => void;
  deleteChild: (id: string) => void;
  deleteParent: (username: string) => Promise<{ ok: boolean; error?: string }>;
  buyKiosk: (clientUsername: string, childId: string, items: { productId: string; productName: string; price: number; qty: number }[]) => { order: KioskOrder; balance: number };
  // Recharge QR Carte : espèces = crédit immédiat, externe = pending à confirmer
  topUpChild: (childId: string, amount: number, method: ORestoPaymentMethod) => { tx: WalletTx; wave?: WavePaymentRequest };
  confirmWalletTopUp: (txId: string) => boolean;
  confirmWalletTopUpMobile: (txId: string, code: string) => { ok: boolean; message: string };
  confirmWalletTopUpGroup: (paymentId: string, code: string) => { ok: boolean; message: string };
  // Compte parent actif/inactif (Superviseur) : les cartes enfants d'un parent inactif sont bloquées.
  inactiveParents: string[];
  isParentInactive: (username?: string) => boolean;
  setParentActive: (parentUsername: string, active: boolean) => void;
  // Ticket du jour publié par le Superviseur (clé finance_settings `day_ticket`).
  dayTicket: DayTicket | null;
  setDayTicketPublished: (ticket: DayTicket | null) => void;
  /** Achat du ticket du jour pour un enfant : +1 repas, expiration fin de mois civil. */
  buyDayTicket: (
    clientUsername: string,
    childId: string,
    method: ORestoPaymentMethod,
  ) => { subscription: Subscription; payment: ORestoPayment; wave?: WavePaymentRequest };
  /** Recharge plusieurs cartes enfants en un seul paiement Wave / Orange Money. */
  topUpMulti: (
    clientUsername: string,
    items: { childId: string; amount: number }[],
    method: ORestoPaymentMethod,
  ) => { payment: ORestoPayment; wave?: WavePaymentRequest; txs: WalletTx[] };
  creditWalletTx: (txId: string) => boolean;
  // Débit interne (validation repas sans abonnement) — retourne faux si solde insuffisant
  debitWallet: (childId: string, amount: number, label: string) => boolean;
  // ---- Passerelle de paiement (SycaPay en production, démo sinon) ----
  /** 'sycapay' quand la passerelle est configurée, 'demo' sinon. */
  paymentProviderId: string;
  /** Moyen de paiement pris en charge par une page de paiement. */
  providerLabel: string;
  /**
   * Initie un paiement chez le fournisseur et renvoie la session à afficher.
   * N'active rien : seul le webhook SycaPay (ou le rattrapage statusV2) solde.
   */
  openProviderPayment: (
    input: StartPaymentInput,
    kind?: 'sub' | 'topup',
    paymentId?: string,
  ) => Promise<WavePaymentRequest>;
  /**
   * Rattrapage : interroge le fournisseur sur une référence, et recharge
   * l'état local si la transaction a été réglée côté serveur. C'est ce que
   * l'écran d'attente appelle quand le webhook est passé par-dessus.
   */
  syncPaymentFromProvider: (reference: string) => Promise<PaymentStatus>;
  /** Recharge l'état distant depuis Supabase (après un règlement serveur). */
  refreshRemote: () => Promise<void>;
  // Règle carte : la carte prépayée sert aux TICKETS repas (débit immédiat).
  // Les ABONNEMENTS se paient Wave / espèces — jamais avec le solde.
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
  createWalkInTicket: (menu: WeeklyMenu, method: 'cash' | 'wave' | 'mobile_money') => { token: string; reference: string; ticket: { token: string; reference: string; menuName: string; menuDay: string; price: number; items: WeeklyMenuItem[]; method: string; status: string; createdAt: string } };
  // ---- Commandes kiosques (carte élève) : file du service ----
  kioskOrders: KioskOrder[];
  /** Confirme la remise d'une commande au scan de l'élève. */
  serveKioskOrder: (orderId: string) => void;
  /**
   * Annule une commande NON encore servie : le montant débité est recrédité
   * sur la carte prépayée de l'enfant (transaction kind='refund') et la
   * commande passe en 'cancelled' (local + Supabase).
   * Refusée si la commande est déjà servie (les articles ont été remis).
   */
  cancelKioskOrder: (orderId: string) => { ok: boolean; message: string; balance: number };
  // ---- Réclamations : fil privé parent ↔ superviseur + annonces ----
  complaints: Complaint[];
  complaintMessages: ComplaintMessage[];
  addComplaint: (input: {
    clientUsername: string;
    childId?: string;
    category: ComplaintCategory;
    subject: string;
    body: string;
    photoPath?: string;
  }) => Complaint;
  replyComplaint: (
    complaintId: string,
    authorUsername: string,
    authorRole: 'client' | 'staff',
    body: string,
    photoPath?: string,
  ) => ComplaintMessage;
  setComplaintStatus: (complaintId: string, status: ComplaintStatus) => void;
  publishAnnouncement: (authorUsername: string, subject: string, body: string) => Complaint;
  myComplaints: (username: string) => Complaint[];
  messagesOf: (complaintId: string) => ComplaintMessage[];
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
 * - ses abonnements (actifs / en attente) sont rattachés à F2 (mensuel) :
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
          const fixed = subs.map((s) => (doomed.includes(s.formulaId) ? { ...s, formulaId: 'F2' } : s));
          try { localStorage.setItem(LS_KEYS.subscriptions, JSON.stringify(fixed)); } catch { /* ignore */ }
        }
        try { localStorage.setItem(LS_KEYS.formulas, JSON.stringify(list.filter((f) => !doomed.includes(f.id)))); } catch { /* ignore */ }
      }
    }
    try { localStorage.setItem(LEGACY_CLEANUP_FLAG, '1'); } catch { /* ignore */ }
  } catch { /* stockage indisponible */ }
}

const DEMO_SUBS_PURGE_FLAG = 'o-resto-purge-demo-subscriptions-applied';

/**
 * Purge unique des faux abonnements de démonstration (ex. S-DEMO-CLIENT) :
 * plus aucun abonnement fictif ne doit polluer la comptabilité — Finance
 * ne comptabilise que ce qui a été réellement réglé.
 */
function purgeDemoSubscriptions() {
  try {
    if (localStorage.getItem(DEMO_SUBS_PURGE_FLAG)) return;
    const raw = localStorage.getItem(LS_KEYS.subscriptions);
    if (raw) {
      const subs = JSON.parse(raw) as Subscription[];
      const filtered = subs.filter((s) => !(s.clientUsername && isDemoAccount(s.clientUsername)));
      try { localStorage.setItem(LS_KEYS.subscriptions, JSON.stringify(filtered)); } catch { /* ignore */ }
    }
    try { localStorage.setItem(DEMO_SUBS_PURGE_FLAG, '1'); } catch { /* ignore */ }
  } catch { /* stockage indisponible */ }
}

export function RestoProvider({ children }: { children: ReactNode }) {
  // Converge le site unique + purge l'ancienne formule avant tout chargement d'état
  cleanupSingleSite();
  cleanupLegacyFormulas();
  purgeDemoSubscriptions();
  const [establishments, setEstablishments] = useState<Establishment[]>(() =>
    load(LS_KEYS.establishments, DEFAULT_ESTABLISHMENTS),
  );
  // Catalogue d'abonnements : uniquement des données réelles —
  // pas de souscription de démonstration qui polluerait la
  // comptabilité (Finance comptabilise ce qui a été réellement payé).
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() =>
    load<Subscription[]>(LS_KEYS.subscriptions, []),
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
    // Déduplication : le cache local peut contenir deux lignes pour le même
    // enfant (import rejoué, double-clic avant rechargement).
    const { kept, duplicates } = dedupeChildren(migrated);
    if (changed || duplicates.length > 0) {
      try { localStorage.setItem(LS_KEYS.children, JSON.stringify(kept)); } catch { /* ignore */ }
    }
    return kept;
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
  // Parents dont le compte est désactivé par le Superviseur (clés `inactive_parent_<username>`).
  const [inactiveParents, setInactiveParentsState] = useState<string[]>(() => {
    const stored = load<Record<string, string>>(LS_KEYS.financeSettings, {});
    return Object.entries(stored)
      .filter(([k, v]) => k.startsWith('inactive_parent_') && v === '1')
      .map(([k]) => k.slice('inactive_parent_'.length));
  });
  const [dayTicket, setDayTicketState] = useState<DayTicket | null>(() => {
    const stored = load<Record<string, unknown>>(LS_KEYS.financeSettings, {});
    const raw = stored['day_ticket'];
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as DayTicket; } catch { /* ignore */ }
    }
    return null;
  });
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
  const [complaints, setComplaints] = useState<Complaint[]>(() => load<Complaint[]>(LS_KEYS.complaints, []));
  const [complaintMessages, setComplaintMessages] = useState<ComplaintMessage[]>(() =>
    load<ComplaintMessage[]>(LS_KEYS.complaintMessages, []),
  );
  // Commandes kiosques (récréation / pause) payées par la carte d'un élève.
  // C'est la file que le superviseur doit voir au scan : sans cet état, un
  // achat(parent) ou une vente(comptoir) partait au serveur sans jamais
  // revenir à l'écran — le service n'avait rien à confirmer.
  const [kioskOrders, setKioskOrders] = useState<KioskOrder[]>(() =>
    load<KioskOrder[]>(LS_KEYS.kioskOrders, []),
  );

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
  useEffect(() => save(LS_KEYS.inactiveParents, inactiveParents), [inactiveParents]);
  useEffect(() => save(LS_KEYS.dayTicket, dayTicket), [dayTicket]);
  useEffect(() => save(LS_KEYS.weeklyMenus, weeklyMenus), [weeklyMenus]);
  useEffect(() => save(LS_KEYS.complaints, complaints), [complaints]);
  useEffect(() => save(LS_KEYS.complaintMessages, complaintMessages), [complaintMessages]);
  useEffect(() => save(LS_KEYS.kioskOrders, kioskOrders), [kioskOrders]);

  // Full Supabase : chargement distant (puis localStorage en repli),
  // + synchronisation best-effort vers Supabase.
  // Tables requises : establishments, formulas, subscriptions, oresto_payments, validations
  // (+ supabase-oresto-full.sql pour formulas.kind et intentions ticket).
  //
  // Exposée comme refreshRemote() parce que le règlement d'un paiement SycaPay
  // se fait côté SERVEUR (webhook) : quand le client revient sur l'écran
  // d'attente, l'état local est en retard et doit être rechargé.
  const refreshRemote = useCallback(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;
        const parentSession = sessionData.session.user.app_metadata?.oresto === 'parent';
        const ignored = { data: null, error: null } as const;
        const [estRes, formRes, subRes, payRes, valRes, childRes, walletRes, txRes, setRes, expRes, weekRes, profRes, reclRes, reclMsgRes, kioskRes] = await Promise.all(parentSession ? [
          Promise.resolve(ignored),
          Promise.resolve(ignored),
          supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('oresto_payments').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('validations').select('*').order('validated_at', { ascending: false }).limit(500),
          supabase.from('children').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('wallets').select('*').limit(500),
          supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(500),
          Promise.resolve(ignored), Promise.resolve(ignored), Promise.resolve(ignored),
          supabase.from('parent_profiles').select('*').limit(500),
          supabase.from('reclamations').select('*').order('updated_at', { ascending: false }).limit(500),
          supabase.from('reclamation_messages').select('*').order('created_at', { ascending: true }).limit(2000),
          supabase.from('kiosk_orders').select('*').order('created_at', { ascending: false }).limit(300),
        ] : [
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
          supabase.from('reclamations').select('*').order('updated_at', { ascending: false }).limit(500),
          supabase.from('reclamation_messages').select('*').order('created_at', { ascending: true }).limit(2000),
          supabase.from('kiosk_orders').select('*').order('created_at', { ascending: false }).limit(300),
        ]);

        // Le schéma « réclamations » peut ne pas être installé (script SQL non
        // exécuté) : ces 404 sont attendus et sans effet sur l'app.
        if (reclRes.error) console.info('[O RESTO] Table reclamations absente — exécutez supabase-reclamations.sql.');
        if (estRes.data && estRes.data.length > 0) {
          setEstablishments(
            estRes.data.map((r) => ({
              id: r.id, name: r.name, address: r.address ?? undefined,
              manager: r.manager ?? undefined, phone: r.phone ?? undefined,
            })),
          );
        }
        // Anciennes formules perso « Midi Semaine » : écartées de l'état local
        // (rattachées à F2), la base distante est réparée par healRemoteCatalog().
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
              formulaId: droppedRemoteIds.includes(r.formula_id) ? 'F2' : r.formula_id,
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
              // Règlement : c'est l'horodatage serveur qui fait foi en
              // comptabilité (v_paiements_valides côté base).
              paidAt: r.paid_at ?? undefined,
              settledAt: r.settled_at ?? undefined,
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
          // Déduplication defensive : la base peut contenir deux lignes pour
          // le même enfant (import rejoué, double-clic). On n'en garde qu'une,
          // sinon le personnel voit deux cartes et deux QR pour le même élève.
          const { kept, duplicates } = dedupeChildren(
            childRes.data.map((r) => ({
              id: r.id, parentUsername: r.parent_username, firstName: r.first_name,
              lastName: r.last_name, className: r.class_name,
              cycle: normalizeCycle(r.cycle) ?? inferCycleFromClass(r.class_name ?? ''),
              qrToken: r.qr_token,
              createdAt: r.created_at,
            })),
          );
          if (duplicates.length > 0) {
            console.info(
              `[O RESTO] ${duplicates.length} doublon(s) d'enfant ignoré(s) au chargement :`,
              duplicates.map((d) => `${d.firstName} ${d.lastName} (${d.className})`).join(', '),
            );
          }
          setChildrenList(kept);
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
              sycapayPct: Number(map.sycapay_pct ?? migrated.sycapayPct ?? 1) || 0,
              paydounyaPct: Number(map.paydounya_pct ?? migrated.paydounyaPct ?? 1.5) || 0,
              ismPerSubscription: Number(map.ism_per_subscription ?? (migrated as FinanceSettings).ismPerSubscription ?? 2000) || 0,
              ismSalesPct: Number(map.ism_sales_pct ?? (migrated as FinanceSettings).ismSalesPct ?? 5) || 0,
            };
            return next;
          });
          setInactiveParentsState(Object.entries(map).filter(([k, v]) => k.startsWith('inactive_parent_') && v === '1').map(([k]) => k.slice('inactive_parent_'.length)));
          const dayTicketRaw = map['day_ticket'];
          if (typeof dayTicketRaw === 'string') {
            try { setDayTicketState(JSON.parse(dayTicketRaw)); } catch { /* ignore */ }
          }
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
        if (reclRes.data && reclRes.data.length > 0) {
          setComplaints(reclRes.data.map((r) => ({
            id: r.id, reference: r.reference, clientUsername: r.client_username,
            childId: r.child_id ?? undefined, category: r.category as ComplaintCategory,
            subject: r.subject, status: r.status as ComplaintStatus,
            isAnnouncement: Boolean(r.is_announcement), createdAt: r.created_at,
            updatedAt: r.updated_at, resolvedAt: r.resolved_at ?? undefined,
          })));
        }
        if (reclMsgRes.data && reclMsgRes.data.length > 0) {
          setComplaintMessages(reclMsgRes.data.map((r) => ({
            id: r.id, complaintId: r.complaint_id, authorUsername: r.author_username,
            authorRole: r.author_role as 'client' | 'staff', body: r.body,
            photoPath: r.photo_path ?? undefined, createdAt: r.created_at,
          })));
        }
        if (kioskRes.data && kioskRes.data.length > 0) {
          setKioskOrders(kioskRes.data.map((r) => ({
            id: r.id, childId: r.child_id, parentUsername: r.parent_username,
            items: Array.isArray(r.items) ? (r.items as KioskOrder['items']) : [],
            total: Number(r.total),
            status: (r.status === 'served' || r.status === 'cancelled' ? r.status : 'pending') as KioskOrderStatus,
            reference: r.reference, createdAt: r.created_at,
            servedAt: r.served_at ?? undefined,
          })));
        }
      } catch {
        /* offline : le localStorage reste la source de vérité */
      }
  }, []);

  useEffect(() => { void refreshRemote(); }, [refreshRemote]);

  // Un paiement SycaPay est solde par le webhook, cote serveur. Rien ne le
  // redit a cet onglet : sans rafraichissement, la ligne resterait " en
  // attente " alors que l'argent est encaisse - et le chiffre d'affaires
  // l'ignorerait. On rescannote donc periodiquement, et des qu'on revient
  // sur l'application.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const rescannoter = () => { void refreshRemote(); };
    const minute = 20000;
    const horloge = window.setInterval(rescannoter, minute);
    // Un onglet mis en arriere-plan est suspendu par le navigateur : a son
    // retour, la verification doit etre immediate, pas dans 20 secondes.
    const surVisible = () => {
      if (document.visibilityState === 'visible') rescannoter();
    };
    document.addEventListener('visibilitychange', surVisible);
    window.addEventListener('focus', rescannoter);
    return () => {
      window.clearInterval(horloge);
      document.removeEventListener('visibilitychange', surVisible);
      window.removeEventListener('focus', rescannoter);
    };
  }, [refreshRemote]);

  // Répare la base distante : site unique ISM Thiès, tarifs officiels 2026,
  // suppression de l'ancienne « Midi Semaine » et retrait du hebdomadaire
  // (F1) demandé par le patron. Best-effort.
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const flag = sessionData.session?.user.app_metadata?.oresto;
        if (!sessionData.session || flag === 'parent') return;
        if (localStorage.getItem('o-resto-remote-heal-2026e')) return;
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
            await supabase.from('subscriptions').update({ formula_id: 'F2' }).in('formula_id', ids);
            await supabase.from('formulas').delete().in('id', ids);
          }
        }
        // Hebdomadaire retiré du catalogue (demande du patron) : les
        // abonnements F1 encore ouverts sont résiliés, leurs règlements
        // payés sont remboursés (jamais comptabilisés comme validés), puis
        // la formule est retirée. Les héritages déjà clôturés restent
        // dans la comptabilité passée (titres réellement consommés).
        const hebdoRes = await supabase
          .from('subscriptions')
          .select('id')
          .eq('formula_id', 'F1')
          .in('status', ['active', 'pending']);
        const hebdoIds = (hebdoRes.data ?? []).map((r) => r.id as string);
        if (hebdoIds.length > 0) {
          await supabase
            .from('oresto_payments')
            .update({ status: 'refunded' })
            .in('subscription_id', hebdoIds)
            .eq('status', 'paid');
          await supabase
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .in('id', hebdoIds);
        }
        setSubscriptions((prev) =>
          prev.map((s) => (s.formulaId === 'F1' && s.status !== 'cancelled' ? { ...s, status: 'cancelled' as const } : s)),
        );
        setPayments((prev) =>
          prev.map((p) =>
            p.status === 'paid' && hebdoIds.includes(p.subscriptionId ?? '')
              ? { ...p, status: 'refunded' as const }
              : p,
          ),
        );
        await supabase.from('formulas').delete().eq('id', 'F1');
        setFormulas((prev) => prev.filter((f) => f.id !== 'F1'));
        // Site unique ISM Thiès : crée le site, rattache les validations, retire E1/E2
        const siteUp = await supabase.from('establishments').upsert({
          id: ISM_SITE.id, name: ISM_SITE.name, address: ISM_SITE.address, manager: ISM_SITE.manager,
        });
        if (!siteUp.error) {
          await supabase.from('validations').update({ establishment_id: ISM_SITE.id }).neq('establishment_id', ISM_SITE.id);
          await supabase.from('establishments').delete().in('id', ['E1', 'E2']);
          setEstablishments([{ ...ISM_SITE }]);
        }
        try { localStorage.setItem('o-resto-remote-heal-2026e', '1'); } catch { /* ignore */ }
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
        const { data: sessionData } = await supabase.auth.getSession();
        const roleFlag = sessionData.session?.user.app_metadata?.oresto;
        if (!sessionData.session || roleFlag === 'parent') return;
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
        (s) => s.clientUsername === username && isLiveSub(s, nowMs),
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
        endDate: endOfMonthIso(now),
        status: 'pending',
        mealsRemaining: formula.mealsIncluded,
        qrToken: child ? child.qrToken : newQrToken(),
        childId: child?.id,
      };
      setSubscriptions((prev) => [...prev, subscription]);
      const written = persist('subscriptions', supabase.from('subscriptions').insert({
        id: subscription.id,
        client_username: subscription.clientUsername,
        formula_id: subscription.formulaId,
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        status: subscription.status,
        meals_remaining: subscription.mealsRemaining,
        qr_token: subscription.qrToken,
        child_id: subscription.childId ?? null,
      }));
      parentWrites.set(subscription.id, written);
      void written.finally(() => {
        parentWrites.delete(subscription.id);
      });
      return subscription;
    },
    [formulas, childrenList],
  );

  /** Réserve N MOIS consécutifs d'une formule pour un enfant (abonnement étendu). */
  const subscribeBundle = useCallback(
    (clientUsername: string, formulaId: string, childId: string | undefined, monthsCount: number, firstMonthISO: string) => {
      const formula = formulas.find((f) => f.id === formulaId);
      if (!formula) throw new Error('Formule inconnue');
      if (!Number.isInteger(monthsCount) || monthsCount < 1) throw new Error('Aucun mois sélectionné');
      const start = new Date(firstMonthISO);
      if (!Number.isFinite(start.getTime())) throw new Error('Mois de départ invalide');
      const end = new Date(start.getTime());
      end.setUTCMonth(end.getUTCMonth() + monthsCount);
      const child = childId ? childrenList.find((c) => c.id === childId) : undefined;
      const subscription: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: 'pending',
        mealsRemaining: formula.mealsIncluded * monthsCount,
        qrToken: child ? child.qrToken : newQrToken(),
        childId: child?.id,
      };
      setSubscriptions((prev) => [...prev, subscription]);
      const written = persist('subscriptions', supabase.from('subscriptions').insert({
        id: subscription.id,
        client_username: subscription.clientUsername,
        formula_id: subscription.formulaId,
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        status: subscription.status,
        meals_remaining: subscription.mealsRemaining,
        qr_token: subscription.qrToken,
        child_id: subscription.childId ?? null,
      }));
      parentWrites.set(subscription.id, written);
      void written.finally(() => {
        parentWrites.delete(subscription.id);
      });
      return subscription;
    },
    [formulas, childrenList],
  );

  /** Écrit une clé/valeur brute de finance_settings (compte inactif, ticket du jour…). */
  const setFinanceSettingKV = useCallback((key: string, value: string | null) => {
    if (value === null) {
      void persist('finance_settings', supabase.from('finance_settings').delete().eq('key', key));
    } else {
      void persist('finance_settings', supabase.from('finance_settings').upsert([{ key, value }]));
    }
  }, []);

  /** Active/désactive le compte d'un parent (carte enfants bloquée si inactif). */
  const setParentActive = useCallback((parentUsername: string, active: boolean) => {
    const key = `inactive_parent_${parentUsername}`;
    if (active) {
      setInactiveParentsState((prev) => prev.filter((u) => u !== parentUsername));
      void setFinanceSettingKV(key, null);
    } else {
      setInactiveParentsState((prev) =>
        prev.includes(parentUsername) ? prev : [...prev, parentUsername],
      );
      void setFinanceSettingKV(key, '1');
    }
  }, [setFinanceSettingKV]);

  /** Est-ce que le compte d'un parent est désactivé (blocage des cartes enfants). */
  const isParentInactive = useCallback((username?: string) =>
    !!username && inactiveParents.includes(username),
  [inactiveParents]);

  /** Publication / retrait du ticket du jour (Superviseur). */
  const setDayTicketPublished = useCallback((ticket: DayTicket | null) => {
    setDayTicketState(ticket);
    if (ticket === null) {
      void setFinanceSettingKV('day_ticket', null);
    } else {
      void setFinanceSettingKV('day_ticket', JSON.stringify(ticket));
    }
  }, [setFinanceSettingKV]);

  // Activation interne idempotente.
  // Règle mensuelle : les repas NON consommés ne se reportent pas — chaque
  // période repart du quota de la formule. Un réabonnement déjà daté sur le
  // mois suivant garde ses propres bornes et ne coupe jamais la carte en cours.
  const activateSubscription = useCallback(
    (subscriptionId: string, override?: Subscription) => {
      const target = subscriptions.find((s) => s.id === subscriptionId) ?? override;
      if (!target) return;
      if (target.status === 'active') return; // déjà actif → ne pas écraser le solde
      const now = new Date();
      const nowMs = now.getTime();
      const scheduledStart = new Date(target.startDate).getTime();
      const isFuture = Number.isFinite(scheduledStart) && scheduledStart > nowMs;
      const startDate = isFuture ? target.startDate : now.toISOString();
      const endDate = isFuture ? target.endDate : endOfMonthIso(now);

      // Ticket du jour : +1 repas sur la carte de l'enfant, sans toucher aux
      // autres abonnements de l'enfant.
      if (target.formulaId === 'TICKET-JOUR') {
        setSubscriptions((prev) =>
          prev.map((s) => {
            if (s.id === subscriptionId) {
              return { ...s, status: 'active' as const, mealsRemaining: s.mealsRemaining + 1, startDate: s.startDate, endDate };
            }
            return s;
          }),
        );
        persist('subscriptions', supabase.from('subscriptions').update({
          status: 'active',
          meals_remaining: target.mealsRemaining + 1,
          end_date: endDate,
        }).eq('id', subscriptionId));
        void setParentActive(target.clientUsername, true);
        return;
      }

      const formula = formulas.find((f) => f.id === target.formulaId);
      if (!formula) return;
      // Quota NEUF : le solde de la période précédente n'est pas repris.
      const meals = formula.mealsIncluded;
      setSubscriptions((prev) =>
        prev.map((s) => {
          if (s.id === subscriptionId) {
            return {
              ...s,
              status: 'active' as const,
              mealsRemaining: meals,
              startDate,
              endDate,
            };
          }
          // Un seul actif par bénéficiaire (enfant si childId, sinon compte
          // parent) — mais on n'expire QUE les périodes réellement terminées :
          // un réabonnement futur ne doit pas désactiver la carte en cours.
          const sameOwner = target.childId
            ? s.childId === target.childId
            : !s.childId && s.clientUsername === target.clientUsername;
          if (sameOwner && s.status === 'active' && new Date(s.endDate).getTime() < nowMs) {
            return { ...s, status: 'expired' as const };
          }
          return s;
        }),
      );
      persist('subscriptions', supabase.from('subscriptions').update({
        status: 'active',
        meals_remaining: meals,
        start_date: startDate,
        end_date: endDate,
      }).eq('id', subscriptionId));
      void setParentActive(target.clientUsername, true);
    },
    [formulas, subscriptions, setParentActive],
  );

  // Tout mode non-espèces = confirmation externe (Wave/OM/carte), jamais immédiat.
  // 'balance' (solde carte) : interne, activation immédiate, jamais de confirmation externe.
  const needsExternalConfirm = (method: ORestoPaymentMethod) => method !== 'cash' && method !== 'balance';

  // ---------- Passerelle de paiement ----------
  //
  // Un fournisseur (SycaPay en production, démo sinon) décide de la FORME du
  // paiement ; il ne décide jamais de l'activation d'un abonnement ni du crédit
  // d'une carte : cela passe par le webhook, ou par le rattrapage statusV2
  // qu'on expose plus bas (syncPaymentFromProvider).
  //
  // Ce que fait openProviderPayment : appeler la passerelle. Ce qu'elle ne fait
  // PAS : solder. Un 201 veut dire « demande partie », pas « argent encaissé ».

  // Détection de la passerelle : une fois par session. Sans réponse (déploiement
  // sans /api, hors ligne, `vite dev` seul) on reste en mode démo — l'app
  // démarre et les parcours restent démontrables.
  const [activeProvider, setActiveProvider] = useState(() => provider());
  useEffect(() => {
    let alive = true;
    void initProvider().then((next) => {
      if (alive) setActiveProvider(next);
    });
    return () => { alive = false; };
  }, []);
  const paymentProviderId = activeProvider.id;
  const providerLabel = activeProvider.label;

  /**
   * Initie un paiement chez le fournisseur et renvoie la session à afficher.
   * En mode démo, aucun appel réseau : le code à 6 chiffres d'avant.
   * Ne solde rien, dans aucun mode.
   */
  const openProviderPayment = useCallback(
    async (input: StartPaymentInput, kind: 'sub' | 'topup' = 'sub', paymentId?: string): Promise<WavePaymentRequest> => {
      // Le code de démonstration ne voyage jamais avec une session réelle :
      // sa présence faisait passer un paiement SycaPay pour une démo, et
      // l'écran affichait un code à saisir au lieu de rediriger.
      const { demoCode: _codeDemo, ...base } = {
        ...initiateWavePayment(input.amount, input.method as 'wave', input.reference),
        paymentId,
        kind,
        provider: activeProvider.id,
      };
      // Repli : passerelle injoignable, ou moyen non géré en ligne.
      // Démonstration en développement seulement ; en production on refuse.
      const enRepli =
        activeProvider.id !== 'sycapay' || !isProviderMethod(input.method);
      if (enRepli) {
        if (import.meta.env.PROD) {
          return {
            ...base,
            provider: activeProvider.id,
            error: isProviderMethod(input.method)
              ? "Paiement momentanément indisponible. Aucun montant n'a été débité — réessayez dans quelques instants."
              : "Ce moyen de paiement n'est pas disponible en ligne.",
          };
        }
        return { ...base, challenge: { kind: 'prompt', phone: input.phone ?? '', label: base.methodLabel } };
      }

      // Le numéro du payeur : celui qui vient d'être saisi, sinon celui
      // mémorisé pour cette référence (reprise d'un paiement commencé sur
      // cet appareil). SycaPay le refuse sans lui.
      const phone = input.phone?.trim() || recallPayerPhone(input.reference);
      if (phone) rememberPayerPhone(input.reference, phone);

      try {
        // La ligne de commande vient d'être créée localement : elle peut
        // n'être pas encore visible côté base, et la passerelle répond alors
        // « Cette transaction n'est pas la vôtre. » — on lui laisse le temps
        // d'arriver au lieu de renvoyer une erreur au parent qui vient de
        // choisir sa formule (rien n'est engagé chez l'opérateur).
        const result = await startPaymentWhenVisible({ ...input, phone });
        if (!result.ok || !result.challenge) {
          return {
            ...base,
            provider: activeProvider.id,
            challenge: { kind: 'prompt', phone: input.phone ?? '', label: activeProvider.label },
            error: result.error ?? 'Paiement refusé.',
          };
        }
        return {
          ...base,
          provider: activeProvider.id,
          challenge: result.challenge,
          expiresAt: result.expiresAt ?? base.expiresAt,
          steps: stepsFor(result.challenge, input.amount),
        };
      } catch (err) {
        // Panne de passerelle : on dit ce qu'on sait, sans solde ni invitation
        // à réessayer si l'appel a pu être engagé chez l'opérateur.
        const message = (err as Error).message;
        return {
          ...base,
          provider: activeProvider.id,
          challenge: { kind: 'prompt', phone: input.phone ?? '', label: activeProvider.label },
          error: message,
        };
      }
    },
    [activeProvider.id, activeProvider.label],
  );

  /**
   * Rattrapage : interroge le fournisseur sur une référence et, si la
   * transaction est réglée, recharge l'état local depuis Supabase (c'est le
   * serveur qui a soldé, via le webhook ou ce statusV2).
   *
   * C'est ce que l'écran d'attente appelle en boucle quand le webhook est
   * passé par-dessus : un client qui a payé mais fermé l'onglet retrouve son
   * abonnement.
   */
  const syncPaymentFromProvider = useCallback(
    async (reference: string): Promise<PaymentStatus> => {
      if (activeProvider.id === 'demo') {
        // En démo il n'y a pas d'opérateur : c'est le code saisi qui décide.
        return { status: 'pending', reference };
      }
      const status = await checkPaymentStatus(reference);
      if (status.status === 'paid') await refreshRemote();
      return status;
    },
    [activeProvider.id, refreshRemote],
  );

  // Paiement d'un abonnement en attente (avec déduplication).
  // Espèces → pending (encaissement au comptoir par le Caissier).
  // Wave/OM/carte → demande pending à confirmer (manuelle ou code Wave).
  // 'balance' REFUSÉ : un abonnement ne se paie jamais avec la carte
  // (la carte sert aux tickets repas). Wave / espèces uniquement.
  const paySubscription = useCallback(
    (subscriptionId: string, method: ORestoPaymentMethod, subOverride?: Subscription, amountOverride?: number) => {
      if (method === 'balance') {
        throw new Error('Abonnement : paiement par carte impossible — payez via Wave ou en espèces. La carte sert aux tickets repas.');
      }
      // subOverride : objet frais retourné par subscribe() — permet d'enchaîner
      // subscribe() + paySubscription() dans le même handler (state pas encore à jour).
      const sub = subscriptions.find((s) => s.id === subscriptionId) ?? subOverride;
      if (!sub) throw new Error('Abonnement introuvable');
      if (sub.status === 'cancelled') throw new Error('Abonnement annulé');
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula && sub.formulaId !== 'TICKET-JOUR') throw new Error('Formule inconnue');
      const priceNorm = sub.formulaId === 'TICKET-JOUR' ? (dayTicket?.price ?? 0) : (formula?.price ?? 0);
      // Abonnement multi-mois : le montant est recalculé ici comme prix de
      // la formule × nombre de mois couverts (amountOverride = price × n),
      // jamais à partir d'une entrée libre du parent ; le débit réel est
      // validé au retour par le pont SycaPay.
      const price = amountOverride && Number.isFinite(amountOverride) && amountOverride > 0 ? amountOverride : priceNorm;
      // Déduplication : réutiliser le pending existant même méthode
      const existingPending = payments.find(
        (p) => p.subscriptionId === subscriptionId && p.status === 'pending' && p.method === method,
      );
      if (existingPending) {
        if (isMobileMethod(method)) {
          const wave = initiateWavePayment(price, method, existingPending.reference);
          return { payment: existingPending, activated: false, wave };
        }
        return { payment: existingPending, activated: false };
      }
      const now = new Date();
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId: sub.id,
        amount: price,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      // Le paiement référence l'abonnement : il attend son écriture pour ne
      // jamais violer la clé étrangère (voir persistAfterParent).
      void persistAfterParent('oresto_payments', payment.subscriptionId, () =>
        supabase.from('oresto_payments').insert({
          id: payment.id,
          subscription_id: payment.subscriptionId,
          client_username: sub.clientUsername,
          formula_id: sub.formulaId,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
          reference: payment.reference,
          // Contexte de règlement : le webhook active l'abonnement lié, et
          // n'a pas d'autre moyen de savoir à qui il appartient.
          child_id: sub.childId ?? null,
        }));
      if (!needsExternalConfirm(method)) return { payment, activated: false };
      if (isMobileMethod(method)) {
        const wave = initiateWavePayment(price, method, reference);
        return { payment, activated: false, wave };
      }
      return { payment, activated: false };
    },
    [formulas, subscriptions, payments, dayTicket],
  );

  // Règle carte : un abonnement ne se paie JAMAIS avec le solde prépayé
  // (Wave / espèces uniquement). La carte sert aux tickets repas.

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
        persist('subscriptions', supabase.from('subscriptions').update({
          meals_remaining: existing.mealsRemaining + formula.mealsIncluded,
        }).eq('id', existing.id));
        return { added: formula.mealsIncluded, subscriptionId: existing.id };
      }
      const ticket: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId,
        startDate: now.toISOString(),
        endDate: endOfMonthIso(now),
        status: 'active',
        mealsRemaining: formula.mealsIncluded,
        qrToken: newQrToken(),
      };
      setSubscriptions((prev) => [...prev, ticket]);
      const written = persist('subscriptions', supabase.from('subscriptions').insert({
        id: ticket.id,
        client_username: ticket.clientUsername,
        formula_id: ticket.formulaId,
        start_date: ticket.startDate,
        end_date: ticket.endDate,
        status: ticket.status,
        meals_remaining: ticket.mealsRemaining,
        qr_token: ticket.qrToken,
      }));
      parentWrites.set(ticket.id, written);
      void written.finally(() => {
        parentWrites.delete(ticket.id);
      });
      return { added: formula.mealsIncluded, subscriptionId: ticket.id };
    },
    [formulas, subscriptions],
  );

  /** Achat du ticket du jour pour un enfant : +1 repas, expirant fin de mois civil. */
  const buyDayTicket = useCallback(
    (clientUsername: string, childId: string, method: ORestoPaymentMethod) => {
      if (!dayTicket?.active || !Number.isFinite(dayTicket.price) || dayTicket.price <= 0) {
        throw new Error("Aucun ticket du jour publié. Revenez après sa publication par la cantine.");
      }
      const child = childrenList.find((c) => c.id === childId);
      if (!child) throw new Error('Enfant introuvable.');
      const now = new Date();
      const sub: Subscription = {
        id: uid('S'),
        clientUsername,
        formulaId: 'TICKET-JOUR',
        startDate: now.toISOString(),
        endDate: endOfMonthIso(now),
        status: 'pending',
        mealsRemaining: 0,
        qrToken: child.qrToken,
        childId: child.id,
      };
      setSubscriptions((prev) => [...prev, sub]);
      const written = persist('subscriptions', supabase.from('subscriptions').insert({
        id: sub.id,
        client_username: sub.clientUsername,
        formula_id: sub.formulaId,
        start_date: sub.startDate,
        end_date: sub.endDate,
        status: sub.status,
        meals_remaining: sub.mealsRemaining,
        qr_token: sub.qrToken,
        child_id: sub.childId ?? null,
      }));
      parentWrites.set(sub.id, written);
      void written.finally(() => {
        parentWrites.delete(sub.id);
      });
      const { payment, wave } = paySubscription(sub.id, method, sub);
      return { subscription: sub, payment, wave };
    },
    [childrenList, dayTicket, paySubscription],
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
        persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'failed' }).eq('id', paymentId));
        return { ok: false, message: 'Demande expirée (15 min). Relancez le paiement.' };
      }
      // Hors développement, le code de démonstration n'existe pas : personne ne
      // peut valider un paiement depuis l'application. Seul le webhook solde.
      if (import.meta.env.PROD) {
        return {
          ok: false,
          message: 'Le paiement est confirmé automatiquement par la passerelle. Rechargez la page dans un instant.',
        };
      }
      if (!checkWaveCode(payment.reference, code)) {
        return { ok: false, message: 'Code incorrect : vérifiez le code à 6 chiffres reçu après votre envoi.' };
      }
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId));
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

  /**
   * Horodatage du règlement.
   *
   * La colonne `settled_at` fait foi en comptabilité, et le navigateur n'a
   * pas le droit de l'écrire : c'est le serveur (clé de service) qui la pose
   * après avoir vérifié que l'appelant est du personnel. On ne fait donc
   * qu'un seul appel — et on reporte sa confirmation en local pour que
   * l'écran et la comptabilité locale voient le même état.
   */
  const settleOnServer = useCallback((paymentId: string, delayMs = 0) => {
    void (async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const result = await settlePaymentOnServer(paymentId);
      if (!result.ok) {
        // Échec assumé : l'encaissement n'est pas « validé », donc pas
        // comptabilisé. Aucun montant inventé.
        console.warn('[O RESTO] règlement non validé par le serveur —', result.error ?? 'raison inconnue');
        return;
      }
      const settledAt = result.settledAt ?? new Date().toISOString();
      setPayments((prev) => prev.map((p) => (
        p.id === paymentId ? { ...p, status: 'paid' as const, paidAt: p.paidAt ?? settledAt, settledAt } : p
      )));
    })();
  }, []);

  // Staff : encaisse les espèces → paiement soldé + abonnement activé.
  // N'accepte que cash avec subscriptionId (tickets Wave/OM/carte → coche manuelle).
  const confirmCashPayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending' || !payment.subscriptionId) return false;
      if (payment.method !== 'cash') return false;
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId));
      // L'horodatage de règlement, c'est le serveur qui le pose (seul habilité).
      settleOnServer(paymentId);
      activateSubscription(payment.subscriptionId);
      return true;
    },
    [payments, activateSubscription, settleOnServer],
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
      };      setPayments((prev) => [...prev, payment]);
      persist('oresto_payments', supabase.from('oresto_payments').insert({
        id: payment.id, subscription_id: payment.subscriptionId, client_username: sub.clientUsername,
        formula_id: sub.formulaId, amount: payment.amount, method: 'cash',
        status: 'paid', reference: payment.reference,
      }));
      // Le règlement est horodaté par le serveur : on lui laisse le temps de
      // voir la ligne qu'on vient d'écrire (l'insertion part en parallèle).
      settleOnServer(payment.id, 700);
      // Activation par la MÊME règle que les autres canaux : une période
      // future (réabonnement de fin de mois) garde ses bornes, et le quota
      // de repas repart de zéro (pas de report d'un mois sur l'autre).
      activateSubscription(subscriptionId);
      void setParentActive(sub.clientUsername, true);
      return payment;
    },
    [subscriptions, formulas, setParentActive, activateSubscription, settleOnServer],
  );

  // Staff (Caissier) : confirme la réception d'un paiement EXTERNE (Wave/OM/espèces/carte).
  // Coche manuelle : le caissier vérifie sur son téléphone Wave puis coche.
  // → paiement soldé + abonnement activé ou repas ticket crédités.
  const confirmManualPayment = useCallback(
    (paymentId: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment || payment.status !== 'pending') return false;
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId));
      settleOnServer(paymentId);
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
    [payments, activateSubscription, creditTicketMeals, settleOnServer],
  );

  // Annulation d'une réservation en attente (+ paiements en attente, tickets inclus)
  const cancelSubscription = useCallback(
    (subscriptionId: string) => {
      const target = subscriptions.find((s) => s.id === subscriptionId);
      setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId && s.status === 'pending' ? { ...s, status: 'cancelled' as const } : s)));
      setPayments((prev) => prev.map((p) => (p.subscriptionId === subscriptionId && p.status === 'pending' ? { ...p, status: 'cancelled' as const } : p)));
      persist('subscriptions', supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId));
      persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'cancelled' }).eq('subscription_id', subscriptionId));
      if (target) {
        // Annule aussi les tickets externes en attente du même client/formule + nettoie intents/codes
        persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'cancelled' })
          .eq('client_username', target.clientUsername).eq('formula_id', target.formulaId).eq('status', 'pending')
          );
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

  // Desactivation d'un abonnement actif (bouton "Inactif" du registre).
  const deactivateSubscription = useCallback(
    (subscriptionId: string) => {
      setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId ? { ...s, status: 'cancelled' as const } : s)));
      setPayments((prev) => prev.map((p) => (p.subscriptionId === subscriptionId && p.status === 'pending' ? { ...p, status: 'cancelled' as const } : p)));
      persist('subscriptions', supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId));
      persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'cancelled' }).eq('subscription_id', subscriptionId));
    },
    [subscriptions],
  );

  const reactivateSubscription = useCallback(
    (subscriptionId: string) => {
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) return;
      const start = sub.startDate ? new Date(sub.startDate) : new Date();
      const end = endOfThatMonth(start);
      const formula = formulas.find((f) => f.id === sub.formulaId);
      setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId ? { ...s, status: 'active' as const, endDate: end.toISOString(), mealsRemaining: formula?.mealsIncluded ?? s.mealsRemaining } : s)));
      persist('subscriptions', supabase.from('subscriptions').update({ status: 'active', end_date: end.toISOString() }).eq('id', subscriptionId));
    },
    [subscriptions, formulas],
  );

  /**
   * Réabonnement mensuel.
   *
   * On ne réutilise PAS la carte en cours : on prépare la PÉRIODE SUIVANTE
   * (lendemain de la fin, bornée à la fin de son mois). La carte actuelle
   * reste utilisable jusqu'à son terme, puis la nouvelle prend le relais.
   * Les repas non consommés ne se reportent jamais : la nouvelle période
   * repart du quota de la formule.
   */
  const renewSubscription = useCallback(
    (subscriptionId: string, method: ORestoPaymentMethod) => {
      // Renouvellement = nouvel abonnement : jamais payé avec la carte.
      if (method === 'balance') return null;
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) return null;
      // Garde : on ne renouvelle qu'un actif/expiré (pas pending/cancelled)
      if (sub.status === 'pending' || sub.status === 'cancelled') return null;
      const formula = formulas.find((f) => f.id === sub.formulaId);
      if (!formula) return null;
      const now = new Date();
      const currentEndMs = new Date(sub.endDate).getTime();
      const ownerKey = sub.childId ?? `parent:${sub.clientUsername}`;

      // Renouvellement déjà préparé (période future en attente ou déjà
      // payée) : on réutilise la même période au lieu d'en empiler une autre.
      const already = subscriptions.find(
        (s) =>
          s.id !== sub.id
          && (s.childId ?? `parent:${s.clientUsername}`) === ownerKey
          && s.formulaId === sub.formulaId
          && s.status !== 'cancelled'
          && new Date(s.startDate).getTime() > currentEndMs - 86400000,
      );
      if (already) {
        const pending = payments.find(
          (p) => p.subscriptionId === already.id && p.status === 'pending' && p.method === method,
        );
        if (pending) {
          const wave = isMobileMethod(method)
            ? initiateWavePayment(pending.amount, method, pending.reference)
            : undefined;
          return { payment: pending, wave };
        }
        if (already.status === 'active') return null;
        return null;
      }

      // Période suivante : le lendemain de la fin en cours, jamais avant.
      const start = nextPeriodStart(sub.endDate, now);
      const end = endOfThatMonth(start);
      const renewal: Subscription = {
        id: uid('S'),
        clientUsername: sub.clientUsername,
        formulaId: sub.formulaId,
        childId: sub.childId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: 'pending',
        mealsRemaining: formula.mealsIncluded,
        qrToken: sub.qrToken || (sub.childId
          ? childrenList.find((c) => c.id === sub.childId)?.qrToken ?? newQrToken()
          : newQrToken()),
      };
      setSubscriptions((prev) => [...prev, renewal]);
      const written = persist('subscriptions', supabase.from('subscriptions').insert({
        id: renewal.id,
        client_username: renewal.clientUsername,
        formula_id: renewal.formulaId,
        start_date: renewal.startDate,
        end_date: renewal.endDate,
        status: renewal.status,
        meals_remaining: renewal.mealsRemaining,
        qr_token: renewal.qrToken,
        child_id: renewal.childId ?? null,
      }));
      parentWrites.set(renewal.id, written);
      void written.finally(() => {
        parentWrites.delete(renewal.id);
      });

      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        subscriptionId: renewal.id,
        clientUsername: sub.clientUsername,
        formulaId: sub.formulaId,
        amount: formula.price,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      persist('oresto_payments', supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        client_username: sub.clientUsername,
        formula_id: sub.formulaId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
        child_id: sub.childId ?? null,
      }));
      // Espèces : le Caissier encaisse au comptoir (Abonnés & paiements).
      // Wave : code à 6 chiffres. OM/carte : coche manuelle (pas de code).
      if (!needsExternalConfirm(method)) return { payment };
      if (isMobileMethod(method)) {
        const wave = initiateWavePayment(formula.price, method, reference);
        return { payment, wave };
      }
      return { payment };
    },
    [subscriptions, formulas, payments, childrenList],
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
        throw new Error('Abonnement : paiement par carte impossible — payez via Wave ou en espèces. La carte sert aux tickets repas.');
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
        persist('wallet_transactions', supabase.from('wallet_transactions').insert({
          id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
          method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
        }));
        persist('wallets', supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
          );
        persist('oresto_payments', supabase.from('oresto_payments').insert({
          id: payment.id, subscription_id: payment.subscriptionId,
          client_username: clientUsername, formula_id: formulaId,
          amount: payment.amount, method: payment.method, status: payment.status,
          reference: payment.reference,
        }));
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
        persist('oresto_payments', supabase.from('oresto_payments').insert({
          id: payment.id,
          subscription_id: null,
          client_username: clientUsername,
          formula_id: formulaId,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
          reference: payment.reference,
          // Le ticket n'a pas d'abonnement : le webhook déduit le bénéficiaire
          // de ces colonnes, et c'est child_id qui fait la différence entre
          // deux enfants d'une même famille.
          child_id: childId ?? null,
          // QR du bénéficiaire : sans lui, un ticket payé pour un enfant sans
          // abonnement actif créerait un mini-abonnement au QR du parent.
          qr_token: childId
            ? childrenList.find((c) => c.id === childId)?.qrToken ?? newQrToken()
            : newQrToken(),
        }));
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
      persist('oresto_payments', supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: payment.subscriptionId,
        client_username: clientUsername,
        formula_id: formulaId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        reference: payment.reference,
      }));
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
        (s) => s.childId === childId && isLiveSub(s, nowTs),
      );
      let subscriptionId: string;
      if (active) {
        subscriptionId = active.id;
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === active.id ? { ...s, mealsRemaining: s.mealsRemaining + 1 } : s)),
        );
        persist('subscriptions', supabase.from('subscriptions').update({
          meals_remaining: active.mealsRemaining + 1,
        }).eq('id', active.id));
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
        persist('subscriptions', supabase.from('subscriptions').insert({
          id: pass.id,
          client_username: pass.clientUsername,
          formula_id: pass.formulaId,
          start_date: pass.startDate,
          end_date: pass.endDate,
          status: pass.status,
          meals_remaining: pass.mealsRemaining,
          qr_token: pass.qrToken,
          child_id: pass.childId ?? null,
        }));
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
      persist('wallet_transactions', supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
        method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
      }));
      persist('wallets', supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
        );
      persist('oresto_payments', supabase.from('oresto_payments').insert({
        id: payment.id, subscription_id: payment.subscriptionId,
        client_username: clientUsername, formula_id: payment.formulaId,
        amount: payment.amount, method: payment.method, status: payment.status,
        reference: payment.reference,
      }));
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
      // La commande part en attente : c'est le superviseur qui la sert au scan
      // du QR de l'élève. Sans cet état local, le service n'avait rien à voir.
      setKioskOrders((prev) => [...prev, kioskOrder]);
      // Persist wallet
      persist('wallet_transactions', supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
        method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
      }));
      persist('wallets', supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
        );
      // Persist kiosk order (best-effort)
      persist('kiosk_orders', supabase.from('kiosk_orders').insert({
        id: kioskOrder.id,
        child_id: childId,
        parent_username: clientUsername,
        items: kioskOrder.items,
        total: kioskOrder.total,
        status: 'pending',
        reference: orderRef,
        created_at: now.toISOString(),
        served_at: null,
      }));
      return { order: kioskOrder, balance: nextBalance };
    },
    [childrenList, wallets],
  );

  // Le superviseur confirme la remise au scan de l'élève : la commande passe
  // en servie (local + distant) et l'élève peut présenter de nouveau son QR
  // sans que la même commande soit resservie.
  const serveKioskOrder = useCallback((orderId: string) => {
    const nowIso = new Date().toISOString();
    setKioskOrders((prev) =>
      prev.map((o) => (o.id === orderId && o.status === 'pending' ? { ...o, status: 'served' as KioskOrderStatus, servedAt: nowIso } : o)),
    );
    persist('kiosk_orders', supabase.from('kiosk_orders')
      .update({ status: 'served', served_at: nowIso })
      .eq('id', orderId)
      );
  }, []);

  // Annulation d'une commande payée par carte et pas encore remise :
  // la commande passe en 'cancelled' et le montant débité revient sur la
  // carte prépayée de l'enfant. Une commande déjà servie ne s'annule pas.
  const cancelKioskOrder = useCallback(
    (orderId: string) => {
      const order = kioskOrders.find((o) => o.id === orderId);
      const balanceOf = (childId: string) => wallets.find((w) => w.childId === childId)?.balance ?? 0;
      if (!order) return { ok: false, message: 'Commande introuvable.', balance: 0 };
      if (order.status === 'cancelled') {
        return {
          ok: false,
          message: `Commande ${order.reference} déjà annulée.`,
          balance: balanceOf(order.childId),
        };
      }
      if (order.status === 'served') {
        return {
          ok: false,
          message: `Commande ${order.reference} déjà servie : annulation impossible, les articles ont été remis.`,
          balance: balanceOf(order.childId),
        };
      }

      const balance = balanceOf(order.childId);
      const nextBalance = balance + order.total;
      const now = new Date();
      const rand = Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase();
      const tx: WalletTx = {
        id: uid('W'),
        childId: order.childId,
        kind: 'refund',
        amount: order.total,
        method: 'card',
        status: 'paid',
        reference: `RFB-${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-${rand}`,
        label: `Annulation commande ${order.reference} — remboursement sur la carte`,
        createdAt: now.toISOString(),
      };

      setWalletTxs((prev) => [...prev, tx]);
      setWallets((prev) =>
        prev.map((w) => (w.childId === order.childId ? { ...w, balance: nextBalance } : w)),
      );
      setKioskOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' as KioskOrderStatus } : o)),
      );

      persist('wallet_transactions', supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: 'refund', amount: tx.amount,
        method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
      }));
      persist('wallets', supabase.from('wallets').upsert({ child_id: order.childId, balance: nextBalance })
        );
      persist('kiosk_orders', supabase.from('kiosk_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        );

      return {
        ok: true,
        message: `Commande ${order.reference} annulée — ${order.total} FCFA recrédités sur la carte. Nouveau solde : ${nextBalance} FCFA.`,
        balance: nextBalance,
      };
    },
    [kioskOrders, wallets],
  );

  // Créer un ticket visiteur (walk-in) pour le menu du jour — génère un QR TICKET-XXXXXX
  const createWalkInTicket = useCallback(
    (menu: WeeklyMenu, method: 'cash' | 'wave' | 'mobile_money') => {
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
          qrToken: newQrToken(),
        };
        if (!pendingSub) {
          setSubscriptions((prev) => [...prev, sub]);
          const written = persist('subscriptions', supabase.from('subscriptions').insert({
            id: sub.id, client_username: sub.clientUsername, formula_id: sub.formulaId,
            start_date: sub.startDate, end_date: sub.endDate, status: sub.status,
            meals_remaining: sub.mealsRemaining, qr_token: sub.qrToken,
          }));
          parentWrites.set(sub.id, written);
          void written.finally(() => {
            parentWrites.delete(sub.id);
          });
        }
        const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
        const payment: ORestoPayment = {
          id: uid('P'), subscriptionId: sub.id, amount: formula.price,
          method, status: 'paid', reference, createdAt: now.toISOString(),
        };
        setPayments((prev) => [...prev, payment]);
        void persistAfterParent('oresto_payments', payment.subscriptionId, () =>
          supabase.from('oresto_payments').insert({
            id: payment.id, subscription_id: payment.subscriptionId, client_username: name,
            formula_id: formulaId, amount: payment.amount, method: payment.method,
            status: 'paid', reference: payment.reference,
          }));
        // Activation par la règle commune : période du mois en cours et
        // quota NEUF (les repas d'un mois ne se reportent pas).
        activateSubscription(sub.id, sub);
        return { payment, addedMeals: formula.mealsIncluded, activated: true };
      }
      const pending = subscriptions.find(
        (s) => s.clientUsername === name && s.formulaId === formulaId && s.status === 'pending',
      );
      const sub = pending ?? subscribe(name, formulaId);
      const { payment, wave } = paySubscription(sub.id, method);
      return { payment, wave, addedMeals: 0, activated: false };
    },
    [formulas, subscriptions, subscribe, paySubscription, buyTicket, activateSubscription],
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
        persist('validations', supabase.from('validations').insert({
          id: validation.id,
          qr_token: validation.qrToken,
          client_username: validation.clientUsername,
          establishment_id: validation.establishmentId,
          status: 'rejected',
          reason: message,
          child_id: childId ?? null,
        }));
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
        persist('validations', supabase.from('validations').insert({
          id: validation.id,
          qr_token: validation.qrToken,
          client_username: validation.clientUsername,
          establishment_id: validation.establishmentId,
          status: 'accepted',
          reason: null,
          child_id: null,
        }));
        return { ok: true, message: 'Repas visiteur validé ✓', validation };
      }

      // QR enfant : carte prépayée (abonnement enfant d'abord, sinon débit wallet)
      const child = childrenList.find((c) => c.qrToken.toUpperCase() === token);
      if (child) {
        const childName = `${child.firstName} ${child.lastName}`;
         const nowMsChild = now.getTime();
         if (isParentInactive(child.parentUsername)) {
           return fail(`Compte parent inactif : contactez la cantine pour réactiver le compte.`, child.parentUsername, child.id);
         }
         const liveChildSub = subscriptions.find(
          (s) => s.childId === child.id && isLiveSub(s, nowMsChild),
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
          persist('subscriptions', supabase.from('subscriptions').update({ meals_remaining: liveChildSub.mealsRemaining - 1 }).eq('id', liveChildSub.id));
          persist('validations', supabase.from('validations').insert({
            id: validation.id, qr_token: token, client_username: validation.clientUsername,
            establishment_id: establishmentId, status: 'accepted', reason: null, child_id: child.id,
          }));
          return { ok: true, message: `Repas validé pour ${childName} (${child.className}). Repas restants : ${liveChildSub.mealsRemaining - 1}.`, validation };
        }
        // Carte prépayée : elle ne débite PLUS le repas. Sans abonnement
        // de repas actif, le service refuse — le parent règle son abonnement
        // depuis l'Accès Abonné (F2 27 000 / F3 32 000) via Wave ou Max it.
        return fail(
          `Aucun abonnement de repas actif pour ${childName} (${child.className}) — l'abonnement mensuel est à régler côté parent.`,
          child.parentUsername,
          child.id,
        );
      }

      // QR acceptés : on privilégie toujours un abonnement ACTIF et non expiré.
      // D'abord les actifs dont le token correspond, puis les personnels actifs,
      // puis seulement les inactifs (pour un message d'erreur précis).
      const nowMs = now.getTime();
      const isLive = (s: Subscription) => isLiveSub(s, nowMs);
      const candidates = subscriptions.filter(
        (s) => s.qrToken.toUpperCase() === token || isPersonalQrToken(s.clientUsername, token),
      );
      const sub = candidates.find((s) => isLive(s) && s.qrToken.toUpperCase() === token)
        ?? candidates.find((s) => isLive(s))
        ?? candidates.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))[0];
      if (!sub) return fail('QR Code inconnu : aucun abonnement associé.');
       if (sub.status !== 'active') return fail('Abonnement inactif ou expiré.', sub.clientUsername);
       if (isParentInactive(sub.clientUsername)) return fail(`Compte parent inactif : contactez la cantine pour réactiver le compte.`, sub.clientUsername);
       if (new Date(sub.endDate).getTime() < now.getTime()) {
        setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: 'expired' as const } : s)));
        persist('subscriptions', supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id));
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
      persist('subscriptions', supabase.from('subscriptions').update({ meals_remaining: sub.mealsRemaining - 1 }).eq('id', sub.id));
      persist('validations', supabase.from('validations').insert({
        id: validation.id,
        qr_token: validation.qrToken,
        client_username: validation.clientUsername,
        establishment_id: validation.establishmentId,
        status: validation.status,
        reason: validation.reason ?? null,
        child_id: sub.childId ?? null,
      }));
      return { ok: true, message: `Repas validé pour ${sub.clientUsername}. Repas restants : ${sub.mealsRemaining - 1}.`, validation };
    },
    [subscriptions, validations, formulas, childrenList],
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
            persist('subscriptions', supabase.from('subscriptions').update({ status: 'expired' }).eq('id', s.id)
              );
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
    persist('establishments', supabase.from('establishments').insert({
      id: created.id, name: created.name, address: created.address ?? null,
      manager: created.manager ?? null, phone: created.phone ?? null,
    }));
  }, []);

  const updateEstablishment = useCallback((id: string, updates: Partial<Establishment>) => {
    setEstablishments((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.address !== undefined) payload.address = updates.address ?? null;
    if (updates.manager !== undefined) payload.manager = updates.manager ?? null;
    if (updates.phone !== undefined) payload.phone = updates.phone ?? null;
    if (Object.keys(payload).length > 0) {
      persist('establishments', supabase.from('establishments').update(payload).eq('id', id));
    }
  }, []);

  const deleteEstablishment = useCallback((id: string) => {
    setEstablishments((prev) => prev.filter((e) => e.id !== id));
    persist('establishments', supabase.from('establishments').delete().eq('id', id));
  }, []);

  const addFormula = useCallback((f: Omit<Formula, 'id'>) => {
    const formula: Formula = { ...f, id: uid('F') };
    setFormulas((prev) => [...prev, formula]);
    persist('formulas', supabase.from('formulas').insert({
      id: formula.id,
      name: formula.name,
      description: formula.description,
      price: formula.price,
      old_price: formula.oldPrice ?? null,
      duration_days: formula.durationDays,
      meals_included: formula.mealsIncluded,
      rules: formula.rules ?? null,
      kind: formula.kind ?? 'subscription',
    }));
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
      persist('formulas', supabase.from('formulas').update(payload).eq('id', id));
    }
  }, []);

  const deleteFormula = useCallback((id: string) => {
    setFormulas((prev) => prev.filter((f) => f.id !== id));
    persist('formulas', supabase.from('formulas').delete().eq('id', id));
  }, []);

  // ================= Profil parent (fiche identité + contact) =================

  /**
   * Retrouve la fiche d'un parent à partir de N'IMPORTE QUEL identifiant :
   * son numéro (clé canonique), son nom d'utilisateur Auth, ou son ancien
   * identifiant. Un parent ne doit jamais avoir deux fiches.
   */
  const parentProfileOf = useCallback(
    (identifier: string) => {
      const key = (identifier ?? '').trim().toLowerCase();
      if (!key) return undefined;
      const digits = normalizeParentPhone(identifier);
      return parentProfiles.find(
        (p) =>
          p.parentUsername.toLowerCase() === key ||
          (p.authUsername ?? '').toLowerCase() === key ||
          (digits.length > 0 && p.phone === digits),
      );
    },
    [parentProfiles],
  );

  /**
   * Clé canonique d'un parent (son numéro) à partir de n'importe quel
   * identifiant. C'est cette clé qui rattache les enfants : elle ne doit
   * jamais dépendre de la façon dont le parent s'est connecté.
   */
  const parentKeyOf = useCallback(
    (identifier: string) => parentProfileOf(identifier)?.parentUsername ?? normalizeParentPhone(identifier),
    [parentProfileOf],
  );

  /**
   * Fiche identité d'un parent. L'IDENTIFIANT EST LE NUMÉRO : c'est la clé
   * que le parent utilise pour se connecter et celle à laquelle ses enfants
   * sont rattachés. Un parent ne peut donc avoir qu'une fiche par numéro —
   * une nouvelle fiche avec un autre identifiant pour la même personne
   * séparerait ses enfants de son accès.
   */
  const saveParentProfile = useCallback((parentUsername: string, firstName: string, lastName: string, phone: string) => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) throw new Error('Nom et prénom du parent requis');
    const digits = normalizeParentPhone(phone);
    if (!isValidParentPhone(digits)) {
      throw new Error('Numéro de téléphone invalide : 9 chiffres commençant par 6 ou 7 (ex 77 123 45 67).');
    }
    // L'identifiant = le numéro. Si l'appelant fournit un autre identifiant
    // (compte de démonstration, ancienne fiche), il est conservé comme
    // simple lien vers le compte Auth, jamais comme clé métier.
    const parent = digits;
    const authUser = parentUsername.trim().toLowerCase();
    const profile: ParentProfile = {
      parentUsername: parent,
      authUsername: authUser && authUser !== parent ? authUser : undefined,
      firstName: first, lastName: last,
      phone: digits, updatedAt: new Date().toISOString(),
    };
    setParentProfiles((prev) => {
      // On remplace aussi l'ancienne fiche rattachée au même compte Auth :
      // sans cela, le parent resterait « sans fiche » et serait renvoyé
      // vers le portail de saisie en boucle.
      const next = prev.filter(
        (p) => p.parentUsername !== parent && (profile.authUsername ? p.authUsername !== profile.authUsername : true),
      );
      return [...next, profile];
    });
    persist('parent_profiles', supabase.from('parent_profiles').upsert({
      parent_username: profile.parentUsername, first_name: profile.firstName,
      last_name: profile.lastName, phone: profile.phone,
    }));
    if (profile.authUsername) {
      persist('parent_profiles.auth_username', supabase
        .from('parent_profiles')
        .update({ auth_username: profile.authUsername })
        .eq('parent_username', profile.parentUsername));
    }
    return profile;
  }, []);

  // ================= Enfants + wallet QR (espace parents) =================

  /**
   * Enfants d'un parent. Le paramètre peut être le numéro (clé canonique),
   * le nom d'utilisateur Auth ou un ancien identifiant : on résout toujours
   * vers la clé canonique avant de filtrer.
   */
  const myChildren = useCallback(
    (parentIdentifier: string) => {
      const profile = parentProfileOf(parentIdentifier);
      const key = profile?.parentUsername ?? parentIdentifier.trim().toLowerCase();
      const digits = normalizeParentPhone(parentIdentifier);
      return childrenList
        .filter(
          (c) =>
            c.parentUsername === key ||
            (digits.length > 0 && c.parentUsername === digits),
        )
        .sort((a, b) => a.firstName.localeCompare(b.firstName));
    },
    [childrenList, parentProfileOf],
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

  /**
   * Inscrit un enfant et lui crée sa carte + son QR.
   *
   * Deux garde-fous :
   * 1. L'enfant est rattaché à la CLÉ CANONIQUE du parent (son numéro), pas
   *    au nom d'utilisateur de la session : sinon les enfants importés par
   *    la DAF et ceux créés par le parent ne seraient pas au même endroit.
   * 2. On refuse un enfant déjà inscrit (même parent, même prénom, même nom,
   *    même classe) : c'est la source des doublons d'enfants ET de QR
   *    Cartes que le personnel constatait.
   */
  const addChild = useCallback((parentIdentifier: string, firstName: string, lastName: string, className: string, cycle?: SchoolCycle) => {
    const first = firstName.trim();
    const last = lastName.trim();
    const cls = canonicalClassName(className);
    if (!first || !last || !cls) throw new Error('Nom, prénom et classe requis');
    const profile = parentProfileOf(parentIdentifier);
    if (!profile) {
      throw new Error('Complétez d’abord votre profil parent (nom, prénom et téléphone).');
    }
    const parent = profile.parentUsername;

    const key = childNaturalKey(parent, first, last, cls);
    const existing = childrenList.find(
      (c) => childNaturalKey(c.parentUsername, c.firstName, c.lastName, c.className) === key,
    );
    if (existing) {
      throw new Error(
        `${existing.firstName} ${existing.lastName} (${existing.className}) est déjà inscrit — son QR Carte existe déjà.`,
      );
    }

      const id = uid('C');
      const child: Child = {
        id, parentUsername: parent, firstName: first, lastName: last,
        className: cls, cycle: cycle ?? inferCycleFromClass(cls),
        qrToken: newQrToken(), createdAt: new Date().toISOString(),
      };
    setChildrenList((prev) => [...prev, child]);
    setWallets((prev) => [...prev, { childId: id, balance: 0 }]);
    // La carte référence l'élève : on écrit l'élève d'abord (voir
    // persistAfterParent) pour ne jamais perdre sa carte prépayée.
    const writtenChild = persist('children', supabase.from('children').insert({
      id: child.id, parent_username: child.parentUsername, first_name: child.firstName,
      last_name: child.lastName, class_name: child.className, cycle: child.cycle,
      qr_token: child.qrToken,
    }));
    parentWrites.set(child.id, writtenChild);
    void writtenChild.finally(() => {
      parentWrites.delete(child.id);
    });
    void persistAfterParent('wallets', child.id, () =>
      supabase.from('wallets').upsert({ child_id: id, balance: 0 }));
    return child;
  }, [childrenList, parentProfileOf]);

  // ================= Import Excel (admin) =================

  /**
   * Inscription d'une ligne d'import, avec écritures VÉRIFIÉES.
   *
   * Contrairement à addChild (tire-et-oublie, pensé pour un clic humain),
   * chaque écriture est attendue ici : un import de 200 élèves doit dire
   * exactement lesquels sont passés.
   *
   * Règles :
   * - le parent est identifié par son NUMÉRO (son futur identifiant de
   *   connexion). On le crée si besoin, et on le rattache à ce numéro ;
   * - un enfant déjà inscrit (même parent, même prénom, nom, classe) n'est
   *   PAS réinscrit : on renvoie l'existant, sans créer un second QR.
   */
  const importStudentRow = useCallback(
    async (row: {
      parentUsername: string;
      parentNom: string;
      parentPrenom: string;
      parentTel: string;
      prenom: string;
      nom: string;
      classe: string;
      cycle: SchoolCycle;
    }): Promise<{ childId: string; parentCreated: boolean; duplicate: boolean }> => {
      // Identité canonique = numéro de téléphone du parent.
      const digits = normalizeParentPhone(row.parentTel) || normalizeParentPhone(row.parentUsername);
      if (!isValidParentPhone(digits)) {
        throw new Error(
          `Parent « ${row.parentUsername || row.parentTel || 'inconnu'} » : numéro de téléphone obligatoire (9 chiffres, ex 77 123 45 67) — c'est son identifiant de connexion.`,
        );
      }
      const parent = digits;
      let parentCreated = false;

      const existingProfile = parentProfileOf(parent);
      if (!existingProfile) {
        if (!row.parentNom.trim() || !row.parentPrenom.trim()) {
          throw new Error(`Parent ${formatParentPhone(parent)} inconnu : nom et prénom requis pour le créer.`);
        }
        const profile: ParentProfile = {
          parentUsername: parent,
          firstName: row.parentPrenom.trim(),
          lastName: row.parentNom.trim(),
          phone: parent,
          updatedAt: new Date().toISOString(),
        };
        const { error: profileError } = await supabase.from('parent_profiles').upsert({
          parent_username: profile.parentUsername,
          first_name: profile.firstName,
          last_name: profile.lastName,
          phone: profile.phone,
        });
        if (profileError) throw new Error(`Parent ${formatParentPhone(parent)} : ${profileError.message}`);
        setParentProfiles((prev) => {
          const next = prev.filter((p) => p.parentUsername !== parent);
          return [...next, profile];
        });
        parentCreated = true;
      }

      const firstName = row.prenom.trim();
      const lastName = row.nom.trim();
      const className = canonicalClassName(row.classe);
      const key = childNaturalKey(parent, firstName, lastName, className);
      const existingChild = childrenList.find(
        (c) => childNaturalKey(c.parentUsername, c.firstName, c.lastName, c.className) === key,
      );
      if (existingChild) {
        return { childId: existingChild.id, parentCreated, duplicate: true };
      }

      const id = uid('C');
      const child: Child = {
        id,
        parentUsername: parent,
        firstName,
        lastName,
        className,
        cycle: row.cycle ?? inferCycleFromClass(className),
        qrToken: getChildQrToken(id),
        createdAt: new Date().toISOString(),
      };
      const { error: childError } = await supabase.from('children').insert({
        id: child.id,
        parent_username: child.parentUsername,
        first_name: child.firstName,
        last_name: child.lastName,
        class_name: child.className,
        cycle: child.cycle,
        qr_token: child.qrToken,
      });
      if (childError) throw new Error(`${child.firstName} ${child.lastName} : ${childError.message}`);
      const { error: walletError } = await supabase.from('wallets').upsert({ child_id: id, balance: 0 });
      if (walletError) throw new Error(`${child.firstName} ${child.lastName} (portefeuille) : ${walletError.message}`);
      setChildrenList((prev) => [...prev, child]);
      setWallets((prev) => [...prev, { childId: id, balance: 0 }]);
      return { childId: id, parentCreated, duplicate: false };
    },
    [childrenList, parentProfileOf],
  );

  const updateChild = useCallback((id: string, updates: Partial<Pick<Child, 'firstName' | 'lastName' | 'className' | 'cycle'>>) => {
    setChildrenList((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    const payload: Record<string, unknown> = {};
    if (updates.firstName !== undefined) payload.first_name = updates.firstName;
    if (updates.lastName !== undefined) payload.last_name = updates.lastName;
    if (updates.className !== undefined) payload.class_name = updates.className;
    if (updates.cycle !== undefined) payload.cycle = updates.cycle;
    if (Object.keys(payload).length > 0) {
      persist('children', supabase.from('children').update(payload).eq('id', id));
    }
  }, []);

  const deleteChild = useCallback((id: string) => {
    setChildrenList((prev) => prev.filter((c) => c.id !== id));
    setWallets((prev) => prev.filter((w) => w.childId !== id));
    setWalletTxs((prev) => prev.filter((t) => t.childId !== id));
    persist('children', supabase.from('children').delete().eq('id', id));
  }, []);

  /**
   * Suppression DÉFINITIVE d'un compte parent — permise au Superviseur
   * et au DG (Espace ISM), vérifiée au serveur.
   *
   * Le travail lourd (compte d'authentification, réclamations, kiosque,
   * portefeuilles, enfants, profil) est fait PAR LE SERVEUR : chaque étape y
   * est faite dans l'ordre des clés étrangères, et seul lui peut supprimer
   * une identité Auth — le navigateur n'en a ni la clé, ni le droit.
   *
   * Les règlements `oresto_payments` ne sont PAS retirés — ni côté serveur,
   * ni ici : ils sont la comptabilité de la cantine, ils survivent au compte.
   * (Le serveur a déjà purgé les données à distance : on ne nettoie que
   * l'état local. Mode hors-ligne : tout se passe chez soi, en dev.)
   */
  const deleteParent = useCallback(async (username: string) => {
    const key = username.trim().toLowerCase();
    if (!key) return { ok: false, error: 'Compte inconnu.' };

    // Garde-fou simple — on ne se supprime pas soi-même. Les rôles autorisés
    // et l'ordre des clés étrangères sont vérifiés au serveur, seule source
    // de vérité.
    const localOnlyCleanup = () => {
      const childrenToDelete = childrenList.filter((c) => c.parentUsername === key);
      childrenToDelete.forEach((child) => {
        setChildrenList((prev) => prev.filter((c) => c.id !== child.id));
        setWallets((prev) => prev.filter((w) => w.childId !== child.id));
        setWalletTxs((prev) => prev.filter((t) => t.childId !== child.id));
      });

      // Supprimer les abonnements ET les validations du parent.
      setSubscriptions((prev) => prev.filter((s) => s.clientUsername !== key));
      setValidations((prev) => prev.filter((v) => v.clientUsername !== key));

      // Retirer ses réclamations de l'état local (le serveur a déjà purgé).
      setComplaints((prev) => prev.filter((c) => c.clientUsername !== key));

      // Supprimer le profil parent.
      setParentProfiles((prev) => prev.filter((p) => p.parentUsername !== key));

      // PAS de suppression des paiements : historique comptable.
    };

    if (!isSupabaseConfigured) {
      localOnlyCleanup();
      return { ok: true };
    }

    const server = await postAdminJson(
      '/api/auth/delete-user',
      { username: key },
    );
    if (!server.ok) {
      return { ok: false, error: server.error ?? 'Suppression impossible.' };
    }
    localOnlyCleanup();
    return { ok: true };
  }, [childrenList]);

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
        persist('wallet_transactions', supabase.from('wallet_transactions').insert({
          id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
          method: tx.method, status: 'paid', reference: tx.reference, label: tx.label,
        }));
        persist('wallets', supabase.from('wallets').upsert({ child_id: childId, balance: walletOf(childId) + amount })
          );
        return { tx };
      }
      const tx: WalletTx = {
        id: uid('W'), childId, kind: 'topup', amount, method,
        status: 'pending', reference, label: `Recharge ${child.firstName} ${child.lastName}`,
        createdAt: now.toISOString(),
      };
      setWalletTxs((prev) => [...prev, tx]);
      persist('wallet_transactions', supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: tx.childId, kind: tx.kind, amount: tx.amount,
        method: tx.method, status: 'pending', reference: tx.reference, label: tx.label,
        // Le webhook SycaPay crédite cette recharge par sa référence.
        provider: isProviderMethod(method) ? paymentProviderId : null,
      }));
      if (isMobileMethod(method)) {
        const wave = initiateWavePayment(amount, method, reference);
        return { tx, wave };
      }
      return { tx };
    },
    [childrenList, walletOf, paymentProviderId],
  );

  /** Recharge plusieurs cartes enfants en une fois : un seul paiement Wave/OM, plusieurs crédits. */
  const topUpMulti = useCallback(
    (clientUsername: string, items: { childId: string; amount: number }[], method: ORestoPaymentMethod) => {
      if (!items.length) throw new Error('Sélectionnez au moins un enfant.');
      const total = items.reduce((acc, i) => acc + i.amount, 0);
      if (!Number.isFinite(total) || total <= 0) throw new Error('Montant total invalide.');
      if (method !== 'wave' && method !== 'mobile_money') throw new Error('Paiement en ligne requis (Wave / Orange Money).');
      const now = new Date();
      const reference = `TOP-${Date.now().toString(36).toUpperCase()}`;
      const payment: ORestoPayment = {
        id: uid('P'),
        clientUsername,
        formulaId: 'TOPUP-MULTI',
        amount: total,
        method,
        status: 'pending',
        reference,
        createdAt: now.toISOString(),
      };
      setPayments((prev) => [...prev, payment]);
      persist('oresto_payments', supabase.from('oresto_payments').insert({
        id: payment.id,
        subscription_id: null,
        client_username: clientUsername,
        formula_id: 'TOPUP-MULTI',
        amount: total,
        method: payment.method,
        status: 'pending',
        reference,
      }));
      const wave = isMobileMethod(method) ? initiateWavePayment(total, method, reference) : undefined;
      const txs: WalletTx[] = items.map((item, index) => {
        const child = childrenList.find((c) => c.id === item.childId);
        const tx: WalletTx = {
          id: uid('W'),
          childId: item.childId,
          kind: 'topup',
          amount: item.amount,
          method,
          status: 'pending',
          reference: `${reference}-${index}`,
          paymentId: payment.id,
          label: `Recharge ${child?.firstName ?? ''} ${child?.lastName ?? ''}`,
          createdAt: now.toISOString(),
        };
        setWalletTxs((prev) => [...prev, tx]);
        persist('wallet_transactions', supabase.from('wallet_transactions').insert({
          id: tx.id,
          child_id: tx.childId,
          kind: tx.kind,
          amount: tx.amount,
          method: tx.method,
          status: 'pending',
          reference: tx.reference,
          label: tx.label,
          payment_id: payment.id,
          provider: isProviderMethod(method) ? paymentProviderId : null,
        }));
        return tx;
      });
      return { payment, wave, txs };
    },
    [childrenList, paymentProviderId],
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
    persist('wallet_transactions', supabase.from('wallet_transactions').update({ status: 'paid' }).eq('id', txId)
      );
    persist('wallets', supabase.from('wallets').upsert({ child_id: tx.childId, balance: walletOf(tx.childId) + tx.amount })
      );
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
    // Hors développement, le code de démonstration n'existe pas : une recharge
    // ne se solde jamais depuis l'application, seulement par le webhook.
    if (import.meta.env.PROD) {
      return {
        ok: false,
        message: 'La recharge est confirmée automatiquement par la passerelle. Rechargez la page dans un instant.',
      };
    }
    const created = new Date(tx.createdAt).getTime();
    if (Number.isFinite(created) && Date.now() - created > WAVE_TTL_MS) {
      setWalletTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, status: 'failed' as const } : t)));
      persist('wallet_transactions', supabase.from('wallet_transactions').update({ status: 'failed' }).eq('id', txId)
        );
      return { ok: false, message: 'Demande expirée (15 min). Relancez la recharge.' };
    }
    if (!checkWaveCode(tx.reference, code)) {
      return { ok: false, message: 'Code incorrect : vérifiez le code à 6 chiffres.' };
    }
    clearWaveCode(tx.reference);
    creditWalletTx(txId);
    return { ok: true, message: `Recharge confirmée : +${tx.amount} FCFA sur la carte.` };
  }, [walletTxs, creditWalletTx]);

  /**
   * Recharge GROUPÉE (plusieurs enfants, un seul paiement) : vérifie le code
   * sur la référence du paiement, puis crédite chacune des cartes.
   */
  const confirmWalletTopUpGroup = useCallback(
    (paymentId: string, code: string) => {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment) return { ok: false, message: 'Paiement introuvable.' };
      if (payment.status === 'paid') return { ok: true, message: 'Recharge déjà confirmée.' };
      if (payment.status !== 'pending') return { ok: false, message: 'Cette recharge ne peut plus être confirmée.' };
      if (import.meta.env.PROD) {
        return {
          ok: false,
          message: 'La recharge est confirmée automatiquement par la passerelle. Rechargez la page dans un instant.',
        };
      }
      const created = new Date(payment.createdAt).getTime();
      if (Number.isFinite(created) && Date.now() - created > WAVE_TTL_MS) {
        setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'failed' as const } : p)));
        persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'failed' }).eq('id', paymentId));
        return { ok: false, message: 'Demande expirée (15 min). Relancez la recharge.' };
      }
      if (!checkWaveCode(payment.reference, code)) {
        return { ok: false, message: 'Code incorrect : vérifiez le code à 6 chiffres.' };
      }
      clearWaveCode(payment.reference);
      const group = walletTxs.filter((t) => t.paymentId === paymentId && t.status === 'pending');
      if (group.length === 0) return { ok: false, message: 'Aucune carte à créditer.' };

      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid' as const } : p)));
      persist('oresto_payments', supabase.from('oresto_payments').update({ status: 'paid' }).eq('id', paymentId));
      const ids = new Set(group.map((t) => t.id));
      setWalletTxs((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, status: 'paid' as const } : t)));
      setWallets((prev) => {
        let next = [...prev];
        for (const t of group) {
          const cur = next.find((w) => w.childId === t.childId)?.balance ?? 0;
          next = [...next.filter((w) => w.childId !== t.childId), { childId: t.childId, balance: cur + t.amount }];
        }
        return next;
      });
      for (const t of group) {
        persist('wallet_transactions', supabase.from('wallet_transactions').update({ status: 'paid' }).eq('id', t.id));
        persist('wallets', supabase.from('wallets').upsert({
          child_id: t.childId,
          balance: (wallets.find((w) => w.childId === t.childId)?.balance ?? 0) + t.amount,
        }));
      }
      const total = group.reduce((sum, t) => sum + t.amount, 0);
      return {
        ok: true,
        message: `${group.length} carte(s) rechargée(s) — ${total} FCFA au total.`,
      };
    },
    [payments, walletTxs, wallets],
  );

  // ---------- Caisse : scan du QR élève puis débit sur sa carte prépayée ----------

  /**
   * Résout un QR scanné à la caisse vers un élève abonné.
   * Accepte le QR de l'enfant, le QR d'abonnement ou le QR personnel du parent.
   */
  const resolveChildQr = useCallback(
    (qrToken: string) => {
      const token = qrToken.trim().toUpperCase();
      const none = { ok: false, message: 'QR Code inconnu : aucun élève associé.', balance: 0 };
      if (!token) return none;

      const nowMs = Date.now();
      // 1. QR direct d'un enfant
      let child = childrenList.find((c) => (c.qrToken ?? '').toUpperCase() === token);
      // 2. QR d'abonnement rattaché à un enfant
      if (!child) {
        const sub = subscriptions.find((s) => (s.qrToken ?? '').toUpperCase() === token);
        if (sub?.childId) child = childrenList.find((c) => c.id === sub.childId);
      }
      // 3. QR personnel d'un parent : on retient d'abord l'enfant abonné,
      //    sinon celui dont la carte prépayée a encore du crédit.
      if (!child) {
        const parent = parentProfiles.find((p) => isPersonalQrToken(p.parentUsername, token));
        if (parent) {
          const freres = childrenList.filter((c) => c.parentUsername === parent.parentUsername);
          child =
            freres.find((c) =>
              subscriptions.some((s) => s.childId === c.id && isLiveSub(s, nowMs)),
            ) ??
            freres.find((c) => (wallets.find((w) => w.childId === c.id)?.balance ?? 0) > 0);
        }
      }
      if (!child) return none;

      const subscription = subscriptions.find(
        (s) => s.childId === child!.id && isLiveSub(s, nowMs),
      );
      const balance = wallets.find((w) => w.childId === child!.id)?.balance ?? 0;
      const childName = `${child.firstName} ${child.lastName}`;

      if (!subscription) {
        // Pas d'abonnement actif, mais une carte prépayée créditée : l'élève
        // peut être servi au comptoir, l'argent est déjà sur la carte. La
        // validation d'un repas, elle, continue d'exiger l'abonnement.
        if (balance <= 0) {
          return {
            ok: false,
            message: `${childName} n'a pas d'abonnement actif et sa carte est vide : vente impossible.`,
            child,
            balance,
          };
        }
        return {
          ok: true,
          message: `${childName} · ${child.className} — sans abonnement, carte prépayée à ${balance} FCFA.`,
          child,
          balance,
        };
      }
      return {
        ok: true,
        message: `${childName} · ${child.className} — abonné, carte à ${balance} FCFA.`,
        child,
        subscription,
        balance,
      };
    },
    [childrenList, subscriptions, wallets, parentProfiles],
  );

  /**
   * Débite le panier de la caisse sur la carte prépayée de l'élève scanné.
   * L'élève ne paie donc rien par Wave : la vente est imputée sur sa carte.
   * La commande est créée « en attente » : elle n'est remise qu'au scan du QR
   * de l'élève par le superviseur (bouton « Servir »).
   */
  const sellToChildCard = useCallback(
    (
      childId: string,
      items: { productId: string; productName: string; price: number; qty: number }[],
      cashier?: string,
    ) => {
      const child = childrenList.find((c) => c.id === childId);
      if (!child) return { ok: false, message: 'Élève introuvable.', balance: 0 };
      if (!items.length) return { ok: false, message: 'Panier vide.', balance: 0 };

      const nowMs = Date.now();
      // L'abonnement n'est plus une condition de vente : la carte prépayée
      // suffit. Il ne sert qu'à préciser la provenance du crédit.
      const subscription = subscriptions.find(
        (s) => s.childId === childId && isLiveSub(s, nowMs),
      );

      const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
      const balance = wallets.find((w) => w.childId === childId)?.balance ?? 0;
      if (balance < total) {
        return {
          ok: false,
          message: `Solde insuffisant sur la carte de ${child.firstName} (${balance} FCFA, ${total} FCFA requis).`,
          balance,
        };
      }

      const now = new Date();
      const nextBalance = balance - total;
      const reference = `POS-${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const label = `Vente POS ${child.firstName} ${child.lastName} — ${items.map((i) => `${i.productName}×${i.qty}`).join(', ')}`;

      const tx: WalletTx = {
        id: uid('W'), childId, kind: 'debit', amount: total, method: 'card',
        status: 'paid', reference, label, createdAt: now.toISOString(),
      };
      setWalletTxs((prev) => [...prev, tx]);
      setWallets((prev) => prev.map((w) => (w.childId === childId ? { ...w, balance: nextBalance } : w)));
      persist('wallet_transactions', supabase.from('wallet_transactions').insert({
        id: tx.id, child_id: childId, kind: 'debit', amount: total,
        method: 'card', status: 'paid', reference, label,
      }));
      persist('wallets', supabase.from('wallets').upsert({ child_id: childId, balance: nextBalance })
        );

      // La vente est PAYÉE mais pas encore remise : elle part en « en attente ».
      // C'est l'élève qui présente son QR au superviseur, qui voit la commande
      // et clique sur « Servir ». Tant qu'elle n'est pas servie, le caissier
      // (ou le superviseur) peut l'annuler → remboursement sur la carte.
      const orderId = uid('K');
      const comptoirItems = items.map((it) => ({ productId: it.productId, name: it.productName, price: it.price, qty: it.qty }));
      const newOrder: KioskOrder = {
        id: orderId, childId, parentUsername: child.parentUsername,
        items: comptoirItems, total, status: 'pending' as KioskOrderStatus,
        reference, createdAt: now.toISOString(),
      };
      setKioskOrders((prev) => [...prev, newOrder]);
      persist('kiosk_orders', supabase.from('kiosk_orders').insert({
        id: orderId,
        child_id: childId,
        parent_username: child.parentUsername,
        items: comptoirItems,
        total,
        status: 'pending',
        reference,
        created_at: now.toISOString(),
        served_at: null,
      }));

      return {
        ok: true,
        message: `${total} FCFA débités sur la carte de ${child.firstName} ${child.lastName}${subscription ? '' : ' (sans abonnement)'} · nouveau solde : ${nextBalance} FCFA. Commande ${reference} à retirer au scan.`,
        reference,
        balance: nextBalance,
        order: newOrder,
      };
    },
    [childrenList, subscriptions, wallets],
  );

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
    persist('wallet_transactions', supabase.from('wallet_transactions').insert({
      id: tx.id, child_id: tx.childId, kind: 'debit', amount: tx.amount,
      method: 'card', status: 'paid', reference: tx.reference, label: tx.label,
    }));
    persist('wallets', supabase.from('wallets').upsert({ child_id: childId, balance: balance - amount })
      );
    return true;
  }, [wallets]);

  const setFinanceSettings = useCallback((s: Partial<FinanceSettings>) => {
    setFinanceSettingsState((prev) => {
      const next = { ...prev, ...s };
      persist('finance_settings', supabase.from('finance_settings').upsert([
        { key: 'ism_subscription_pct', value: String(next.ismSubscriptionPct) },
        { key: 'school_per_subscription', value: String(next.schoolPerSubscription) },
        { key: 'other_sales_pct', value: String(next.otherSalesPct) },
        { key: 'touchpoint_pct', value: String(next.touchpointPct) },
        { key: 'sycapay_pct', value: String(next.sycapayPct) },
        { key: 'paydounya_pct', value: String(next.paydounyaPct) },
        { key: 'ism_per_subscription', value: String(next.ismPerSubscription) },
        { key: 'ism_sales_pct', value: String(next.ismSalesPct) },
      ]));
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
    persist('finance_expenses', supabase.from('finance_expenses').insert({
      id: expense.id, label: expense.label, category: expense.category,
      amount: expense.amount, spent_at: expense.spentAt, created_by: expense.createdBy ?? null,
    }));
    return expense;
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setFinanceExpenses((prev) => prev.filter((e) => e.id !== id));
    persist('finance_expenses', supabase.from('finance_expenses').delete().eq('id', id));
  }, []);

  // ---------- Réclamations : fil privé parent ↔ superviseur + annonces ----------

  /** Référence courte lisible : REC-2607-A1B2. */
  function complaintReference(): string {
    const yy = new Date().getFullYear().toString().slice(2);
    const mm = new Date().getMonth() + 1;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REC-${yy}${String(mm).padStart(2, '0')}-${rand}`;
  }

  /** Insertion locale + distante best-effort (identique au reste du contexte). */
  const pushComplaintMessage = useCallback(
    (message: ComplaintMessage) => {
      setComplaintMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message],
      );
      persist('reclamation_messages', supabase
        .from('reclamation_messages')
        .insert({
          id: message.id,
          complaint_id: message.complaintId,
          author_username: message.authorUsername,
          author_role: message.authorRole,
          body: message.body,
          photo_path: message.photoPath ?? null,
        })
        );
      return message;
    },
    [],
  );

  const addComplaint = useCallback(
    (input: {
      clientUsername: string;
      childId?: string;
      category: ComplaintCategory;
      subject: string;
      body: string;
      photoPath?: string;
    }) => {
      const subject = input.subject.trim();
      const body = input.body.trim();
      if (!subject) throw new Error('Objet requis');
      if (!body) throw new Error('Message requis');
      const now = new Date().toISOString();
      const complaint: Complaint = {
        id: uid('REC'),
        reference: complaintReference(),
        clientUsername: input.clientUsername,
        childId: input.childId,
        category: input.category,
        subject,
        status: 'open',
        isAnnouncement: false,
        createdAt: now,
        updatedAt: now,
      };
      setComplaints((prev) => [complaint, ...prev]);
      persist('reclamations', supabase
        .from('reclamations')
        .insert({
          id: complaint.id,
          reference: complaint.reference,
          client_username: complaint.clientUsername,
          child_id: complaint.childId ?? null,
          category: complaint.category,
          subject: complaint.subject,
          status: complaint.status,
          is_announcement: false,
        })
        );
      pushComplaintMessage({
        id: uid('MSG'),
        complaintId: complaint.id,
        authorUsername: input.clientUsername,
        authorRole: 'client',
        body,
        photoPath: input.photoPath,
        createdAt: now,
      });
      return complaint;
    },
    [pushComplaintMessage],
  );

  const replyComplaint = useCallback(
    (
      complaintId: string,
      authorUsername: string,
      authorRole: 'client' | 'staff',
      body: string,
      photoPath?: string,
    ) => {
      const clean = body.trim();
      if (!clean) throw new Error('Message requis');
      const now = new Date().toISOString();
      // Une réponse du superviseur sur un fil « nouvelle » le passe « en cours ».
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === complaintId
            ? {
                ...c,
                status: c.status === 'open' && authorRole === 'staff' ? 'in_progress' : c.status,
                updatedAt: now,
              }
            : c,
        ),
      );
      persist('reclamations', supabase
        .from('reclamations')
        .update(
          authorRole === 'staff'
            ? { updated_at: now, status: 'in_progress' }
            : { updated_at: now },
        )
        .eq('id', complaintId)
        );
      return pushComplaintMessage({
        id: uid('MSG'),
        complaintId,
        authorUsername,
        authorRole,
        body: clean,
        photoPath,
        createdAt: now,
      });
    },
    [pushComplaintMessage],
  );

  const setComplaintStatus = useCallback((complaintId: string, status: ComplaintStatus) => {
    const now = new Date().toISOString();
    setComplaints((prev) =>
      prev.map((c) =>
        c.id === complaintId
          ? {
              ...c,
              status,
              updatedAt: now,
              resolvedAt: status === 'resolved' || status === 'rejected' ? now : undefined,
            }
          : c,
      ),
    );
    persist('reclamations', supabase
      .from('reclamations')
      .update({
        status,
        updated_at: now,
        resolved_at: status === 'resolved' || status === 'rejected' ? now : null,
      })
      .eq('id', complaintId)
      );
  }, []);

  /** Annonce publique : visible par tous les parents, pas rattachée à un parent. */
  const publishAnnouncement = useCallback(
    (authorUsername: string, subject: string, body: string) => {
      const cleanSubject = subject.trim();
      const cleanBody = body.trim();
      if (!cleanSubject) throw new Error('Objet requis');
      if (!cleanBody) throw new Error('Message requis');
      const now = new Date().toISOString();
      const complaint: Complaint = {
        id: uid('ANN'),
        reference: complaintReference(),
        clientUsername: authorUsername,
        category: 'other',
        subject: cleanSubject,
        status: 'resolved',
        isAnnouncement: true,
        createdAt: now,
        updatedAt: now,
      };
      setComplaints((prev) => [complaint, ...prev]);
      persist('reclamations', supabase
        .from('reclamations')
        .insert({
          id: complaint.id,
          reference: complaint.reference,
          client_username: authorUsername,
          category: complaint.category,
          subject: complaint.subject,
          status: complaint.status,
          is_announcement: true,
        })
        );
      pushComplaintMessage({
        id: uid('MSG'),
        complaintId: complaint.id,
        authorUsername,
        authorRole: 'staff',
        body: cleanBody,
        createdAt: now,
      });
      return complaint;
    },
    [pushComplaintMessage],
  );

  const myComplaints = useCallback(
    (username: string) =>
      complaints
        .filter((c) => c.clientUsername === username && !c.isAnnouncement)
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [complaints],
  );

  const messagesOf = useCallback(
    (complaintId: string) =>
      complaintMessages
        .filter((m) => m.complaintId === complaintId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [complaintMessages],
  );

  const updateWeeklyMenu = useCallback((day: WeeklyMenu['day'], name: string, description: string, items: WeeklyMenuItem[] = [], price?: number) => {
    const clean = items
      .filter((it) => it && typeof it.name === 'string')
      .map((it) => ({ name: it.name.trim().slice(0, 60), price: Math.max(0, Math.floor(Number(it.price) || 0)) }))
      .filter((it) => it.name)
      .slice(0, 8);
    const dayPrice = Math.max(0, Math.floor(Number(price) || 0));
    setWeeklyMenus((prev) => prev.map((m) => (m.day === day ? { ...m, name, description, items: clean, price: dayPrice } : m)));
    // Persistance : l'état local est optimiste (affichage immédiat). On écrit
    // en base sans jamais avaler l'erreur en silence.
    void (async () => {
      const { error } = await supabase
        .from('weekly_menus')
        .upsert({ day, name, description, items: clean, price: dayPrice });
      if (!error) return;
      // Colonne `price` absente (base non migrée) : on réessaie sans elle, en
      // repliant le prix du jour dans les plats pour que les parents / la
      // caisse voient le bon total et que la publication soit bien partagée.
      const { error: retryError } = await supabase
        .from('weekly_menus')
        .upsert({ day, name, description, items: foldDayPriceIntoItems(clean, dayPrice) });
      if (retryError) {
        console.warn(`[menus] Publication de ${day} non enregistrée en base :`, retryError.message);
      }
    })();
  }, []);

  const nowMsStats = Date.now();
  const stats = {
    activeClients: subscriptions.filter((s) => isLiveSub(s, nowMsStats)).length,
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
        subscribeBundle,
        paySubscription,
        confirmMobilePayment,
        resumeMobilePayment,
        confirmCashPayment,
        collectCashPayment,
        confirmManualPayment,
        cancelSubscription,
        deactivateSubscription,
        reactivateSubscription,
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
        parentKeyOf,
        saveParentProfile,
        walletOf,
        resolveChildQr,
        sellToChildCard,
        childTxs,
        addChild,
        importStudentRow,
        updateChild,
        deleteChild,
        deleteParent,
        topUpChild,
        confirmWalletTopUp,
        confirmWalletTopUpMobile,
        confirmWalletTopUpGroup,
        inactiveParents,
        isParentInactive,
        setParentActive,
        dayTicket,
        setDayTicketPublished,
        buyDayTicket,
        topUpMulti,
        creditWalletTx,
        debitWallet,
        paymentProviderId,
        providerLabel,
        openProviderPayment,
        syncPaymentFromProvider,
        refreshRemote,
        setFinanceSettings,
        financeExpenses,
        addExpense,
        deleteExpense,
        weeklyMenus,
        updateWeeklyMenu,
        createWalkInTicket,
        walkInTickets,
        kioskOrders,
        serveKioskOrder,
        cancelKioskOrder,
        complaints,
        complaintMessages,
        addComplaint,
        replyComplaint,
        setComplaintStatus,
        publishAnnouncement,
        myComplaints,
        messagesOf,
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
