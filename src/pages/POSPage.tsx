import { useCallback, useEffect, useRef, useState } from 'react';
import { CartItem, Product, Order, KioskOrder } from '@/types/menu';
import { categories } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { menuTicketTotal } from '@/lib/menus';
import { dayPhoto } from '@/data/cantineWeek';
import { useProducts } from '@/context/ProductContext';
import { useResto } from '@/context/RestoContext';
import { useAuth } from '@/context/AuthContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { pickBackCameraId, isSecureScanContext, friendlyScanError, scanErrorName } from '@/lib/qrScan';
import { 
  ShoppingCart, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard,
  Utensils,
  UtensilsCrossed,
  Pizza,
  Coffee,
  IceCream,
  Salad,
  Sandwich,
  Cookie,
  ChefHat,
  Croissant,
  ScanLine,
  Camera,
  UserRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BadgeCheck,
  Clock,
  Ban,
} from 'lucide-react';

const READER_ID = 'o-resto-pos-reader';
const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Élève identifié par le scan de son QR à la caisse. */
interface CardChild {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  balance: number;
  qrToken: string;
}

interface POSPageProps {
  onProceedToPayment: (items: CartItem[]) => void;
  /** Vente réglée par carte prépayée : ouvre la page Reçu imprimable. */
  onCardSaleComplete: (order: Order) => void;
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

const POSPage = ({ onProceedToPayment, onCardSaleComplete }: POSPageProps) => {
  const { products } = useProducts();
  const { resolveChildQr, sellToChildCard, weeklyMenus, kioskOrders, cancelKioskOrder } = useResto();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  // --- Paiement sur la carte prépayée de l'élève (scan QR au comptoir) ---
  const [cardChild, setCardChild] = useState<CardChild | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [payingCard, setPayingCard] = useState(false);
  const [receipt, setReceipt] = useState<{ ok: boolean; text: string; reference?: string } | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<KioskOrder | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // ---- Repas du jour : ajoutable au panier comme un article ----
  const todayName = DAY_INDEX[new Date().getDay()];
  const todayMenu = weeklyMenus.find((m) => m.day === todayName && (m.items ?? []).length > 0);
  const dayMenuName = todayMenu ? todayMenu.name || `Menu du ${todayMenu.day}` : '';
  const dayMenuPrice = todayMenu ? menuTicketTotal(todayMenu) : 0;

  const addDayMenuToCart = () => {
    if (!todayMenu || dayMenuPrice <= 0) return;
    addToCart({
      id: `MENU-${todayMenu.day}`,
      name: dayMenuName,
      category: 'Menu du jour',
      price: dayMenuPrice,
      description: (todayMenu.items ?? []).map((i) => i.name).join(', '),
      image: dayPhoto(todayMenu.day) ?? '/placeholder.svg',
      available: true,
    });
  };

  // ---- Commandes de l'élève scanné (à retirer / annuler) ----
  const childOrders = cardChild
    ? kioskOrders
        .filter((o) => o.childId === cardChild.id)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
          return b.createdAt.localeCompare(a.createdAt);
        })
        .slice(0, 6)
    : [];

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
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
  };

  const stopScan = () => {
    void stopScanner();
    setScanning(false);
  };

  useEffect(() => () => {
    void stopScanner();
  }, []);

  // Démarre la caméra dès que le lecteur est affiché.
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
            void stopScanner();
            setScanning(false);
            applyTokenRef.current(text.trim());
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
  }, [scanning]);

  const applyToken = useCallback((token: string) => {
    const res = resolveChildQr(token);
    if (!res.ok || !res.child) {
      setScanError(res.message);
      setCardChild(null);
      return;
    }
    setScanError('');
    setCardChild({
      id: res.child.id,
      firstName: res.child.firstName,
      lastName: res.child.lastName,
      className: res.child.className,
      balance: res.balance,
      qrToken: res.child.qrToken ?? '',
    });
    setManualToken('');
    setScanOpen(false);
    setReceipt({ ok: true, text: res.message });
  }, [resolveChildQr]);

  // Le lecteur caméra est monté une seule fois : on garde la dernière version
  // de applyToken dans une ref pour ne pas redémarrer le scan à chaque rendu.
  const applyTokenRef = useRef(applyToken);
  useEffect(() => {
    applyTokenRef.current = applyToken;
  }, [applyToken]);

  const payWithChildCard = () => {
    if (!cardChild) return;
    setPayingCard(true);
    const items = cart.map((i) => ({ productId: i.id, productName: i.name, price: i.price, qty: i.quantity }));
    const res = sellToChildCard(cardChild.id, items, user?.username);
    setPayingCard(false);
    if (res.ok) {
      // Réglée par carte : la commande part « en attente » (retrait au scan
      // du superviseur) et le caissier atterrit sur la page Reçu.
      const order: Order = {
        id: res.order?.id ?? `POS-${Date.now()}`,
        number: res.reference ?? 'POS',
        items: cart,
        subtotal: total,
        tax: 0,
        total,
        status: 'completed',
        type: 'takeaway',
        createdAt: new Date(),
        paymentMethod: 'Carte prépayée',
        customerName: `${cardChild.firstName} ${cardChild.lastName}`,
        qrToken: cardChild.qrToken || undefined,
      };
      setCardChild(null);
      setCart([]);
      onCardSaleComplete(order);
      return;
    }
    setReceipt({ ok: false, text: res.message });
  };

  const confirmCancelOrder = () => {
    if (!orderToCancel) return;
    const res = cancelKioskOrder(orderToCancel.id);
    setReceipt({ ok: res.ok, text: res.message });
    if (res.ok && cardChild) setCardChild({ ...cardChild, balance: res.balance });
  };

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
              <p className="text-sm text-slate-600 mt-0.5">{products.length} produits disponibles</p>
            </div>
            {/* Mobile cart toggle */}
            <button onClick={() => setShowCart(true)} aria-label={cartCount > 0 ? `Ouvrir le panier, ${cartCount} articles` : 'Ouvrir le panier'} className="lg:hidden relative p-3 rounded-xl bg-green-700 text-white shadow-lg shadow-green-700/30 hover:bg-green-800">
              <ShoppingCart aria-hidden className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{cartCount}</span>
              )}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto tiny-scrollbar pb-1" role="tablist" aria-label="Catégories de produits">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'bg-green-700 text-white shadow-lg shadow-green-700/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {categoryIconsMap[cat]}
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gradient-to-br from-slate-50 to-slate-50/20">
          {todayMenu && dayMenuPrice > 0 && (
            <button
              onClick={addDayMenuToCart}
              aria-label={`Ajouter ${dayMenuName} au panier, ${formatCurrency(dayMenuPrice)}`}
              className={`w-full mb-4 text-left bg-white rounded-2xl border-2 border-amber-300 overflow-hidden hover:border-amber-500 hover:shadow-xl transition-all group ${animatingId === `MENU-${todayMenu.day}` ? 'animate-cart-pop' : ''}`}
            >
              <div className="flex items-stretch">
                <div className="w-28 sm:w-36 flex-shrink-0 overflow-hidden relative">
                  <img
                    src={dayPhoto(todayMenu.day) ?? '/placeholder.svg'}
                    alt={dayMenuName}
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="flex-1 min-w-0 p-4">
                  <p className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black uppercase tracking-widest">
                    <UtensilsCrossed aria-hidden className="w-3.5 h-3.5" /> Repas du jour · {todayMenu.day}
                  </p>
                  <h3 className="mt-2 text-base font-bold text-slate-800 truncate">{dayMenuName}</h3>
                  <p className="text-xs text-slate-500 truncate">
                    {(todayMenu.items ?? []).map((i) => i.name).join(', ')}
                  </p>
                  <p className="mt-1 text-lg font-black text-amber-600">{formatCurrency(dayMenuPrice)}</p>
                </div>
                <div className="flex items-center pr-4">
                  <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center group-hover:bg-amber-600 transition-colors">
                    <Plus aria-hidden className="w-5 h-5" />
                  </span>
                </div>
              </div>
            </button>
          )}
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg font-bold text-slate-800">Aucun produit</p>
              <p className="mt-1 text-sm text-slate-600">Le catalogue est vide.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  aria-label={`Ajouter ${product.name} au panier, ${formatCurrency(product.price)}`}
                  className={`bg-white rounded-2xl border-2 border-slate-200 overflow-hidden text-left hover:shadow-xl hover:border-green-600 transition-all group ${
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
                    <p className="text-base lg:text-lg font-bold text-green-700">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart - desktop sidebar / mobile overlay */}
      <>
        {showCart && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setShowCart(false)} />}
        <div className={`fixed right-0 top-0 bottom-0 w-80 sm:w-96 z-50 lg:static lg:w-[420px] flex flex-col bg-white transition-transform duration-300 lg:translate-x-0 shadow-2xl ${showCart ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-5 lg:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-red-50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Commande</h2>
                <span className="text-sm text-slate-600">{cart.length} article(s)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setScanOpen(true); setScanError(''); }}
                  title="Scanner le QR de l'élève pour payer sur sa carte"
                  className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    cardChild ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300 text-slate-700 hover:border-emerald-600'
                  }`}
                >
                  {cardChild ? <BadgeCheck className="w-4 h-4" /> : <ScanLine className="w-4 h-4" />}
                  {cardChild ? 'Carte élève' : 'Scanner QR'}
                </button>
                <button onClick={() => setShowCart(false)} className="lg:hidden p-2 hover:bg-white rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {cardChild && (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                <UserRound className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-emerald-900 truncate">
                    {cardChild.firstName} {cardChild.lastName} · {cardChild.className}
                  </p>
                  <p className="text-xs text-emerald-700">
                    Vente débitée sur sa carte prépayée · solde {formatCurrency(cardChild.balance)}
                  </p>
                </div>
                <button onClick={() => setCardChild(null)} className="text-emerald-700 hover:text-red-600" title="Annuler le paiement par carte">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {cardChild && childOrders.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                <p className="px-3 py-2 bg-slate-100 text-[11px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                  <Clock aria-hidden className="w-3.5 h-3.5" /> Commandes de {cardChild.firstName}
                </p>
                <ul className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                  {childOrders.map((o) => (
                    <li key={o.id} className="px-3 py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {o.items.map((i) => `${i.name}×${i.qty}`).join(', ') || 'Commande'}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {formatCurrency(o.total)} · {o.reference}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            o.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : o.status === 'served'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {o.status === 'pending' ? 'À retirer' : o.status === 'served' ? 'Servie' : 'Annulée'}
                        </span>
                        {o.status === 'pending' && (
                          <button
                            onClick={() => setOrderToCancel(o)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-100"
                          >
                            <Ban aria-hidden className="w-3 h-3" /> Annuler
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                <div key={item.id} className="flex gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors">
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
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-lg bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 hover:border-slate-400 hover:text-slate-600 transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold text-slate-800 w-8 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 rounded-lg bg-gradient-to-r from-slate-500 to-red-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-slate-500/30 transition-all">
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
            <div className="p-5 lg:p-6 border-t border-slate-200 space-y-4 bg-gradient-to-r from-slate-50 to-red-50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total</span><span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold text-slate-800 pt-3 border-t-2 border-slate-200">
                  <span>Total</span>
                  <span className="bg-gradient-to-r from-slate-600 to-red-600 bg-clip-text text-transparent">{formatCurrency(total)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setCart([]); setCardChild(null); }} className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors">
                  Vider
                </button>
                {cardChild ? (
                  <button
                    onClick={payWithChildCard}
                    disabled={payingCard || cardChild.balance < total}
                    className="flex-[2] py-3.5 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {payingCard ? <Loader2 className="w-5 h-5 animate-spin" /> : <BadgeCheck className="w-5 h-5" />}
                    {cardChild.balance < total ? 'Solde insuffisant' : 'Débiter la carte'}
                  </button>
                ) : (
                  <button
                    onClick={() => { onProceedToPayment(cart); setShowCart(false); }}
                    className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-slate-500 to-red-600 text-white font-semibold text-sm hover:shadow-xl hover:shadow-slate-500/50 transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-5 h-5" />
                    Payer
                  </button>
                )}
              </div>
              {cardChild && cardChild.balance < total && (
                <p className="text-xs font-bold text-red-600 text-center">
                  Solde carte {formatCurrency(cardChild.balance)} — il manque {formatCurrency(total - cardChild.balance)}.
                </p>
              )}
            </div>
          )}
        </div>
      </>

      {/* Mobile floating cart button */}
      {cart.length > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden fixed bottom-6 right-6 z-30 bg-gradient-to-r from-slate-500 to-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl shadow-slate-500/50 flex items-center gap-3 font-bold text-sm hover:scale-105 transition-transform"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>{cartCount} · {formatCurrency(total)}</span>
        </button>
      )}
    {/* ---------- Scan du QR élève ---------- */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { stopScan(); setScanOpen(false); }} />
          <div role="dialog" aria-modal="true" aria-label="Scanner le QR de l'élève" className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-black text-slate-900">Payer sur la carte de l'élève</h2>
              <button onClick={() => { stopScan(); setScanOpen(false); }} className="text-slate-400 hover:text-slate-700" aria-label="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                Scannez le QR de l'élève abonné : la vente est débitée sur sa carte prépayée,
                sans paiement Wave par l'enfant.
              </p>

              {scanError && (
                <p className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm font-semibold text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {scanError}
                </p>
              )}

              {scanning ? (
                <div className="space-y-3">
                  <div id={READER_ID} className="rounded-xl overflow-hidden border border-slate-200" />
                  <button onClick={stopScan} className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600">
                    Annuler le scan
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setScanError(''); setScanning(true); }}
                  className="w-full py-3.5 rounded-xl bg-slate-900 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" /> Scanner avec la caméra
                </button>
              )}

              <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> ou saisie du code <span className="h-px flex-1 bg-slate-200" />
              </div>

              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyToken(manualToken); }}
                placeholder="ORESTO-XXXXXX"
                className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-200 text-sm uppercase outline-none focus:border-emerald-600"
              />
              <button
                onClick={() => applyToken(manualToken)}
                disabled={!manualToken.trim()}
                className="w-full py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 text-sm font-bold disabled:opacity-40"
              >
                Valider le code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Confirmation de vente ---------- */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReceipt(null)} />
          <div role="status" className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
            {receipt.ok ? (
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            ) : (
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            )}
            <p className="mt-3 text-sm font-bold text-slate-800">{receipt.text}</p>
            {receipt.reference && (
              <p className="mt-1 text-xs font-black text-slate-400 tabular-nums">{receipt.reference}</p>
            )}
            <button onClick={() => setReceipt(null)} className="mt-5 w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ---------- Annulation d'une commande payée par carte ---------- */}
      <ConfirmDialog
        isOpen={!!orderToCancel}
        onClose={() => setOrderToCancel(null)}
        onConfirm={confirmCancelOrder}
        title="Annuler la commande ?"
        message={
          orderToCancel
            ? `Commande ${orderToCancel.reference} · ${formatCurrency(orderToCancel.total)}. Le montant sera recrédité sur la carte prépayée de ${cardChild ? `${cardChild.firstName} ${cardChild.lastName}` : "l'enfant"}.`
            : ''
        }
        type="danger"
        confirmText="Annuler la commande"
        cancelText="Retour"
      />
    </div>
  );
};

export default POSPage;