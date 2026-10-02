export interface ProductOption {
  id: string;
  name: string;
  choices: string[];
}

export interface ProductExtra {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  image?: string;
  available?: boolean;
  options?: ProductOption[];
  extras?: ProductExtra[];
}

export interface CartItem extends Product {
  quantity: number;
  selectedOptions?: string[];
  selectedExtras?: ProductExtra[];
}

export interface OrderExtra {
  extra: ProductExtra;
  quantity: number;
}

export interface Order {
  id: string;
  number: string;
  items: CartItem[];
  extras?: OrderExtra[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  type: 'dine-in' | 'takeaway';
  createdAt: Date;
  paymentMethod?: string;
  customerName?: string;
  amountReceived?: number;
  change?: number;
}

export type PageName =
  | 'home'
  | 'menus'
  | 'subscription'
  | 'subscriptions'
  | 'qrcode'
  | 'history'
  | 'profile'
  | 'dashboard'
  | 'validation'
  | 'menu'
  | 'pos'
  | 'payment'
  | 'receipt'
  | 'orders'
  | 'users'
  | 'settings'
  | 'establishments'
  | 'children'
  | 'finance'
  | 'qrgallery';

// ---------- O RESTO — modèle issu du cahier des charges ----------

export interface Establishment {
  id: string;
  name: string;
  address?: string;
  manager?: string;
  phone?: string;
}

export interface Formula {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Prix barré commercial (ex : 30000 → 27000). Absent = pas de remise. */
  oldPrice?: number;
  durationDays: number;
  mealsIncluded: number;
  rules?: string;
  kind: 'subscription' | 'ticket';
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export interface Subscription {
  id: string;
  clientUsername: string;
  formulaId: string;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  mealsRemaining: number;
  qrToken: string;
  childId?: string;
}

/**
 * Moyens de paiement :
 * - 'cash' | 'wave' | 'intouch' | 'mobile_money' | 'card' : payés en EXTERNE (comptoir / mobile / banque) ;
 * - 'balance' : payé avec le SOLDE de la carte prépayée de l'enfant (débit interne,
 *   activation immédiate, refusé si solde insuffisant). Jamais de confirmation externe.
 */
export type ORestoPaymentMethod = 'cash' | 'wave' | 'intouch' | 'mobile_money' | 'card' | 'balance';
export type ORestoPaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface ORestoPayment {
  id: string;
  subscriptionId?: string;
  // Ticket en attente (paiement externe) : pas encore de subscriptionId,
  // l'intention est persistée en base (oresto_payments.client_username/formula_id)
  clientUsername?: string;
  formulaId?: string;
  amount: number;
  method: ORestoPaymentMethod;
  status: ORestoPaymentStatus;
  reference: string;
  createdAt: string;
}

export interface MealValidation {
  id: string;
  qrToken: string;
  clientUsername: string;
  establishmentId: string;
  validatedAt: string;
  status: 'accepted' | 'rejected';
  reason?: string;
  childId?: string;
}

// ---------- Espace parents : enfants + wallet QR (carte prépayée) ----------

// Cycle scolaire : 2 catégories tarifaires (cantine 2026).
// - 'primaire' : Préscolaire & Élémentaire → formule F2 (27 000 FCFA)
// - 'lycee'    : Lycée (6ème → Terminale) → formule F3 (32 000 FCFA)
export type SchoolCycle = 'primaire' | 'lycee';

/** Fiche parent : identité + contact (obligatoire avant d'inscrire un enfant). */
export interface ParentProfile {
  parentUsername: string;
  firstName: string;
  lastName: string;
  /** Numéro mobile SN (ex : 77 123 45 67), stocké normalisé. */
  phone: string;
  updatedAt?: string;
}

export interface Child {
  id: string;
  parentUsername: string;
  firstName: string;
  lastName: string;
  className: string;
  /** Cycle scolaire (optionnel = compatibilité avec les enfants déjà inscrits). */
  cycle?: SchoolCycle;
  qrToken: string;
  createdAt?: string;
}

export interface Wallet {
  childId: string;
  balance: number;
  updatedAt?: string;
}

export type WalletTxKind = 'topup' | 'debit' | 'subscription' | 'refund';
export type WalletTxStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface WalletTx {
  id: string;
  childId: string;
  kind: WalletTxKind;
  amount: number;
  method: ORestoPaymentMethod;
  status: WalletTxStatus;
  reference: string;
  paymentId?: string;
  label?: string;
  createdAt: string;
}

export interface FinanceSettings {
  /** Ancien taux % ISM sur abos (conservé pour compat, remplacé par ismPerSubscription). */
  ismSubscriptionPct: number;
  schoolPerSubscription: number;
  otherSalesPct: number;
  touchpointPct: number;
  paydounyaPct: number;
  /** Part ISM : montant fixe par abonnement payé (lycée comme préscolaire-élémentaire). */
  ismPerSubscription: number;
  /** Part ISM : % prélevé sur les ventes (caisse). */
  ismSalesPct: number;
}

export type ExpenseCategory = 'loyer' | 'salaires' | 'fournisseurs' | 'transport' | 'equipement' | 'divers';

export interface FinanceExpense {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  spentAt: string;
  createdBy?: string;
}

// ---------- Menu de la semaine (informatif, renseigné par le gérant) ----------

export const WEEK_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Plat composant un menu du jour : nom + prix snapshot (FCFA). */
export interface WeeklyMenuItem {
  name: string;
  price: number;
}

export interface WeeklyMenu {
  day: WeekDay;
  name: string;
  description: string;
  /** Plats du jour (noms — sans prix unitaires côté composition). */
  items: WeeklyMenuItem[];
  /** Prix UNIQUE du ticket du jour (FCFA), saisi par le Personnel. */
  price?: number;
}
