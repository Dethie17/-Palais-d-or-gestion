import { salesData, topProducts, mockOrders } from '@/data/mockData';
import { PageName } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { 
  TrendingUp, 
  ShoppingCart, 
  Users, 
  Package, 
  ArrowRight,
  Clock
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: PageName) => void;
}

const statCards = [
  { 
    label: 'Revenus du jour', 
    value: formatCurrency(1607345), 
    change: '+12.5%', 
    positive: true, 
    icon: TrendingUp,
    gradient: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600'
  },
  { 
    label: 'Commandes', 
    value: '68', 
    change: '+8.2%', 
    positive: true, 
    icon: ShoppingCart,
    gradient: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600'
  },
  { 
    label: 'Clients', 
    value: '45', 
    change: '-3.1%', 
    positive: false, 
    icon: Users,
    gradient: 'from-purple-500 to-pink-600',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600'
  },
  { 
    label: 'Produits actifs', 
    value: '22', 
    change: '+2', 
    positive: true, 
    icon: Package,
    gradient: 'from-orange-500 to-red-600',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600'
  },
];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  preparing: 'bg-blue-100 text-blue-800 border border-blue-200',
  ready: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-slate-100 text-slate-600 border border-slate-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  preparing: 'En cours',
  ready: 'Prêt',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const Dashboard = ({ onNavigate }: DashboardProps) => {
  const maxSale = Math.max(...salesData.map((d) => d.amount));

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 flex items-center gap-2">
            Tableau de bord
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">Vue d'ensemble de votre restaurant</p>
        </div>
        <button
          onClick={() => onNavigate('pos')}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-orange-500/50 transition-all hover:scale-105"
        >
          <ShoppingCart className="w-5 h-5" />
          Nouvelle commande
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div 
              key={stat.label} 
              className="bg-white rounded-2xl p-5 lg:p-6 shadow-sm border border-slate-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl ${stat.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 lg:w-7 lg:h-7 ${stat.iconColor}`} strokeWidth={2.5} />
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${stat.positive ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                  {stat.change}
                </span>
              </div>
              <p className="text-sm text-slate-600 font-medium mb-1">{stat.label}</p>
              <p className="text-2xl lg:text-3xl font-bold text-slate-800">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Sales chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 lg:p-7 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg lg:text-xl font-bold text-slate-800">Ventes de la semaine</h2>
              <p className="text-sm text-slate-600 mt-0.5">Performance hebdomadaire</p>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">
              7 jours
            </div>
          </div>
          <div className="flex items-end gap-2 lg:gap-4 h-48 lg:h-60">
            {salesData.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                <span className="text-xs font-semibold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatCurrency(d.amount)}
                </span>
                <div
                  className="w-full bg-gradient-to-t from-orange-500 to-red-600 rounded-t-xl hover:from-orange-600 hover:to-red-700 transition-all shadow-lg shadow-orange-500/30 relative overflow-hidden"
                  style={{ height: `${(d.amount / maxSale) * 100}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 group-hover:bg-white/30 transition-colors"></div>
                </div>
                <span className="text-xs lg:text-sm font-semibold text-slate-700">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-white rounded-2xl p-5 lg:p-7 shadow-sm border border-slate-200">
          <h2 className="text-lg lg:text-xl font-bold text-slate-800 mb-5">Top produits</h2>
          <div className="space-y-4">
            {topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 group hover:bg-slate-50 p-2 rounded-xl transition-colors">
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${
                  i === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' :
                  i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                  i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {i + 1}
                </div>
                <img src={p.image} alt={p.name} className="w-12 h-12 rounded-xl object-cover shadow-md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.sold} vendus</p>
                </div>
                <span className="text-sm font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
                  {formatCurrency(p.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-2xl p-5 lg:p-7 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg lg:text-xl font-bold text-slate-800">Commandes récentes</h2>
            <p className="text-sm text-slate-600 mt-0.5">Dernières activités</p>
          </div>
          <button 
            onClick={() => onNavigate('orders')} 
            className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 group"
          >
            Voir tout
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-4 text-slate-600 font-semibold">N° Commande</th>
                <th className="text-left py-4 text-slate-600 font-semibold">Client</th>
                <th className="text-left py-4 text-slate-600 font-semibold">Articles</th>
                <th className="text-right py-4 text-slate-600 font-semibold">Montant</th>
                <th className="text-center py-4 text-slate-600 font-semibold">Statut</th>
                <th className="text-right py-4 text-slate-600 font-semibold">Heure</th>
              </tr>
            </thead>
            <tbody>
              {mockOrders.slice(0, 6).map((order) => (
                <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-4 font-semibold text-slate-800">{order.number}</td>
                  <td className="py-4 text-slate-700">{order.customerName}</td>
                  <td className="py-4 text-slate-600">{order.items.length} article(s)</td>
                  <td className="py-4 text-right font-bold text-slate-800">{formatCurrency(order.total)}</td>
                  <td className="py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColors[order.status]}`}>
                      {statusLabels[order.status]}
                    </span>
                  </td>
                  <td className="py-4 text-right text-slate-600 flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {mockOrders.slice(0, 6).map((order) => (
            <div key={order.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-slate-800">{order.number}</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[order.status]}`}>
                    {statusLabels[order.status]}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{order.customerName} · {order.items.length} article(s)</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-slate-800">{formatCurrency(order.total)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
