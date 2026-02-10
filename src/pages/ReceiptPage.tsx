import { Order } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { Receipt, Printer, Download, ShoppingCart, ChefHat, CheckCircle } from 'lucide-react';

interface ReceiptPageProps {
  order: Order | null;
  onNewOrder: () => void;
}

const ReceiptPage = ({ order, onNewOrder }: ReceiptPageProps) => {
  if (!order) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-orange-50/20">
        <div className="text-center">
          <Receipt className="w-20 h-20 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-4">Aucune commande à afficher</p>
          <button onClick={onNewOrder} className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-orange-500/50 transition-all hover:scale-105">
            Nouvelle commande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 flex justify-center animate-fade-in min-h-screen bg-gradient-to-br from-slate-50 to-orange-50/20">
      <div className="w-full max-w-md">
        {/* Success Badge */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 mb-3">
            <CheckCircle className="w-9 h-9 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Paiement réussi !</h2>
          <p className="text-slate-600 text-sm">La commande a été enregistrée</p>
        </div>

        {/* Receipt ticket */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="p-6 text-center border-b-2 border-dashed border-slate-300 bg-gradient-to-b from-orange-50 to-white">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 mx-auto mb-3 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <ChefHat className="w-8 h-8 text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">FoodDash Hub</h2>
            <p className="text-xs text-slate-600 mt-1">12 Rue de la Gastronomie</p>
            <p className="text-xs text-slate-600">Douala, Cameroun</p>
            <p className="text-xs text-slate-600">Tél: +237 6 XX XX XX XX</p>
            <div className="mt-4 pt-3 border-t border-dashed border-slate-300">
              <div className="inline-block px-4 py-2 bg-slate-800 rounded-lg mb-2">
                <p className="text-sm font-bold text-white">{order.number}</p>
              </div>
              <p className="text-xs text-slate-500">
                {order.createdAt.toLocaleDateString('fr-FR')} à {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          {/* Items */}
          <div className="p-6 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm pb-2 border-b border-slate-100 last:border-0">
                <div className="flex gap-3 flex-1">
                  <span className="text-slate-500 font-bold w-6">{item.quantity}×</span>
                  <span className="text-slate-800 font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-slate-800">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-6 pb-6 space-y-2 border-t-2 border-dashed border-slate-300 pt-4">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Sous-total</span><span className="font-semibold">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>TVA (10%)</span><span className="font-semibold">{formatCurrency(order.tax)}</span>
            </div>
            <div className="flex justify-between text-2xl font-bold text-slate-800 pt-3 border-t-2 border-slate-300">
              <span>TOTAL</span>
              <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Payment info */}
          <div className="px-6 pb-6 border-t-2 border-dashed border-slate-300 pt-4 text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">Payé par {order.paymentMethod}</span>
            </div>
            <p className="text-slate-600 mt-4 text-sm font-medium">Merci pour votre visite !</p>
            <p className="text-slate-500 text-xs">À bientôt chez FoodDash Hub 🍔</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-orange-300 transition-all">
            <Printer className="w-5 h-5" />
            Imprimer
          </button>
          <button className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-orange-300 transition-all">
            <Download className="w-5 h-5" />
            Télécharger
          </button>
        </div>
        <button
          onClick={onNewOrder}
          className="w-full mt-3 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold text-sm hover:shadow-xl hover:shadow-orange-500/50 transition-all hover:scale-105 flex items-center justify-center gap-2"
        >
          <ShoppingCart className="w-5 h-5" />
          Nouvelle commande
        </button>
      </div>
    </div>
  );
};

export default ReceiptPage;
