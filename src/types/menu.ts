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
  | 'tickets'
  | 'subscription'
  | 'subscriptions'
  | 'qrcode'
  | 'history'
  | 'profile'
  | 'dashboard'
  | 'establishments'
  | 'validation'
  | 'menu'
  | 'pos'
  | 'payment'
  | 'receipt'
  | 'orders'
  | 'users'
  | 'settings';

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
}

export type ORestoPaymentMethod = 'cash' | 'wave' | 'mobile_money' | 'card';
export type ORestoPaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface ORestoPayment {
  id: string;
  subscriptionId?: string;
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
}
