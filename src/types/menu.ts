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

export type PageName = 'dashboard' | 'menu' | 'pos' | 'payment' | 'receipt' | 'orders';
