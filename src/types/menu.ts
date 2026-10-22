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
  qrToken?: string;
}

export type PageName =
  | 'home'
  | 'subscription'
  | 'subscriptions'
  | 'qrcode'
  | 'history'
  | 'profile'
  | 'dashboard'
  | 'validation'
  | 'menu'
  | 'menus'
  | 'pos'
  | 'payment'
  | 'receipt'
  | 'orders'
  | 'users'
  | 'settings'
  | 'establishments'
  | 'children'
  | 'finance'
  | 'qrgallery'
  | 'menurecreation'
  | 'paymentsuccess'
  | 'paymentfailure'
  | 'reclamations'
  | 'import-eleves'
  | 'paiements';

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
 * - 'cash' | 'wave' | 'mobile_money' | 'card' : payés en EXTERNE (comptoir / mobile / banque) ;
 * - 'balance' : payé avec le SOLDE de la carte prépayée de l'enfant (débit interne,
 *   activation immédiate, refusé si solde insuffisant). Jamais de confirmation externe.
 */
export type ORestoPaymentMethod = 'cash' | 'wave' | 'mobile_money' | 'card' | 'balance';
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
  /** Horodatage du règlement (serveur : webhook SycaPay / caisse). */
  paidAt?: string;
  /**
   * Horodatage du règlement VALIDÉ : c'est lui qui fait foi en comptabilité.
   * Un paiement marqué « payé » sans horodatage de règlement n'est pas
   * comptabilisé (v_paiements_valides côté base, isValidatedPayment ici).
   */
  settledAt?: string;
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

// ---------- Réclamations : fil privé parent ↔ superviseur + annonces ----------

export type ComplaintCategory =
  | 'meal_quality'
  | 'service'
  | 'payment'
  | 'hygiene'
  | 'card'
  | 'other';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';

/** Réclamation d'un parent, traitée dans le canal du superviseur. */
export interface Complaint {
  id: string;
  /** Référence courte affichée aux parents (ex : REC-2607-A1B2). */
  reference: string;
  clientUsername: string;
  childId?: string;
  category: ComplaintCategory;
  subject: string;
  status: ComplaintStatus;
  /** Annonce publiée par le superviseur, visible par tous les parents. */
  isAnnouncement: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

/** Message d'un fil de réclamation (parent, superviseur, ou annonce). */
export interface ComplaintMessage {
  id: string;
  complaintId: string;
  authorUsername: string;
  authorRole: 'client' | 'staff';
  body: string;
  /** Chemin Supabase Storage de la pièce jointe (bucket privé). */
  photoPath?: string;
  createdAt: string;
}

export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  meal_quality: 'Qualité des repas',
  service: 'Service',
  payment: 'Paiement',
  hygiene: 'Hygiène',
  card: 'Carte / solde',
  other: 'Autre',
};

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: 'Nouvelle',
  in_progress: 'En cours',
  resolved: 'Résolue',
  rejected: 'Rejetée',
};

// ---------- Espace parents : enfants + wallet QR (carte prépayée) ----------

// Cycle scolaire : 4 cycles de l'enseignement fundamental et secondaire.
// - 'maternelle' : Petite → Grande Section
// - 'primaire'   : CIA/CIB/CIC/CID (Cours d'Initiation) → CM2
// - 'college'    : 6ème → 3ème
// - 'lycee'      : Seconde → Terminale
// Les deux premiers cycles partagent la formule F2, le collège et le lycée
// la formule F3 (voir FORMULA_CYCLE).
export type SchoolCycle = 'maternelle' | 'primaire' | 'college' | 'lycee';

/** Fiche parent : identité + contact (obligatoire avant d'inscrire un enfant). */
export interface ParentProfile {
  /**
   * IDENTIFIANT CANONIQUE du parent : son numéro de téléphone (9 chiffres).
   * C'est la clé de ses enfants, de ses abonnements et de son compte Auth.
   */
  parentUsername: string;
  /**
   * Nom d'utilisateur du compte Auth associé, quand il diffère du numéro
   * (comptes de démonstration, anciennes fiches). Permet de retrouver la
   * fiche à partir de la session, sans jamais dupliquer l'identité.
   */
  authUsername?: string;
  firstName: string;
  lastName: string;
  /** Numéro mobile SN (ex : 77 123 45 67), stocké normalisé. */
  phone: string;
  /** Fiche famille publiée par la DAF, remplie par le parent. Obligatoire avant d'inscrire des enfants. */
  fichePubliee?: boolean;
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
  /** Part prise par SycaPay sur les operations encaissees par la passerelle. */
  sycapayPct: number;
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

// ---------- Kiosque récréation & pause : commandes payées par la carte ----------

export interface KioskOrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export type KioskOrderStatus = 'pending' | 'served' | 'cancelled';

export interface KioskOrder {
  id: string;
  childId: string;
  parentUsername: string;
  items: KioskOrderItem[];
  total: number;
  status: KioskOrderStatus;
  reference: string;
  createdAt: string;
  servedAt?: string;
}

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
