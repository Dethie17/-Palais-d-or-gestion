import { useState } from 'react';
import { CartItem, Order, ProductExtra } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { WAVE_BUSINESS_URL, WAVE_BUSINESS_NAME, INTOUCH_MERCHANT_NAME, INTOUCH_USSD_URL } from '@/lib/wave';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle,
  Delete,
  Plus,
  Minus,
  ExternalLink,
  Copy,
  Loader2,
  RefreshCw
} from 'lucide-react';

interface PaymentPageProps {
  cart: CartItem[];
  onPaymentComplete: (order: Order) => void;
  onBack: () => void;
}

const paymentMethods = [
  { id: 'wave', label: 'Wave', icon: Smartphone, gradient: 'from-blue-500 to-cyan-600', available: true },
  { id: 'cash', label: 'Espèces (comptant)', icon: Banknote, gradient: 'from-green-500 to-emerald-600', available: true },
  { id: 'intouch', label: 'InTouch', icon: Smartphone, gradient: 'from-purple-500 to-indigo-600', available: true },
  { id: 'mobile_money', label: 'Mobile Money', icon: CreditCard, gradient: 'from-amber-500 to-slate-600', available: true },
];

const availableExtras: ProductExtra[] = [
  { id: 'frites', name: 'Frites', price: 500 },
  { id: 'eau', name: 'Eau', price: 300 },
  { id: 'boisson', name: 'Boisson', price: 500 },
  { id: 'fromage', name: 'Fromage', price: 400 },
];

const extraImages: Record<string, string> = {
  frites: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=150&h=150&fit=crop',
  eau: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=150&h=150&fit=crop',
  boisson: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=150&h=150&fit=crop',
  fromage: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=150&h=150&fit=crop',
};

