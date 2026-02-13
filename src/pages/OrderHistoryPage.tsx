import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Clock, ShoppingBag, Search, Trash2, XCircle, CheckCircle, Receipt } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Order } from '@/types/menu';
import ConfirmDialog from '@/components/ConfirmDialog';

interface ReceiptModalProps {
  order: Order;
  onClose: () => void;
}

const ReceiptModal = ({ order, onClose }: ReceiptModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Receipt ticket */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="p-6 text-center border-b-2 border-dashed border-slate-300 bg-gradient-to-b from-orange-50 to-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <XCircle className="w-5 h-5 text-slate-600" />
            </button>
            <div className="w-24 h-24 mx-auto mb-3 rounded-xl bg-white shadow-lg p-2 border border-slate-200">
              <img src="/logo.png" alt="Palais d'Or" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Palais d'Or</h2>
            <p className="text-xs text-slate-600 mt-1">10ème ISM thiès</p>
            <p className="text-xs text-slate-600">Thiès, Sénégal</p>
            <p className="text-xs text-slate-600">Tél: +221 XX XX XX XX</p>
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
            )}
          </div>

          {/* Totals */}
          <div className="px-6 pb-6 space-y-2 border-t-2 border-dashed border-slate-300 pt-4">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Sous-total</span><span className="font-semibold">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-2xl font-bold text-slate-800 pt-3 border-t-2 border-slate-300">
              <span>TOTAL</span>
              <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">{formatCurrency(order.total)}</span>
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
            {order.paymentMethod && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Payé par {order.paymentMethod}</span>
              </div>
            )}
            <p className="text-slate-600 mt-4 text-sm font-medium">Merci pour votre visite !</p>
            <p className="text-slate-500 text-xs">À bientôt chez Palais d'Or</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const OrderHistoryPage = () => {
  const { orders, updateOrder, deleteOrder } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', type: 'warning', onConfirm: () => {} });

  const filteredOrders = orders.filter((order) =>
    order.number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCancelOrder = (orderId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Annuler la commande',
      message: 'Voulez-vous vraiment annuler cette commande ?',
      type: 'warning',
      onConfirm: () => updateOrder(orderId, { status: 'cancelled' }),
    });
  };

  const handleDeleteOrder = (orderId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Supprimer la commande',
      message: 'Voulez-vous vraiment supprimer cette commande ? Cette action est irréversible.',
      type: 'danger',
      onConfirm: () => deleteOrder(orderId),
    });
  };

  const handleMarkAsSold = (orderId: string) => {
    updateOrder(orderId, { status: 'completed' });
  };

  const handleViewReceipt = (order: Order) => {
    setSelectedOrder(order);
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'En attente',
      preparing: 'En préparation',
      ready: 'Prêt',
      completed: 'Vendu',
      cancelled: 'Annulé',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      preparing: 'bg-blue-100 text-blue-800 border-blue-200',
      ready: 'bg-green-100 text-green-800 border-green-200',
      completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    return colors[status] || 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 sm:space-y-6 animate-fade-in">
      {selectedOrder && <ReceiptModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="Confirmer"
        cancelText="Annuler"
      />
      
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">Historique des commandes</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">{orders.length} commandes au total</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par numéro de commande..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 border-slate-200 bg-white focus:border-orange-400 focus:ring-4 focus:ring-orange-100 outline-none transition-all text-sm sm:text-base font-medium text-slate-800 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Order Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
        {filteredOrders.map((order) => (
          <div key={order.id} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
            <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-base sm:text-lg">{order.number}</h3>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 bg-slate-100 px-2.5 sm:px-3 py-1.5 rounded-lg">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              
              <div className="text-xs sm:text-sm text-slate-500">
                {order.createdAt.toLocaleDateString('fr-FR', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </div>

              <div className="space-y-2 bg-orange-50/50 rounded-lg sm:rounded-xl p-3 border border-orange-100">
                <p className="text-xs font-semibold text-slate-600 mb-2">Articles commandés :</p>
                {order.items.map((item) => (
                  <p key={item.id} className="text-xs sm:text-sm text-slate-700 flex justify-between">
                    <span>
                      <span className="font-bold text-orange-600">{item.quantity}×</span> {item.name}
                    </span>
                    <span className="font-semibold text-slate-600">{formatCurrency(item.price * item.quantity)}</span>
                  </p>
                ))}
                {order.extras && order.extras.length > 0 && (
                  <>
                    <div className="border-t border-orange-200 pt-2 mt-2">
                      <p className="text-xs font-semibold text-orange-600 mb-2">Suppléments :</p>
                      {order.extras.map((orderExtra, index) => (
                        <p key={index} className="text-xs sm:text-sm text-slate-700 flex justify-between">
                          <span>
                            <span className="font-bold text-orange-600">{orderExtra.quantity}×</span> {orderExtra.extra.name}
                          </span>
                          <span className="font-semibold text-slate-600">{formatCurrency(orderExtra.extra.price * orderExtra.quantity)}</span>
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t-2 border-slate-200">
                <span className="text-sm sm:text-base text-slate-600 font-semibold">Total</span>
                <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  {formatCurrency(order.total)}
                </span>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-center">
                <span className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border-2 ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
              </div>

              {order.paymentMethod && (
                <div className="text-xs sm:text-sm text-slate-500 text-center bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                  <span className="font-semibold text-green-700">Payé par {order.paymentMethod}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-3 border-t border-slate-200">
                {/* Voir Ticket Button - Always visible */}
                <button
                  onClick={() => handleViewReceipt(order)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold text-xs sm:text-sm hover:shadow-lg hover:shadow-blue-500/50 transition-all active:scale-95"
                  title="Voir le ticket"
                >
                  <Receipt className="w-4 h-4" />
                  Voir ticket
                </button>

                {/* Action Buttons Row */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Vendu Button - Only if not completed or cancelled */}
                  {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => handleMarkAsSold(order.id)}
                      className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold text-xs hover:shadow-lg hover:shadow-green-500/50 transition-all active:scale-95"
                      title="Marquer comme vendu"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Vendu</span>
                    </button>
                  )}
                  
                  {/* Annuler Button - Only if not completed or cancelled */}
                  {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancelOrder(order.id)}
                      className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-yellow-100 border-2 border-yellow-300 text-yellow-800 font-semibold text-xs hover:bg-yellow-200 transition-all active:scale-95"
                      title="Annuler la commande"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Annuler</span>
                    </button>
                  )}
                  
                  {/* Supprimer Button - Always visible */}
                  <button
                    onClick={() => handleDeleteOrder(order.id)}
                    className={`flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-red-100 border-2 border-red-300 text-red-800 font-semibold text-xs hover:bg-red-200 transition-all active:scale-95 ${
                      order.status === 'completed' || order.status === 'cancelled' ? 'col-span-3' : ''
                    }`}
                    title="Supprimer la commande"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Supprimer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <ShoppingBag className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-sm sm:text-base text-slate-500 font-medium">
            {searchQuery ? 'Aucune commande trouvée pour cette recherche' : 'Aucune commande trouvée'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              Réinitialiser la recherche
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderHistoryPage;
