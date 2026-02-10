import { useState } from 'react';
import { CartItem, Order } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { 
  ArrowLeft, 
  Banknote, 
  CreditCard, 
  Smartphone, 
  Receipt, 
  CheckCircle,
  Delete
} from 'lucide-react';

interface PaymentPageProps {
  cart: CartItem[];
  onPaymentComplete: (order: Order) => void;
  onBack: () => void;
}

const paymentMethods = [
  { id: 'cash', label: 'Espèces', icon: Banknote, gradient: 'from-green-500 to-emerald-600' },
  { id: 'card', label: 'Carte bancaire', icon: CreditCard, gradient: 'from-blue-500 to-indigo-600' },
  { id: 'mobile', label: 'Mobile Money', icon: Smartphone, gradient: 'from-orange-500 to-red-600' },
  { id: 'voucher', label: 'Chèque resto', icon: Receipt, gradient: 'from-purple-500 to-pink-600' },
];

const PaymentPage = ({ cart, onPaymentComplete, onBack }: PaymentPageProps) => {
  const [selectedMethod, setSelectedMethod] = useState('mobile');
  const [amountReceived, setAmountReceived] = useState('');

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  const received = parseFloat(amountReceived) || 0;
  const change = received - total;

  const handleNumpad = (val: string) => {
    if (val === '←') {
      setAmountReceived((prev) => prev.slice(0, -1));
    } else {
      setAmountReceived((prev) => prev + val);
    }
  };

  const handleConfirmPayment = () => {
    const order: Order = {
      id: Date.now().toString(),
      number: `CMD-${String(Math.floor(Math.random() * 900) + 100)}`,
      items: cart,
      subtotal,
      tax,
      total,
      status: 'completed',
      type: 'dine-in',
      createdAt: new Date(),
      paymentMethod: paymentMethods.find((m) => m.id === selectedMethod)?.label,
    };
    onPaymentComplete(order);
  };

  const canPay = selectedMethod === 'cash' ? received >= total : true;

  return (
    <div className="p-4 lg:p-8 animate-fade-in min-h-screen bg-gradient-to-br from-slate-50 to-orange-50/20">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6 transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Retour au panier
      </button>

      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mb-8">Paiement</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 max-w-6xl">
        {/* Order Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8 shadow-sm">
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
          <div className="border-t-2 border-slate-200 pt-4 space-y-3">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Sous-total</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>TVA (10%)</span>
              <span className="font-semibold">{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-2xl lg:text-3xl font-bold text-slate-800 pt-4 border-t-2 border-slate-200">
              <span>Total</span>
              <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Methods + Numpad */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-4">Méthode de paiement</h2>
            <div className="grid grid-cols-2 gap-3">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex flex-col items-center gap-3 p-4 lg:p-5 rounded-2xl border-2 transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50 shadow-lg shadow-orange-500/20 scale-105'
                        : 'border-slate-200 bg-white hover:border-orange-300 hover:shadow-md'
                    }`}
                  >
                    <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center ${
                      isSelected 
                        ? `bg-gradient-to-br ${method.gradient}` 
                        : 'bg-slate-100'
                    }`}>
                      <Icon className={`w-6 h-6 lg:w-7 lg:h-7 ${isSelected ? 'text-white' : 'text-slate-600'}`} strokeWidth={2.5} />
                    </div>
                    <span className={`text-sm font-semibold ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}>
                      {method.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
                    className="py-4 lg:py-5 rounded-xl bg-white border-2 border-slate-200 text-lg lg:text-xl font-bold text-slate-800 hover:bg-slate-50 hover:border-orange-400 active:scale-95 transition-all shadow-sm"
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
            className={`w-full py-4 lg:py-5 rounded-2xl font-bold text-base lg:text-lg transition-all flex items-center justify-center gap-3 shadow-xl ${
              canPay
                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-orange-500/50 hover:scale-105'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <CheckCircle className="w-6 h-6" />
            Confirmer le paiement
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
