import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { useProducts } from '@/context/ProductContext';
import { formatCurrency } from '@/lib/utils';
import { initiateWavePayment, isMobileMethod, isValidSnPhone, isValidWaveCode, type WavePaymentRequest } from '@/lib/wave';
import { CYCLES, CYCLE_LABEL, cycleOfClass, pricePerMeal } from '@/lib/schoolCycles';
import { isOfficialFormula } from '@/lib/formulas';
import type { Child, Product, ORestoPayment, ORestoPaymentMethod, ORestoPaymentStatus, PageName, SchoolCycle, Subscription, WalletTx, WeeklyMenu } from '@/types/menu';
import { mockProducts } from '@/data/mockData';
import WavePaymentModal from '@/components/WavePaymentModal';
import PaymentReceiptModal from '@/components/PaymentReceiptModal';
import TicketCard from '@/components/TicketCard';
import { dayPhoto } from '@/data/cantineWeek';
import { menuTicketTotal } from '@/lib/menus';
import { categories } from '@/data/mockData';
import {
  CheckCircle, AlertCircle, Smartphone, Timer, Ticket,
  Pencil, Trash2, X, Check,
  ShoppingCart, Plus, Minus, CreditCard, Utensils,
  Pizza, Coffee, IceCream, Salad, Sandwich, Cookie, ChefHat, Croissant
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

const KIOSK_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Tous': <Utensils className="w-5 h-5" />,
  'recreation': <ChefHat className="w-5 h-5" />,
  'pause': <Coffee className="w-5 h-5" />,
  'recréation': <ChefHat className="w-5 h-5" />,
  'récréation': <ChefHat className="w-5 h-5" />,
};

const KIOSK_CATEGORIES = ['Tous', 'recreation', 'pause'] as const;

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
 * Kiosque POS pour l'Espace Parent - version adaptée du POS gérant
 * Affiche les produits récréation/pause avec panier par enfant, paiement par carte prépayée
 */
