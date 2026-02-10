import { useState } from 'react';
import { Order } from '@/types/menu';
import { mockOrders } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { Clock, User, ShoppingBag, UtensilsCrossed, X, Check } from 'lucide-react';

const statusFilters = ['Toutes', 'En attente', 'En préparation', 'Prêtes', 'Terminées', 'Annulées'];
const statusMap: Record<string, Order['status']> = {
  'En attente': 'pending',
  'En préparation': 'preparing',
  'Prêtes': 'ready',
  'Terminées': 'completed',
  'Annulées': 'cancelled',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  preparing: 'bg-blue-100 text-blue-800 border border-blue-200',
  ready: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-slate-100 text-slate-600 border border-slate-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  preparing: 'En préparation',
  ready: 'Prêt',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const OrderHistoryPage = () => {
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [activeFilter, setActiveFilter] = useState('Toutes');

  const filtered = activeFilter === 'Toutes' ? orders : orders.filter((o) => o.status === statusMap[activeFilter]);
  const countByStatus = (status: Order['status']) => orders.filter((o) => o.status === status).length;

  const updateStatus = (id: string, newStatus: Order['status']) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Gestion des commandes</h1>
          <p className="text-sm text-slate-600 mt-1">{orders.length} commandes au total</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-100 border border-yellow-200">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-xs font-bold text-yellow-800">{countByStatus('pending')}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-100 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-bold text-blue-800">{countByStatus('preparing')}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-100 border border-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-800">{countByStatus('ready')}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto tiny-scrollbar pb-1">
        {statusFilters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeFilter === filter
                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Order Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
        {filtered.map((order) => (
          <div key={order.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-lg">{order.number}</h3>
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[order.status]}`}>
                  {statusLabels[order.status]}
                </span>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex items-center gap-1.5">
                  {order.type === 'dine-in' ? <UtensilsCrossed className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                  {order.type === 'dine-in' ? 'Sur place' : 'À emporter'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-700">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-medium">{order.customerName}</span>
              </div>

              <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
                {order.items.map((item) => (
                  <p key={item.id} className="text-sm text-slate-700">
                    <span className="font-bold text-slate-500">{item.quantity}×</span> {item.name}
                  </p>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <span className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  {formatCurrency(order.total)}
                </span>
                <div className="flex gap-2">
                  {order.status === 'pending' && (
                    <>
                      <button onClick={() => updateStatus(order.id, 'cancelled')} className="p-2 rounded-lg border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors" title="Refuser">
                        <X className="w-4 h-4" />
                      </button>
                      <button onClick={() => updateStatus(order.id, 'preparing')} className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold text-xs hover:shadow-lg transition-all">
                        Accepter
                      </button>
                    </>
                  )}
                  {order.status === 'preparing' && (
                    <button onClick={() => updateStatus(order.id, 'ready')} className="px-3 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold text-xs hover:shadow-lg transition-all flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      Prêt
                    </button>
                  )}
                  {order.status === 'ready' && (
                    <button onClick={() => updateStatus(order.id, 'completed')} className="px-3 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold text-xs hover:shadow-lg transition-all">
                      Terminé
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {filtered.length === 0 && (
        <div className="text-center py-12">
          <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Aucune commande trouvée</p>
        </div>
      )}
    </div>
  );
};

export default OrderHistoryPage;
