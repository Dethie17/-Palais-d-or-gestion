import { useState } from 'react';
import { PageName } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { 
  TrendingUp, 
  ShoppingCart, 
  Users, 
  Package, 
  ArrowRight,
  Clock,
  Calendar
} from 'lucide-react';
import { useApp, getOrderStats, getTopProducts, getWeeklySales, getChartData } from '@/context/AppContext';

interface DashboardProps {
  onNavigate: (page: PageName) => void;
}

type PeriodFilter = 'day' | 'week' | 'month';

const getStatCards = (orders: any[], period: PeriodFilter) => {
  const stats = getOrderStats(orders, period);
  const periodLabel = period === 'day' ? 'du jour' : period === 'week' ? 'de la semaine' : 'du mois';

  return [
    { 
      label: `Revenus ${periodLabel}`, 
      value: formatCurrency(stats.revenue), 
      change: stats.revenueChange, 
      positive: stats.revenueChange.startsWith('+'), 
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-teal-600',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600'
    },
    { 
      label: `Commandes ${periodLabel}`, 
      value: stats.orders.toString(), 
      change: stats.ordersChange, 
      positive: stats.ordersChange.startsWith('+'), 
      icon: ShoppingCart,
      gradient: 'from-blue-500 to-indigo-600',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      highlight: true
    },
    { 
      label: `Clients ${periodLabel}`, 
      value: stats.customers.toString(), 
      change: stats.customersChange, 
      positive: stats.customersChange.startsWith('+'), 
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
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  preparing: 'bg-blue-100 text-blue-800 border border-blue-200',
  ready: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  preparing: 'En cours',
  ready: 'Prêt',
  completed: 'Vendu',
  cancelled: 'Annulé',
};

const Dashboard = ({ onNavigate }: DashboardProps) => {
  const { orders } = useApp();
  const [period, setPeriod] = useState<PeriodFilter>('day');
  
  const chartData = getChartData(orders, period);
  const topProducts = getTopProducts(orders);
  const recentOrders = orders.slice(0, 6);
  
  // Trouver la valeur max pour normaliser les barres
  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);
  const maxOrders = Math.max(...chartData.map((d) => d.orders), 1);
  const maxCustomers = Math.max(...chartData.map((d) => d.customers), 1);
  const globalMax = Math.max(maxRevenue, maxOrders * 1000, maxCustomers * 1000);
  
  const statCards = getStatCards(orders, period);

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' }
  ];

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in">
      {/* Header avec filtres de période */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 flex items-center gap-2">
              Tableau de bord
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">Vue d'ensemble de votre restaurant</p>
          </div>
        </div>

        {/* Filtres de période */}
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 w-full sm:w-auto">
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 ml-2" />
          <div className="flex flex-1 sm:flex-none gap-1">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  period === option.value
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const isHighlight = 'highlight' in stat && stat.highlight;
          return (
            <div 
              key={stat.label} 
              className={`bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 shadow-sm border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group ${
                isHighlight 
                  ? 'border-orange-300 ring-2 ring-orange-200 bg-gradient-to-br from-white to-orange-50' 
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2 sm:mb-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-lg sm:rounded-xl ${stat.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform ${
                  isHighlight ? 'ring-2 ring-orange-300' : ''
                }`}>
                  <Icon className={`w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 ${stat.iconColor}`} strokeWidth={2.5} />
                </div>
                <span className={`text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full ${stat.positive ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                  {stat.change}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 font-medium mb-0.5 sm:mb-1">{stat.label}</p>
              <p className={`text-xl sm:text-2xl lg:text-3xl font-bold ${
                isHighlight ? 'text-orange-600' : 'text-slate-800'
              }`}>{stat.value}</p>
              {isHighlight && (
                <p className="text-[10px] sm:text-xs text-orange-600 font-semibold mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Mise en avant
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {/* Sales chart */}
        <div className="lg:col-span-2 bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-7 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
            <div>
              <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-800">
                Performance {period === 'day' ? 'journalière' : period === 'week' ? 'hebdomadaire' : 'mensuelle'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Évolution des ventes au fil du temps
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] sm:text-xs font-semibold">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                Revenus
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 text-[10px] sm:text-xs font-semibold">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                Commandes
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 text-[10px] sm:text-xs font-semibold">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                Clients
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2 sm:gap-3 lg:gap-6 h-40 sm:h-48 lg:h-64">
            {chartData.map((d, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="flex items-end gap-0.5 sm:gap-1 w-full h-full">
                  {/* Barre Revenus */}
                  <div className="relative flex-1 group/bar">
                    <div
                      className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t hover:from-emerald-600 hover:to-emerald-500 transition-all shadow-md relative overflow-hidden"
                      style={{ height: `${d.revenue > 0 ? Math.max((d.revenue / globalMax) * 100, 2) : 0}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 group-hover/bar:bg-white/40 transition-colors"></div>
                    </div>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                      {formatCurrency(d.revenue)}
                    </div>
                  </div>
                  
                  {/* Barre Commandes */}
                  <div className="relative flex-1 group/bar">
                    <div
                      className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t hover:from-blue-600 hover:to-blue-500 transition-all shadow-md relative overflow-hidden"
                      style={{ height: `${d.orders > 0 ? Math.max((d.orders * 1000 / globalMax) * 100, 2) : 0}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 group-hover/bar:bg-white/40 transition-colors"></div>
                    </div>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                      {d.orders} cmd
                    </div>
                  </div>
                  
                  {/* Barre Clients */}
                  <div className="relative flex-1 group/bar">
                    <div
                      className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t hover:from-purple-600 hover:to-purple-500 transition-all shadow-md relative overflow-hidden"
                      style={{ height: `${d.customers > 0 ? Math.max((d.customers * 1000 / globalMax) * 100, 2) : 0}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 group-hover/bar:bg-white/40 transition-colors"></div>
                    </div>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                      {d.customers} clients
                    </div>
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm font-bold text-slate-700 mt-1">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-7 shadow-sm border-2 border-orange-200 bg-gradient-to-br from-white to-orange-50">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-800">Top produits</h2>
            <div className="px-2 sm:px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-[10px] sm:text-xs font-bold">
              Plus vendus
            </div>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {topProducts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 sm:gap-3 group hover:bg-white/80 p-2 sm:p-2 rounded-lg sm:rounded-xl transition-colors border border-transparent hover:border-orange-200">
                  <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-bold text-xs sm:text-sm flex-shrink-0 ${
                    i === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-md' :
                    i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-md' :
                    i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {i + 1}
                  </div>
                  <img src={p.image} alt={p.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl object-cover shadow-md flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    <p className="text-[10px] sm:text-xs text-slate-500"><span className="font-bold text-orange-600">{p.sold}</span> vendus</p>
                  </div>
                  <span className="text-xs sm:text-sm font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent whitespace-nowrap">
                    {formatCurrency(p.revenue)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              Aucune donnée disponible
            </div>
          )}
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-7 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-5">
          <div>
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-800">Commandes récentes</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">Dernières activités</p>
          </div>
          <button 
            onClick={() => onNavigate('orders')} 
            className="text-xs sm:text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 group self-start sm:self-auto"
          >
            Voir tout
            <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          {recentOrders.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 sm:py-4 text-slate-600 font-semibold text-xs sm:text-sm">N° Commande</th>
                  <th className="text-left py-3 sm:py-4 text-slate-600 font-semibold text-xs sm:text-sm">Client</th>
                  <th className="text-left py-3 sm:py-4 text-slate-600 font-semibold text-xs sm:text-sm">Articles</th>
                  <th className="text-right py-3 sm:py-4 text-slate-600 font-semibold text-xs sm:text-sm">Montant</th>
                  <th className="text-center py-3 sm:py-4 text-slate-600 font-semibold text-xs sm:text-sm">Statut</th>
                  <th className="text-right py-3 sm:py-4 text-slate-600 font-semibold text-xs sm:text-sm">Heure</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 sm:py-4 font-semibold text-slate-800 text-xs sm:text-sm">{order.number}</td>
                    <td className="py-3 sm:py-4 text-slate-700 text-xs sm:text-sm">{order.customerName || '-'}</td>
                    <td className="py-3 sm:py-4 text-slate-600 text-xs sm:text-sm">{order.items.length} article(s)</td>
                    <td className="py-3 sm:py-4 text-right font-bold text-slate-800 text-xs sm:text-sm">{formatCurrency(order.total)}</td>
                    <td className="py-3 sm:py-4 text-center">
                      <span className={`inline-block px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="py-3 sm:py-4 text-right text-slate-600 text-xs sm:text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              Aucune commande récente
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2 sm:space-y-3">
          {recentOrders.length > 0 ? (
            <>
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 sm:p-4 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-white transition-all">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                      <p className="text-xs sm:text-sm font-bold text-slate-800">{order.number}</p>
                      <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-600 truncate">{order.customerName || 'Client'} · {order.items.length} article(s)</p>
                    <p className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      {order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm sm:text-base font-bold text-slate-800">{formatCurrency(order.total)}</p>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              Aucune commande récente
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
