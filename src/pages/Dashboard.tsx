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
  Calendar,
  RotateCcw,
  FileDown
} from 'lucide-react';
import { useApp, getOrderStats, getTopProducts, getWeeklySales, getChartData } from '@/context/AppContext';
import { useProducts } from '@/context/ProductContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ConfirmDialog from '@/components/ConfirmDialog';

interface DashboardProps {
  onNavigate: (page: PageName) => void;
}

type PeriodFilter = 'realtime' | 'day' | 'week' | 'month';

const getStatCards = (orders: any[], period: PeriodFilter, activeProductCount: number, previousProductCount: number) => {
  const stats = getOrderStats(orders, period === 'realtime' ? 'day' : period);
  const periodLabel = period === 'realtime' ? 'en temps réel' : period === 'day' ? 'du jour' : period === 'week' ? 'de la semaine' : 'du mois';

  // Calcul de la variation du nombre de produits
  const productChange = activeProductCount - previousProductCount;
  const productChangeStr = productChange > 0 ? `+${productChange}` : productChange < 0 ? `${productChange}` : '0';

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
      value: activeProductCount.toString(), 
      change: productChangeStr, 
      positive: productChange >= 0, 
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
  const { orders, clearAllOrders } = useApp();
  const { products } = useProducts();
  const [period, setPeriod] = useState<PeriodFilter>('realtime');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Compter les produits actifs (disponibles)
  const activeProductCount = products.filter(p => p.available).length;
  // Pour la variation, on peut utiliser le nombre total comme référence (ou stocker l'historique)
  // Pour l'instant, on suppose une référence de 15 produits (à ajuster selon vos besoins)
  const previousProductCount = 15; // Vous pouvez stocker cette valeur dans un state ou localStorage
  
  const chartData = getChartData(orders, period);
  const topProducts = getTopProducts(orders);
  const recentOrders = orders.slice(0, 6);
  
  const statCards = getStatCards(orders, period, activeProductCount, previousProductCount);

  const handleResetData = () => {
    setShowResetConfirm(true);
  };

  const confirmResetData = () => {
    clearAllOrders();
  };

  const handleDownloadReport = async () => {
    try {
      // Dynamically import jsPDF
      const { jsPDF } = await import('jspdf');
      
      const doc = new jsPDF();
      const stats = getOrderStats(orders, 'month');
      const now = new Date();
      const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

      // Titre
      doc.setFontSize(20);
      doc.setTextColor(234, 88, 12); // Orange
      doc.text('PALAIS D\'OR', 105, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`Rapport Mensuel - ${monthName}`, 105, 30, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`, 105, 37, { align: 'center' });
      
      // Ligne de séparation
      doc.setDrawColor(234, 88, 12);
      doc.setLineWidth(0.5);
      doc.line(20, 42, 190, 42);
      
      // Statistiques principales
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Statistiques du Mois', 20, 52);
      
      doc.setFontSize(11);
      const statsY = 60;
      doc.text(`Total Revenus: ${formatCurrency(stats.revenue)}`, 20, statsY);
      doc.text(`Total Commandes: ${stats.orders}`, 20, statsY + 7);
      doc.text(`Total Clients: ${stats.customers}`, 20, statsY + 14);
      
      // Top produits
      doc.setFontSize(14);
      doc.text('Top 5 Produits', 20, statsY + 28);
      
      doc.setFontSize(10);
      topProducts.forEach((product, i) => {
        const y = statsY + 36 + (i * 7);
        doc.text(`${i + 1}. ${product.name}`, 25, y);
        doc.text(`${product.sold} vendus`, 120, y);
        doc.text(formatCurrency(product.revenue), 160, y);
      });
      
      // Commandes récentes
      doc.setFontSize(14);
      doc.text('Dernières Commandes', 20, statsY + 78);
      
      doc.setFontSize(9);
      recentOrders.slice(0, 10).forEach((order, i) => {
        const y = statsY + 86 + (i * 6);
        const date = order.createdAt.toLocaleDateString('fr-FR');
        doc.text(`${order.number}`, 25, y);
        doc.text(`${order.status}`, 60, y);
        doc.text(formatCurrency(order.total), 100, y);
        doc.text(date, 140, y);
      });
      
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Palais d\'Or - Système de gestion de restaurant', 105, 285, { align: 'center' });
      
      // Télécharger
      doc.save(`rapport-${monthName.replace(' ', '-')}.pdf`);
      
      console.log('✓ Rapport PDF téléchargé avec succès !');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      console.error('❌ Erreur: Installez jsPDF avec "npm install jspdf"');
    }
  };

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: 'realtime', label: 'Temps réel' },
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' }
  ];

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in">
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={confirmResetData}
        title="Réinitialiser les données"
        message="⚠️ Voulez-vous vraiment réinitialiser toutes les données du dashboard ? Cette action est irréversible et supprimera toutes les commandes."
        type="danger"
        confirmText="Réinitialiser"
        cancelText="Annuler"
      />
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
          
          {/* Boutons d'action */}
          <div className="flex gap-2">
            <button
              onClick={handleDownloadReport}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/50 transition-all hover:scale-105"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Rapport PDF</span>
            </button>
            <button
              onClick={handleResetData}
              className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-pink-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-red-500/50 transition-all hover:scale-105"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Réinitialiser</span>
            </button>
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
                className={`relative flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  period === option.value
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option.label}
                {option.value === 'realtime' && period === 'realtime' && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                )}
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
              <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-800 flex items-center gap-2">
                Performance {period === 'realtime' ? 'en temps réel' : period === 'day' ? 'journalière' : period === 'week' ? 'hebdomadaire' : 'mensuelle'}
                {period === 'realtime' && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                {period === 'realtime' ? 'Dernières 12 heures - Mise à jour instantanée' : 'Évolution des ventes au fil du temps'}
              </p>
            </div>
          </div>
          <div className="h-64 sm:h-72 lg:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis 
                  dataKey="label" 
                  stroke="#64748b"
                  style={{ fontSize: '12px', fontWeight: '600' }}
                  tick={{ fill: '#475569' }}
                />
                <YAxis 
                  stroke="#64748b"
                  style={{ fontSize: '11px' }}
                  tick={{ fill: '#475569' }}
                  width={60}
                  tickFormatter={(value) => {
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                    return value;
                  }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                    color: '#fff'
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}
                  itemStyle={{ color: '#fff', padding: '4px 0' }}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '5 5' }}
                  formatter={(value: any, name: string) => {
                    if (name === 'Revenus') return [formatCurrency(value), name];
                    if (name === 'Commandes') return [`${value} cmd`, name];
                    if (name === 'Clients') return [`${value} clients`, name];
                    return [value, name];
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                  formatter={(value) => (
                    <span style={{ color: '#475569', fontWeight: '600', fontSize: '13px' }}>{value}</span>
                  )}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Revenus"
                  stroke="#10b981" 
                  strokeWidth={3}
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 7, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1500}
                  animationBegin={0}
                  animationEasing="ease-in-out"
                />
                <Line 
                  type="monotone" 
                  dataKey="orders" 
                  name="Commandes"
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 7, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1500}
                  animationBegin={200}
                  animationEasing="ease-in-out"
                />
                <Line 
                  type="monotone" 
                  dataKey="customers" 
                  name="Clients"
                  stroke="#a855f7" 
                  strokeWidth={3}
                  dot={{ fill: '#a855f7', strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 7, fill: '#9333ea', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1500}
                  animationBegin={400}
                  animationEasing="ease-in-out"
                />
              </LineChart>
            </ResponsiveContainer>
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