function KioskPOS({ 
  kids, 
  kioskProducts, 
  walletOf, 
  buyKiosk, 
  kioskCart, 
  setKioskCart, 
  flash, 
  formatCurrency 
}: {
  kids: Child[];
  kioskProducts: Product[];
  walletOf: (id: string) => number;
  buyKiosk: (username: string, childId: string, items: { productId: string; productName: string; price: number; qty: number }[]) => { order: any; balance: number };
  kioskCart: Record<string, { productId: string; productName: string; price: number; qty: number }[]>;
  setKioskCart: React.Dispatch<React.SetStateAction<Record<string, { productId: string; productName: string; price: number; qty: number }[]>>>;
  flash: (ok: boolean, text: string) => void;
  formatCurrency: (amount: number) => string;
}) {
  const [activeCategory, setActiveCategory] = useState<'Tous' | 'recreation' | 'pause'>('Tous');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(kids[0]?.id ?? null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);

  const filteredProducts = activeCategory === 'Tous' 
    ? kioskProducts 
    : kioskProducts.filter((p) => p.category === activeCategory);

  const cart = selectedChildId ? (kioskCart[selectedChildId] || []) : [];
  const balance = selectedChildId ? walletOf(selectedChildId) : 0;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const addToCart = (product: Product) => {
    if (!selectedChildId) {
      flash(false, 'Sélectionnez un enfant d\'abord.');
      return;
    }
    const currentBalance = walletOf(selectedChildId);
    const inCart = cart.find((it) => it.productId === product.id);
    const currentQty = inCart?.qty || 0;
    if (currentBalance < product.price * (currentQty + 1)) {
      flash(false, `Solde insuffisant pour ${product.name}.`);
      return;
    }
    setAnimatingId(product.id);
    setTimeout(() => setAnimatingId(null), 300);

    setKioskCart((prev) => {
      const childCart = prev[selectedChildId!] || [];
      const existing = childCart.find((item) => item.productId === product.id);
      if (existing) {
        return {
          ...prev,
          [selectedChildId!]: childCart.map((item) =>
            item.productId === product.id ? { ...item, qty: item.qty + 1 } : item
          ),
        };
      }
      return {
        ...prev,
        [selectedChildId!]: [...childCart, { productId: product.id, productName: product.name, price: product.price, qty: 1 }],
      };
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    if (!selectedChildId) return;
    setKioskCart((prev) => {
      const childCart = prev[selectedChildId] || [];
      return {
        ...prev,
        [selectedChildId]: childCart
          .map((item) => {
            if (item.productId === productId) {
              const newQty = item.qty + delta;
              if (newQty <= 0) return null;
              // Vérifier le solde
              if (delta > 0 && balance < item.price * newQty) {
                flash(false, `Solde insuffisant pour ${item.productName}.`);
                return item;
              }
              return { ...item, qty: newQty };
            }
            return item;
          })
          .filter((item): item is { productId: string; productName: string; price: number; qty: number } => item !== null),
      };
    });
  };

  const removeFromCart = (productId: string) => {
    if (!selectedChildId) return;
    setKioskCart((prev) => {
      const childCart = prev[selectedChildId] || [];
      return {
        ...prev,
        [selectedChildId]: childCart.filter((item) => item.productId !== productId),
      };
    });
  };

  const handlePay = () => {
    if (!selectedChildId) {
      flash(false, 'Sélectionnez un enfant.');
      return;
    }
    if (!cart.length) {
      flash(false, 'Panier vide.');
      return;
    }
    try {
      const { order, balance: newBalance } = buyKiosk(username, selectedChildId, cart);
      setKioskCart((prev) => ({ ...prev, [selectedChildId]: [] }));
      const k = kids.find((x) => x.id === selectedChildId);
      flash(true, `Commande kiosque passée pour ${k?.firstName ?? 'l\'enfant'} — ${order.items.length} article(s). Nouveau solde : ${formatCurrency(newBalance)}.`);
      setShowCart(false);
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Commande impossible.');
    }
  };

  const selectedChild = kids.find((k) => k.id === selectedChildId);

  if (!kids.length) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
        <p className="text-lg font-black text-slate-800">Aucun enfant inscrit</p>
        <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
          Inscrivez un enfant à l\'étape 1 pour utiliser le kiosque.
        </p>
      </div>
    );
  }

  if (kioskProducts.length === 0) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
        <p className="text-lg font-black text-slate-800">Kiosque en préparation</p>
        <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
          Le Personnel ajoute les articles de récréation (snacks, boissons) dans Gestion Menu.
          Rien n\'est affiché tant qu\'aucun article n\'est disponible. Revenez bientôt.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[600px] lg:h-[700px] animate-fade-in gap-4">
      {/* Product catalog - Left side */}
      <div className="flex-1 flex flex-col min-w-0 lg:border-r border-slate-200 bg-white rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 lg:p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Kiosque Récréation & Pause</h1>
              <p className="text-sm text-slate-600 mt-0.5">{filteredProducts.length} article(s) disponible(s)</p>
            </div>
            {selectedChild && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
                <span className="text-xs font-bold text-emerald-700">{selectedChild.firstName} {selectedChild.lastName}</span>
                <span className="text-sm font-black text-emerald-800 tabular-nums">{formatCurrency(balance)}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 overflow-x-auto tiny-scrollbar pb-1" role="tablist" aria-label="Catégories kiosque">
            {KIOSK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat as 'Tous' | 'recreation' | 'pause')}
                aria-pressed={activeCategory === cat}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {KIOSK_CATEGORY_ICONS[cat]}
                {cat === 'recreation' ? 'Récréation' : cat === 'pause' ? 'Pause' : 'Tous'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gradient-to-br from-slate-50 to-orange-50/20">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg font-bold text-slate-800">Aucun article dans cette catégorie</p>
              <p className="mt-1 text-sm text-slate-600">Sélectionnez une autre catégorie.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  aria-label={`Ajouter ${product.name} au panier, ${formatCurrency(product.price)}`}
                  className={`bg-white rounded-2xl border-2 border-slate-200 overflow-hidden text-left hover:shadow-xl hover:border-emerald-600 transition-all group ${
                    animatingId === product.id ? 'animate-cart-pop' : ''
                  }`}
                  disabled={selectedChildId && walletOf(selectedChildId) < product.price}
                >
                  <div className="h-28 lg:h-32 overflow-hidden relative">
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      loading="lazy" 
                      width={300} 
                      height={200} 
                      onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    {selectedChildId && walletOf(selectedChildId) < product.price && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                        <span className="text-white text-sm font-bold bg-red-600 px-3 py-1 rounded-full">Solde insuffisant</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 lg:p-4">
                    <h3 className="text-sm lg:text-base font-bold text-slate-800 truncate mb-1">{product.name}</h3>
                    <p className="text-base lg:text-lg font-bold text-emerald-700">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart - Right side */}
      <div className={`lg:w-[420px] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden ${kids.length === 1 ? 'lg:hidden' : ''}`}>
        <div className="p-5 lg:p-6 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Panier</h2>
              <span className="text-sm text-slate-600">{cart.length} article(s) · {cartCount} pièce(s)</span>
            </div>
            {kids.length > 1 && (
              <select
                value={selectedChildId || ''}
                onChange={(e) => setSelectedChildId(e.target.value || null)}
                className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600 min-w-[180px]"
              >
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>{k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto order-scrollbar p-4 lg:p-5 space-y-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
              <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-sm font-medium">Panier vide</p>
              <p className="text-xs mt-1 text-center">Choisissez des articles à gauche</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="flex gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 transition-colors">
                <img src={item.productName && kioskProducts.find(p => p.name === item.productName)?.image || '/placeholder.svg'} alt={item.productName} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 shadow-md" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-800 truncate">{item.productName}</h3>
                    <button onClick={() => removeFromCart(item.productId)} className="text-slate-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{formatCurrency(item.price)} / unité</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.productId, -1)} className="w-8 h-8 rounded-lg bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-bold text-slate-800 w-8 text-center">{item.qty}</span>
                      <button onClick={() => updateQuantity(item.productId, 1)} className="w-8 h-8 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-emerald-500/30 transition-all">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-base font-bold text-slate-800">{formatCurrency(item.price * item.qty)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-5 lg:p-6 border-t border-slate-200 space-y-4 bg-gradient-to-r from-emerald-50 to-teal-50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Sous-total</span><span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Solde carte</span><span className="font-semibold text-emerald-700">{formatCurrency(balance)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-slate-800 pt-3 border-t-2 border-slate-200">
                <span>Total</span>
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{formatCurrency(subtotal)}</span>
              </div>
              {subtotal > balance && (
                <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Solde insuffisant de {formatCurrency(subtotal - balance)}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setKioskCart((prev) => ({ ...prev, [selectedChildId!]: [] }))} className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors">
                Vider
              </button>
              <button
                onClick={handlePay}
                disabled={subtotal > balance || !selectedChildId}
                className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:shadow-xl hover:shadow-emerald-500/50 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <CreditCard className="w-5 h-5" />
                Payer avec la carte
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Grille produits Kiosque (style MenusPage) : catégories + grille produits avec ajout au panier par enfant.
 * Affiche produits catégories 'recreation' et 'pause', paiement par carte prépayée.
 */
function KioskProductGrid({ 
  kids, 
  kioskProducts, 
  walletOf, 
  buyKiosk, 
  flash, 
  formatCurrency,
  username
}: {
  kids: Child[];
  kioskProducts: Product[];
  walletOf: (id: string) => number;
  buyKiosk: (username: string, childId: string, items: { productId: string; productName: string; price: number; qty: number }[]) => { order: any; balance: number };
  flash: (ok: boolean, text: string) => void;
  formatCurrency: (amount: number) => string;
  username: string;
}) {
  const [activeCategory, setActiveCategory] = useState<'Tous' | 'recreation' | 'pause'>('Tous');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(kids[0]?.id ?? null);
  const [cart, setCart] = useState<Record<string, { productId: string; productName: string; price: number; qty: number }[]>>({});
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  const filteredProducts = activeCategory === 'Tous' 
    ? kioskProducts 
    : kioskProducts.filter((p) => p.category === activeCategory || p.category === 'récréation' || p.category === 'recréation');

  const childCart = selectedChildId ? (cart[selectedChildId] || []) : [];
  const balance = selectedChildId ? walletOf(selectedChildId) : 0;
  const subtotal = childCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = childCart.reduce((sum, item) => sum + item.qty, 0);

  const addToCart = (product: Product) => {
    if (!selectedChildId) {
      flash(false, 'Sélectionnez un enfant d\'abord.');
      return;
    }
    setAnimatingId(product.id);
    setTimeout(() => setAnimatingId(null), 300);

    setCart((prev) => {
      const cCart = prev[selectedChildId!] || [];
      const existing = cCart.find((item) => item.productId === product.id);
      if (existing) {
        return {
          ...prev,
          [selectedChildId!]: cCart.map((item) =>
            item.productId === product.id ? { ...item, qty: item.qty + 1 } : item
          ),
        };
      }
      return {
        ...prev,
        [selectedChildId!]: [...cCart, { productId: product.id, productName: product.name, price: product.price, qty: 1 }],
      };
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    if (!selectedChildId) return;
    setCart((prev) => {
      const cCart = prev[selectedChildId] || [];
      return {
        ...prev,
        [selectedChildId]: cCart
          .map((item) => {
            if (item.productId === productId) {
              const newQty = item.qty + delta;
              if (newQty <= 0) return null;
              return { ...item, qty: newQty };
            }
            return item;
          })
          .filter((item): item is { productId: string; productName: string; price: number; qty: number } => item !== null),
      };
    });
  };

  const removeFromCart = (productId: string) => {
    if (!selectedChildId) return;
    setCart((prev) => {
      const cCart = prev[selectedChildId] || [];
      return {
        ...prev,
        [selectedChildId]: cCart.filter((item) => item.productId !== productId),
      };
    });
  };

  const handlePay = () => {
    if (!selectedChildId) {
      flash(false, 'Sélectionnez un enfant.');
      return;
    }
    if (!childCart.length) {
      flash(false, 'Panier vide.');
      return;
    }
    try {
      const { order, balance: newBalance } = buyKiosk(username, selectedChildId, childCart);
      setCart((prev) => ({ ...prev, [selectedChildId]: [] }));
      const k = kids.find((x) => x.id === selectedChildId);
      flash(true, `Commande kiosque passée pour ${k?.firstName ?? 'l\'enfant'} — ${order.items.length} article(s). Nouveau solde : ${formatCurrency(newBalance)}.`);
      // Scroll vers le haut pour voir le toast de confirmation
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      flash(false, err instanceof Error ? err.message : 'Commande impossible.');
    }
  };

  const selectedChild = kids.find((k) => k.id === selectedChildId);

  if (!kids.length) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
        <p className="text-lg font-black text-slate-800">Aucun enfant inscrit</p>
        <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
          Inscrivez un enfant à l\'étape 1 pour utiliser le kiosque.
        </p>
      </div>
    );
  }

  if (kioskProducts.length === 0) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center shadow-sm">
        <p className="text-lg font-black text-slate-800">Kiosque en préparation</p>
        <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
          Le Personnel ajoute les articles de récréation (snacks, boissons) dans Gestion Menu.
          Rien n\'est affiché tant qu\'aucun article n\'est disponible. Revenez bientôt.
        </p>
      </div>
    );
  }

  const KIOSK_CATEGORY_ICONS: Record<string, React.ReactNode> = {
    'Tous': <Utensils className="w-5 h-5" />,
    'recreation': <ChefHat className="w-5 h-5" />,
    'pause': <Coffee className="w-5 h-5" />,
    'récréation': <ChefHat className="w-5 h-5" />,
    'recréation': <ChefHat className="w-5 h-5" />,
  };
  const KIOSK_CATEGORIES = ['Tous', 'recreation', 'pause'] as const;

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 overflow-x-auto tiny-scrollbar pb-1" role="tablist" aria-label="Catégories kiosque">
        {KIOSK_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat as 'Tous' | 'recreation' | 'pause')}
            aria-pressed={activeCategory === cat}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeCategory === cat
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {KIOSK_CATEGORY_ICONS[cat]}
            {cat === 'recreation' ? 'Récréation' : cat === 'pause' ? 'Pause' : 'Tous'}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-bold text-slate-800">Aucun article dans cette catégorie</p>
            <p className="mt-1 text-sm text-slate-600">Sélectionnez une autre catégorie.</p>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              aria-label={`Ajouter ${product.name} au panier, ${formatCurrency(product.price)}`}
              className={`bg-white rounded-2xl border-2 border-slate-200 overflow-hidden text-left hover:shadow-xl hover:border-emerald-600 transition-all group ${
                animatingId === product.id ? 'animate-cart-pop' : ''
              }`}
            >
              <div className="h-28 lg:h-32 overflow-hidden relative">
                <img 
                  src={product.image} 
                  alt={product.name} 
                  loading="lazy" 
                  width={300} 
                  height={200} 
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              <div className="p-3 lg:p-4">
                <h3 className="text-sm lg:text-base font-bold text-slate-800 truncate mb-1">{product.name}</h3>
                <p className="text-base lg:text-lg font-bold text-emerald-700">
                  {formatCurrency(product.price)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Cart summary - fixed at bottom on mobile, side on desktop */}
      {childCart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:relative lg:sticky lg:top-24 lg:bottom-auto z-40 bg-white border-t border-slate-200 shadow-xl p-4 lg:p-6 rounded-t-2xl lg:rounded-2xl animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Panier ({cartCount} pièce(s))</h3>
              <p className="text-sm text-slate-600">{selectedChild?.firstName} {selectedChild?.lastName} · Solde: {formatCurrency(balance)}</p>
            </div>
            {kids.length > 1 && (
              <select
                value={selectedChildId || ''}
                onChange={(e) => setSelectedChildId(e.target.value || null)}
                className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600 min-w-[180px]"
              >
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>{k.firstName} {k.lastName} · {formatCurrency(walletOf(k.id))}</option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
            {childCart.map((item) => (
              <div key={item.productId} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <img src={item.productName && kioskProducts.find(p => p.name === item.productName)?.image || '/placeholder.svg'} alt={item.productName} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-md" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-slate-800 truncate">{item.productName}</h4>
                    <button onClick={() => removeFromCart(item.productId)} className="text-slate-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{formatCurrency(item.price)} / unité</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 rounded-lg bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-bold text-slate-800 w-7 text-center">{item.qty}</span>
                      <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-emerald-500/30 transition-all">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{formatCurrency(item.price * item.qty)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2 text-sm border-t border-slate-200 pt-3">
            <div className="flex justify-between text-slate-600">
              <span>Sous-total</span><span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Solde carte</span><span className="font-semibold text-emerald-700">{formatCurrency(balance)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-800 pt-2 border-t-2 border-slate-200">
              <span>Total</span>
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCart((prev) => ({ ...prev, [selectedChildId!]: [] }))} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors">
                Vider
              </button>
              <button
                onClick={handlePay}
                className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm hover:shadow-xl hover:shadow-emerald-500/50 transition-all flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Payer avec la carte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Espace Parent — parcours fluide :
 * 1 inscription (carte crédit + QR créés seuls) → 2 abonnement
 * (paiement InTouch intégré au pavé formule) → 3 menu du jour payé
 * par la carte + tickets → 4 Kiosque Récréation & Pause → 5 cartes (recharge + QR) → 6 historique.
 */
const EspaceParentPage = ({ onNavigate }: { onNavigate?: (page: PageName) => void }) => {
  const { user } = useAuth();
  const {
    formulas, mySubscriptions, myPayments, myValidations,
    subscribe, paySubscription, confirmMobilePayment, resumeMobilePayment,
    renewSubscription, buyTicket, buyDayMenu, buyKiosk, myChildren, addChild,
    updateChild, deleteChild, weeklyMenus, confirmWalletTopUpMobile,
    parentProfileOf, walletOf, childTxs,
  } = useResto();

  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ORestoPayment | null>(null);
  const [waveModal, setWaveModal] = useState<{ kind: 'sub' | 'topup'; paymentId?: string; txId?: string; wave: WavePaymentRequest } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [histChild, setHistChild] = useState('all');
  /** Formule dont le panneau de paiement intégré est ouvert. */
  const [payFor, setPayFor] = useState<string | null>(null);
  const [ticketAlt, setTicketAlt] = useState<{ formulaId: string; name: string } | null>(null);
  const [dayBuyer, setDayBuyer] = useState<Record<string, string>>({});
  const [kioskCart, setKioskCart] = useState<Record<string, { productId: string; productName: string; price: number; qty: number }[]>>({});

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

  // Produits kiosque (catégorie pause/récréation) — fusion mock + Supabase/localStorage pour garantir l'affichage
  const { products: allProducts } = useProducts();
  const kioskMockProducts = mockProducts.filter((p) => p.available && (p.category === 'recreation' || p.category === 'pause'));
  const kioskProducts = [...new Map([...allProducts, ...kioskMockProducts].map(p => [p.id, p])).values()]
    .filter((p) => p.available && (p.category === 'pause' || p.category === 'recreation' || p.category === 'récréation' || p.category === 'recréation'));

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
          <SectionTitle step="2" title="Je choisis l’abonnement" />
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
          <SectionTitle step="3" title="Menu du jour" />

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
                onBuy={() => handleBuyDayMenu(menuDuJour.day, menuTicketTotal(menuDuJour))}
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
                  onBuy={() => handleBuyDayMenu(m.day, menuTicketTotal(m))}
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

        {/* ===== 4. KIOSQUE RÉCRÉATION & PAUSE ===== */}
        <section id="kiosque" className="scroll-mt-24">
          <SectionTitle step="4" title="Kiosque Récréation & Pause" sub="Snacks & boissons payés par la carte prépayée — prêts à récupérer à la cantine" />
          <KioskProductGrid
            kids={kids}
            kioskProducts={kioskProducts}
            walletOf={walletOf}
            buyKiosk={buyKiosk}
            flash={flash}
            formatCurrency={formatCurrency}
            username={username}
          />
        </section>

        {/* ===== 5. CARTES : une carte dark par enfant ===== */}
        <section id="cartes" className="scroll-mt-24">
          <SectionTitle step="5" title="Mes cartes" />

          {kids.length > 0 ? (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2">
              {kids.map((k) => {
                const s = activeByChild(k.id);
                const f = s ? formulas.find((x) => x.id === s.formulaId) : undefined;
                const total = f?.mealsIncluded && f.mealsIncluded > 0 ? f.mealsIncluded : (s?.mealsRemaining ?? 0);
                return (
                  <KidCard
                    key={k.id}
                    k={k}
                    sub={s}
                    pending={pendingByChild(k.id)}
                    balance={walletOf(k.id)}
                    walletOf={walletOf}
                    formulaName={f?.name ?? 'Abonnement'}
                    formulaRules={f?.rules}
                    totalMeals={total}
                    days={s ? daysLeft(s) : 0}
                    onRenew={s ? () => handleRenew(s.id, 'intouch') : undefined}
                    onRecharged={handleRecharged}
                    onError={(t) => flash(false, t)}
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
  const selKid = kids.find((k) => k.id === childId);
  const ready = !!childId && amount > 0 && isValidSnPhone(phone);
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
          <label htmlFor="recharge-tel" className="text-xs font-black uppercase tracking-widest text-slate-400">3 · Numéro InTouch</label>
          <input
            id="recharge-tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="77 123 45 67"
            className="mt-1.5 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm tabular-nums outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition-all"
          />
        </div>
        {error && <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <div>
          <button
            onClick={handleValidate}
            disabled={!ready}
            className="w-full py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-500 text-white text-sm font-bold hover:from-emerald-800 hover:to-emerald-600 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 shadow-md shadow-emerald-600/25 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
          >
            <Smartphone className="w-4 h-4" />             Recharger{amount > 0 ? ` · ${formatCurrency(amount)}` : ''}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Recharge <strong className="text-slate-900 tabular-nums">{formatCurrency(amount)}</strong>
        {selKid ? <> → carte de <strong className="text-slate-900">{selKid.firstName} {selKid.lastName}</strong></> : null} ·
        validez avec le code reçu par InTouch.
      </p>
      <div className="rounded-xl bg-slate-900 text-white p-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400">Montant envoyé · {wave.merchantName}</p>
          <p className="text-xl font-bold tabular-nums">{wave.amountLabel}</p>
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
          className="mt-1 w-full px-3 py-2.5 min-h-[44px] rounded-xl border-2 border-slate-200 text-sm text-center font-mono tracking-[0.3em] outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition-all"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      <button
        onClick={handleConfirm}
        disabled={confirming || left === 0 || code.length !== 6}
        className="w-full py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-500 text-white text-sm font-bold hover:from-emerald-800 hover:to-emerald-600 active:scale-[0.99] transition-all disabled:opacity-40 shadow-md shadow-emerald-600/25 disabled:shadow-none"
      >
        {confirming ? 'Confirmation…' : 'Confirmer la recharge'}
      </button>
      <button
        onClick={() => { setWave(null); setTxId(null); setCode(''); setError(null); }}
        className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700"
      >
        ← Modifier la carte ou le montant
      </button>
    </div>
  );
}

/** Carte ticket du jour : photo, plats (sans prix), prix unique, paiement par carte. */
function MenuTicketCard({ menu, highlight, kids, walletOf, buyer, onBuyer, onBuy }: {
  menu: WeeklyMenu; highlight: boolean; kids: Child[]; walletOf: (id: string) => number;
  buyer: string; onBuyer: (id: string) => void; onBuy: () => void;
}) {
  const total = menuTicketTotal(menu);
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

/** Carte enfant dark (style CARTE ACTIVE) : une carte par enfant inscrit.
 * Abonné : repas restants + J- + Mon QR + Renouveler + progression.
 * Sans abonnement : solde + recharge InTouch intégrée. Gestion intégrée.
 */
function KidCard({ k, sub, pending, balance, walletOf, formulaName, formulaRules, totalMeals, days, onRenew, onRecharged, onError, updateChild, deleteChild, flash }: {
  k: Child;
  sub: Subscription | undefined;
  pending: boolean;
  balance: number;
  walletOf: (id: string) => number;
  formulaName: string;
  formulaRules?: string;
  totalMeals: number;
  days: number;
  onRenew?: () => void;
  onGotoQR: () => void;
  onRecharged: (childId: string, amount: number) => void;
  onError: (text: string) => void;
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
  const pct = totalMeals > 0 && sub ? Math.min(100, Math.round((sub.mealsRemaining / totalMeals) * 100)) : 0;

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
        <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-emerald-200 whitespace-nowrap tabular-nums">
          {sub ? `J-${days} restants` : formatCurrency(balance)}
        </span>
      </div>
      {sub ? (
        <>
          <p className="relative mt-3 text-4xl font-black tracking-tight tabular-nums">{sub.mealsRemaining} <span className="text-lg font-bold text-slate-300">repas restants</span></p>
          <p className="relative mt-1 text-xs text-slate-400">
            {k.firstName} {k.lastName} · {k.className} · Du {new Date(sub.startDate).toLocaleDateString('fr-FR')} au {new Date(sub.endDate).toLocaleDateString('fr-FR')}
          </p>
        </>
      ) : (
        <>
          <p className="relative mt-3 text-4xl font-black tracking-tight tabular-nums">{formatCurrency(balance)}</p>
          <p className="relative mt-1 text-xs text-slate-400">
            {k.firstName} {k.lastName} · {k.className} · {CYCLE_LABEL[k.cycle ?? 'primaire']}
          </p>
        </>
      )}
      <div className="relative mt-4 flex flex-wrap gap-2">
        {sub && onRenew ? (
          <button onClick={onRenew} className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 active:scale-[0.99] transition-all">
            <Smartphone className="w-4 h-4" /> Renouveler
          </button>
        ) : (
          <button onClick={() => setShowRecharge((v) => !v)} aria-expanded={showRecharge} className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 active:scale-[0.99] transition-all">
            <Smartphone className="w-4 h-4" /> Recharger ma carte
          </button>
        )}
      </div>
      {sub && (
        <button onClick={() => setShowRecharge((v) => !v)} aria-expanded={showRecharge} className="relative mt-2 w-full py-2.5 min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-sm font-bold hover:bg-white/15 transition-colors">
          {showRecharge ? 'Fermer la recharge' : '+ Recharger ma carte'}
        </button>
      )}
      {showRecharge && (
        <div className="relative mt-3 rounded-2xl bg-white text-slate-900 p-4 shadow-inner">
          <RechargePanel
            kids={[k]}
            walletOf={walletOf}
            onDone={(id, amt) => { setShowRecharge(false); onRecharged(id, amt); }}
            onError={onError}
          />
        </div>
      )}
      {sub && (
        <div className="relative mt-4">
          <p className="text-xs font-bold text-slate-300 tabular-nums">Solde repas {sub.mealsRemaining}/{totalMeals}</p>
          <div className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {formulaRules && <p className="mt-2 text-[11px] text-slate-400">{formulaRules}</p>}
        </div>
      )}
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
