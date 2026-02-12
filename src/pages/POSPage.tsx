import { useState } from 'react';
import { CartItem, Product } from '@/types/menu';
import { categories, categoryIcons } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { useProducts } from '@/context/ProductContext';
import { 
  ShoppingCart, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard,
  Utensils,
  Pizza,
  Coffee,
  IceCream,
  Salad,
  Sandwich,
  Cookie,
  ChefHat,
  Croissant
} from 'lucide-react';

interface POSPageProps {
  onProceedToPayment: (items: CartItem[]) => void;
}

const categoryIconsMap: Record<string, React.ReactNode> = {
  'Tous': <Utensils className="w-5 h-5" />,
  'Tacos': <ChefHat className="w-5 h-5" />,
  'Sandwichs': <Sandwich className="w-5 h-5" />,
  'Burgers': <Utensils className="w-5 h-5" />,
  'Fataya': <Cookie className="w-5 h-5" />,
  'Crépes': <Croissant className="w-5 h-5" />,
  'Pizza': <Pizza className="w-5 h-5" />,
  'Accompagnements': <Salad className="w-5 h-5" />,
  'Boissons': <Coffee className="w-5 h-5" />,
  'Desserts': <IceCream className="w-5 h-5" />,
};

const POSPage = ({ onProceedToPayment }: POSPageProps) => {
  const { products } = useProducts();
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);

  const availableProducts = products.filter((p) => p.available);
  const filtered = activeCategory === 'Tous' ? availableProducts : availableProducts.filter((p) => p.category === activeCategory);

  const addToCart = (product: Product) => {
    setAnimatingId(product.id);
    setTimeout(() => setAnimatingId(null), 300);

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter((item) => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-screen animate-fade-in">
      {/* Product catalog */}
      <div className="flex-1 flex flex-col min-w-0 lg:border-r border-slate-200">
        <div className="p-4 lg:p-6 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Point de Vente</h1>
              <p className="text-sm text-slate-600 mt-0.5">{availableProducts.length} produits disponibles</p>
            </div>
            {/* Mobile cart toggle */}
            <button onClick={() => setShowCart(true)} className="lg:hidden relative p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30">
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{cartCount}</span>
              )}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto tiny-scrollbar pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {categoryIconsMap[cat]}
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gradient-to-br from-slate-50 to-orange-50/20">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className={`bg-white rounded-2xl border-2 border-slate-200 overflow-hidden text-left hover:shadow-xl hover:border-orange-400 transition-all group ${
                  animatingId === product.id ? 'animate-cart-pop' : ''
                }`}
              >
                <div className="h-28 lg:h-32 overflow-hidden relative">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <div className="p-3 lg:p-4">
                  <h3 className="text-sm lg:text-base font-bold text-slate-800 truncate mb-1">{product.name}</h3>
                  <p className="text-base lg:text-lg font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                    {formatCurrency(product.price)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart - desktop sidebar / mobile overlay */}
      <>
        {showCart && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setShowCart(false)} />}
        <div className={`fixed right-0 top-0 bottom-0 w-80 sm:w-96 z-50 lg:static lg:w-[420px] flex flex-col bg-white transition-transform duration-300 lg:translate-x-0 shadow-2xl ${showCart ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-5 lg:p-6 border-b border-slate-200 bg-gradient-to-r from-orange-50 to-red-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Commande</h2>
                <span className="text-sm text-slate-600">{cart.length} article(s)</span>
              </div>
              <button onClick={() => setShowCart(false)} className="lg:hidden p-2 hover:bg-white rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto order-scrollbar p-4 lg:p-5 space-y-3">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm font-medium">Panier vide</p>
                <p className="text-xs mt-1">Ajoutez des produits pour commencer</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-300 transition-colors">
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 shadow-md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{item.name}</h3>
                      <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{formatCurrency(item.price)} / unité</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-lg bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 hover:border-orange-400 hover:text-orange-600 transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold text-slate-800 w-8 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-orange-500/30 transition-all">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="text-base font-bold text-slate-800">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="p-5 lg:p-6 border-t border-slate-200 space-y-4 bg-gradient-to-r from-orange-50 to-red-50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total</span><span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold text-slate-800 pt-3 border-t-2 border-slate-200">
                  <span>Total</span>
                  <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">{formatCurrency(total)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCart([])} className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors">
                  Annuler
                </button>
                <button
                  onClick={() => { onProceedToPayment(cart); setShowCart(false); }}
                  className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold text-sm hover:shadow-xl hover:shadow-orange-500/50 transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" />
                  Payer
                </button>
              </div>
            </div>
          )}
        </div>
      </>

      {/* Mobile floating cart button */}
      {cart.length > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden fixed bottom-6 right-6 z-30 bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl shadow-orange-500/50 flex items-center gap-3 font-bold text-sm hover:scale-105 transition-transform"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>{cartCount} · {formatCurrency(total)}</span>
        </button>
      )}
    </div>
  );
};

export default POSPage;