const PaymentPage = ({ cart, onPaymentComplete, onBack }: PaymentPageProps) => {
  const [selectedMethod, setSelectedMethod] = useState('wave');
  const [amountReceived, setAmountReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<{ [key: string]: number }>({});
  const [linkCopied, setLinkCopied] = useState(false);
  const [intouchCode, setIntouchCode] = useState('');
  const [intouchConfirming, setIntouchConfirming] = useState(false);
  const [intouchLinkCopied, setIntouchLinkCopied] = useState(false);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const extrasTotal = Object.entries(selectedExtras).reduce((sum, [extraId, quantity]) => {
    const extra = availableExtras.find(e => e.id === extraId);
    return sum + (extra ? extra.price * quantity : 0);
  }, 0);
  const total = subtotal + extrasTotal;
  const received = parseFloat(amountReceived) || 0;
  const change = received - total;

  const handleNumpad = (val: string) => {
    if (val === '←') {
      setAmountReceived((prev) => prev.slice(0, -1));
    } else {
      setAmountReceived((prev) => prev + val);
    }
  };

  const handleIncreaseExtra = (extraId: string) => {
    setSelectedExtras(prev => ({
      ...prev,
      [extraId]: (prev[extraId] || 0) + 1
    }));
  };

  const handleDecreaseExtra = (extraId: string) => {
    setSelectedExtras(prev => {
      const newQuantity = (prev[extraId] || 0) - 1;
      if (newQuantity <= 0) {
        const { [extraId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [extraId]: newQuantity };
    });
  };

  const handleConfirmPayment = () => {
    const orderExtras = Object.entries(selectedExtras)
      .filter(([_, quantity]) => quantity > 0)
      .map(([extraId, quantity]) => ({
        extra: availableExtras.find(e => e.id === extraId)!,
        quantity
      }));

    const name = customerName.trim();
    const uid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const orderNumber = `CMD-${new Date().getFullYear().toString().slice(2)}${String(Date.now()).slice(-6)}`;
    const qrToken = `ORESTO-ORDER:${uid}:${orderNumber}:${total}:${Date.now()}`;
    const order: Order = {
      id: uid,
      number: orderNumber,
      items: cart,
      extras: orderExtras.length > 0 ? orderExtras : undefined,
      subtotal,
      tax: 0,
      total,
      status: 'pending',
      type: 'takeaway',
      createdAt: new Date(),
      customerName: name || undefined,
      paymentMethod: paymentMethods.find((m) => m.id === selectedMethod)?.label,
      amountReceived: selectedMethod === 'cash' ? received : undefined,
      change: selectedMethod === 'cash' && received >= total ? change : undefined,
      qrToken,
    };
    onPaymentComplete(order);
  };

  const canPay = cart.length > 0 && (selectedMethod === 'cash' ? received >= total && total > 0 : total > 0);

  const copyWaveLink = async () => {
    try {
      await navigator.clipboard.writeText(WAVE_BUSINESS_URL);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const copyIntouchLink = async () => {
    try {
      await navigator.clipboard.writeText(INTOUCH_USSD_URL);
      setIntouchLinkCopied(true);
      window.setTimeout(() => setIntouchLinkCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  if (cart.length === 0) {
    return (
      <div className="p-6 lg:p-8 min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold text-slate-800">Panier vide</p>
          <p className="mt-2 text-sm text-slate-600">Ajoutez des articles depuis la caisse avant de passer au paiement.</p>
          <button onClick={onBack} className="btn-primary mt-6">Retour à la caisse</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-fade-in min-h-screen bg-gradient-to-br from-slate-50 to-slate-50/20">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6 transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Retour au panier
      </button>

      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mb-8">Paiement</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 max-w-6xl">
        {/* Order Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-5">Récapitulatif</h2>
            <div className="space-y-3 mb-6">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-start pb-3 border-b border-slate-100 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Quantité: {item.quantity}</p>
                  </div>
                  <span className="font-bold text-slate-800">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Suppléments */}
          <div className="border-t-2 border-slate-200 pt-4">
            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-slate-600" />
              Ajouter des suppléments
            </h3>
            <div className="space-y-3">
              {availableExtras.map((extra) => (
                <div key={extra.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors">
                  <img 
                    src={extraImages[extra.id]} 
                    alt={extra.name}
                    className="w-12 h-12 rounded-lg object-cover shadow-md flex-shrink-0"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{extra.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(extra.price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDecreaseExtra(extra.id)}
                      disabled={!selectedExtras[extra.id]}
                      className="w-8 h-8 rounded-lg bg-white border-2 border-slate-200 flex items-center justify-center hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                      <Minus className="w-4 h-4 text-slate-700" />
                    </button>
                    <span className="w-8 text-center font-bold text-slate-800">{selectedExtras[extra.id] || 0}</span>
                    <button
                      onClick={() => handleIncreaseExtra(extra.id)}
                      className="w-8 h-8 rounded-lg bg-gradient-to-r from-slate-500 to-red-600 text-white flex items-center justify-center hover:shadow-lg hover:shadow-slate-500/50 transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t-2 border-slate-200 pt-4 space-y-3">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Sous-total commande</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            {extrasTotal > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Suppléments</span>
                <span className="font-semibold">{formatCurrency(extrasTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl lg:text-3xl font-bold text-slate-800 pt-4 border-t-2 border-slate-200">
              <span>Total</span>
              <span className="text-green-700">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Methods + Numpad */}
        <div className="space-y-6">
          <div>
            <label htmlFor="customer-name" className="label-pro">Client (reçu + stats)</label>
            <input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom du client (ex : Awa Diallo)"
              autoComplete="name"
              className="input-pro"
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-4">Méthode de paiement</h2>
            <div className="grid grid-cols-2 gap-3">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedMethod === method.id;
                const isAvailable = method.available;
                return (
                  <button
                    key={method.id}
                    onClick={() => isAvailable && setSelectedMethod(method.id)}
                    disabled={!isAvailable}
                    className={`relative flex flex-col items-center gap-3 p-4 lg:p-5 rounded-2xl border-2 transition-all ${
                      !isAvailable
                        ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'border-slate-500 bg-slate-50 shadow-lg shadow-slate-500/20 scale-105'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    {!isAvailable && (
                      <div className="absolute top-2 right-2">
                        <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                          Indisponible
                        </span>
                      </div>
                    )}
                    <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center ${
                      !isAvailable
                        ? 'bg-slate-200'
                        : isSelected 
                        ? `bg-gradient-to-br ${method.gradient}` 
                        : 'bg-slate-100'
                    }`}>
                      <Icon className={`w-6 h-6 lg:w-7 lg:h-7 ${
                        !isAvailable 
                          ? 'text-slate-400'
                          : isSelected ? 'text-white' : 'text-slate-600'
                      }`} strokeWidth={2.5} />
                    </div>
                    <span className={`text-sm font-semibold ${
                      !isAvailable
                        ? 'text-slate-400'
                        : isSelected ? 'text-slate-800' : 'text-slate-600'
                    }`}>
                      {method.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedMethod === 'wave' && (
            <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-blue-600 flex items-center justify-center gap-1.5">
                <Smartphone className="w-4 h-4" /> Paiement Wave Business
              </p>
              <p className="mt-1 text-sm font-bold text-slate-800">{WAVE_BUSINESS_NAME}</p>
              <p className="text-3xl lg:text-4xl font-black text-slate-900 mt-2">{formatCurrency(total)}</p>
              <p className="text-xs text-slate-500 mt-1">Le client paie exactement ce montant via le lien ou le QR.</p>
              <div className="mt-4 inline-block p-3 bg-white rounded-2xl border shadow-sm">
                <QRCodeSVG value={WAVE_BUSINESS_URL} size={170} level="M" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={WAVE_BUSINESS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
                >
                  <ExternalLink className="w-4 h-4" /> Ouvrir le lien
                </a>
                <button
                  onClick={copyWaveLink}
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                >
                  <Copy className="w-4 h-4" /> {linkCopied ? 'Copié !' : 'Copier'}
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                Vérifiez la notification Wave Business sur le téléphone, puis cliquez ci-dessous sur « Paiement Wave reçu ».
              </p>
            </div>
          )}

          {selectedMethod === 'intouch' && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-b from-purple-50 to-white p-5 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-purple-600 flex items-center justify-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Paiement InTouch
                </p>
                <p className="mt-1 text-sm font-bold text-slate-800">{INTOUCH_MERCHANT_NAME}</p>
                <p className="text-3xl lg:text-4xl font-black text-slate-900 mt-2">{formatCurrency(total)}</p>
                <p className="text-xs text-slate-500 mt-1">Le client paie exactement ce montant via InTouch.</p>
                <div className="mt-4 inline-block p-3 bg-white rounded-2xl border shadow-sm">
                  <QRCodeSVG value={INTOUCH_USSD_URL} size={170} level="M" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a
                    href={INTOUCH_USSD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700"
                  >
                    <ExternalLink className="w-4 h-4" /> Ouvrir le lien
                  </a>
                  <button
                    onClick={copyIntouchLink}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                  >
                    <Copy className="w-4 h-4" /> {intouchLinkCopied ? 'Copié !' : 'Copier'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                  Le client compose *144# sur son téléphone, suit les instructions, puis saisissez le code de confirmation ci-dessous.
                </p>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-purple-800 mb-1">Code de confirmation InTouch (6 chiffres)</label>
                <input
                  type="text"
                  value={intouchCode}
                  onChange={(e) => setIntouchCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Ex: 123456"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 text-center text-2xl font-bold tracking-widest outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>
            </div>
          )}

          {selectedMethod === 'cash' && (
            <div className="space-y-4">
              <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200">
                <p className="text-sm font-medium text-slate-600 mb-2">Montant reçu</p>
                <p className="text-3xl lg:text-4xl font-bold text-green-700 mb-3">
                  {formatCurrency(received)}
                </p>
                {received >= total && change > 0 && (
                  <div className="pt-3 border-t-2 border-green-200">
                    <p className="text-sm font-medium text-slate-600 mb-1">Monnaie à rendre</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(change)}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '←'].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleNumpad(val)}
                    className="py-4 lg:py-5 rounded-xl bg-white border-2 border-slate-200 text-lg lg:text-xl font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition-all shadow-sm"
                  >
                    {val === '←' ? <Delete className="w-5 h-5 mx-auto" /> : val}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleConfirmPayment}
            disabled={!canPay}
            aria-disabled={!canPay}
            className="btn-primary w-full py-4 lg:py-5 text-base lg:text-lg shadow-xl"
          >
            <CheckCircle aria-hidden className="w-6 h-6" />
            {selectedMethod === 'wave' ? 'Paiement Wave reçu — encaisser' : 'Confirmer le paiement'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
