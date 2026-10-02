import { Order } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import OrestoLogo from '@/components/brand/OrestoLogo';
import { Receipt, Printer, Download, ShoppingCart, CheckCircle } from 'lucide-react';

interface ReceiptPageProps {
  order: Order | null;
  onNewOrder: () => void;
}

const ReceiptPage = ({ order, onNewOrder }: ReceiptPageProps) => {
  const handlePrint = () => window.print();
  const handleDownload = () => window.print();
  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-gradient-to-br from-slate-50 to-orange-50/20 p-6">
        <div className="text-center">
          <Receipt aria-hidden className="w-20 h-20 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-4">Aucune commande à afficher</p>
          <button onClick={onNewOrder} className="btn-primary">
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
          <h2 className="text-2xl font-bold text-slate-800 mb-1">
            {order.status === 'completed' ? 'Paiement réussi !' : 'Commande enregistrée'}
          </h2>
          <p className="text-slate-600 text-sm">
            {order.status === 'completed'
              ? 'La commande a été encaissée'
              : 'En attente d’encaissement : faites marquer « Vendu » à la caisse pour l’inclure dans le CA'}
          </p>
        </div>

        {/* Receipt ticket */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="p-6 text-center border-b-2 border-dashed border-slate-300 bg-gradient-to-b from-green-50 to-white">
            <div className="w-24 h-24 mx-auto mb-3 rounded-xl bg-white shadow-lg p-2 border border-slate-200">
              <OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">O RESTO</h2>
            <p className="text-xs text-slate-600 mt-1">10ᵉ ISM, Thiès</p>
            <p className="text-xs text-slate-600">Thiès, Sénégal</p>
            <p className="text-xs text-slate-600">Tél : +221 78 473 35 35</p>
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
            {order.extras && order.extras.length > 0 && (
              <>
                <div className="border-t border-dashed border-slate-300 pt-3 mt-3">
                  <p className="text-xs font-semibold text-orange-600 mb-3 uppercase">Suppléments</p>
                  {order.extras.map((orderExtra, index) => (
                    <div key={index} className="flex justify-between text-sm pb-2 border-b border-slate-100 last:border-0">
                      <div className="flex gap-3 flex-1">
                        <span className="text-orange-500 font-bold w-6">{orderExtra.quantity}×</span>
                        <span className="text-slate-800 font-medium">{orderExtra.extra.name}</span>
                      </div>
                      <span className="font-bold text-slate-800">{formatCurrency(orderExtra.extra.price * orderExtra.quantity)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Totals */}
          <div className="px-6 pb-6 space-y-2 border-t-2 border-dashed border-slate-300 pt-4">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Sous-total</span><span className="font-semibold">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-2xl font-bold text-slate-800 pt-3 border-t-2 border-slate-300">
              <span>TOTAL</span>
              <span className="text-green-700">{formatCurrency(order.total)}</span>
            </div>
            {order.amountReceived && (
              <>
                <div className="flex justify-between text-sm text-green-700 pt-3 border-t border-dashed border-slate-300">
                  <span className="font-semibold">Montant reçu</span>
                  <span className="font-bold">{formatCurrency(order.amountReceived)}</span>
                </div>
                {order.change !== undefined && order.change > 0 && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span className="font-semibold">Monnaie rendue</span>
                    <span className="font-bold">{formatCurrency(order.change)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Payment info */}
          <div className="px-6 pb-6 border-t-2 border-dashed border-slate-300 pt-4 text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">Payé par {order.paymentMethod}</span>
            </div>
            <p className="text-slate-600 mt-4 text-sm font-medium">Merci pour votre visite !</p>
            <p className="text-slate-500 text-xs">Merci, à bientôt</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 grid grid-cols-2 gap-3 no-print">
          <button onClick={handlePrint} className="btn-secondary">
            <Printer aria-hidden className="w-5 h-5" />
            Imprimer
          </button>
          <button onClick={handleDownload} className="btn-secondary">
            <Download aria-hidden className="w-5 h-5" />
            Télécharger
          </button>
        </div>
        <button
          onClick={onNewOrder}
          className="btn-primary w-full mt-3 py-4 no-print"
        >
          <ShoppingCart aria-hidden className="w-5 h-5" />
          Nouvelle commande
        </button>
      </div>
    </div>
  );
};

export default ReceiptPage;
