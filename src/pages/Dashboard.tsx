import { useMemo, useState } from 'react';
import { PageName, Order } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { ismPeriod, ismLastMonths, monthStart, globalChartData } from '@/lib/ismFinance';
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  ArrowRight,
  Clock,
  Calendar,
  FileDown,
  FileSpreadsheet,
  Crown,
  AlertTriangle,
  UtensilsCrossed,
  Landmark,
  Radar,
} from 'lucide-react';
import { useApp, getOrderStats, getTopProducts } from '@/context/AppContext';
import { useProducts } from '@/context/ProductContext';
import { useResto } from '@/context/RestoContext';
import { useAuth } from '@/context/AuthContext';
import { canAccess } from '@/lib/permissions';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';


interface DashboardProps {
  onNavigate: (page: PageName) => void;
}

type PeriodFilter = 'realtime' | 'day' | 'week' | 'month';

const DARK_CARD = 'bg-slate-900 border border-slate-800 rounded-2xl shadow-sm';

const getStatCards = (orders: Order[], period: PeriodFilter, activeProductCount: number, previousProductCount: number) => {
  const stats = getOrderStats(orders, period === 'realtime' ? 'day' : period);
  const periodLabel = period === 'realtime' ? 'en temps réel' : period === 'day' ? 'du jour' : period === 'week' ? 'de la semaine' : 'du mois';

  const productChange = activeProductCount - previousProductCount;
  const productChangeStr = productChange > 0 ? `+${productChange}` : productChange < 0 ? `${productChange}` : '0';

  return [
    {
      label: `Revenus ${periodLabel}`,
      value: formatCurrency(stats.revenue),
      change: stats.revenueChange,
      positive: stats.revenueChange.startsWith('+'),
      icon: TrendingUp,
      chip: 'bg-slate-500/15 text-slate-400',
    },
    {
      label: `Commandes ${periodLabel}`,
      value: stats.orders.toString(),
      change: stats.ordersChange,
      positive: stats.ordersChange.startsWith('+'),
      icon: ShoppingCart,
      chip: 'bg-slate-500/15 text-slate-300',
    },
    {
      label: `Clients ${periodLabel}`,
      value: stats.customers.toString(),
      change: stats.customersChange,
      positive: stats.customersChange.startsWith('+'),
      icon: Users,
      chip: 'bg-slate-500/15 text-slate-300',
    },
    {
      label: 'Produits actifs',
      value: activeProductCount.toString(),
      change: productChangeStr,
      positive: productChange >= 0,
      icon: Package,
      chip: 'bg-emerald-500/15 text-emerald-400',
    },
  ];
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
  preparing: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  ready: 'bg-green-500/15 text-green-300 border border-green-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-300 border border-red-500/30',
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
  const { products } = useProducts();
  const { subscriptions, payments, validations, stats: restoStats, financeSettings, formulas } = useResto();
  const { user } = useAuth();
  const [period, setPeriod] = useState<PeriodFilter>('realtime');


  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const pendingCash = payments.filter((p) => p.status === 'pending');
  const expiringSoon = subscriptions.filter((s) => {
    if (s.status !== 'active') return false;
    const days = Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000);
    return days <= 2 && days >= 0;
  });
  const lowMeals = subscriptions.filter((s) => s.status === 'active' && s.mealsRemaining <= 2 && s.mealsRemaining > 0);
  const todayAccepted = validations.filter((v) => {
    const d = new Date(v.validatedAt); const n = new Date();
    return v.status === 'accepted' && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  });

  const activeProductCount = products.filter(p => p.available).length;
  const previousProductCount = products.length;

  // Courbe DG : caisse + abonnements (la caisse seule reste vide en cantine scolaire)
  const globalData = globalChartData(orders, payments, period);
  const hasGlobalData = globalData.some((d) => d.total > 0);
  const topProducts = getTopProducts(orders);
  const recentOrders = orders.slice(0, 6);

  const statCards = getStatCards(orders, period, activeProductCount, previousProductCount);

  // ---- Chiffre d'affaires : caisse (commandes vendues) + abonnements (paiements encaissés)
  const nowRef = new Date();
  const startOfDay = new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate(), 0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
  const startOfMonth = monthStart(nowRef);

  const paidPayments = payments.filter((p) => p.status === 'paid');
  const sumSubsSince = (d: Date) =>
    paidPayments.filter((p) => new Date(p.createdAt).getTime() >= d.getTime())
      .reduce((sum, p) => sum + p.amount, 0);

  const caDay = { orders: getOrderStats(orders, 'day').revenue, subs: sumSubsSince(startOfDay) };
  const caWeek = { orders: getOrderStats(orders, 'week').revenue, subs: sumSubsSince(startOfWeek) };
  const caMonth = { orders: getOrderStats(orders, 'month').revenue, subs: sumSubsSince(startOfMonth) };

  // ---- Comptabilité ISM du mois (espace DG) : 2000 F / abonnement + % ventes
  const ismMonth = useMemo(
    () => ismPeriod(payments, orders, subscriptions, formulas, financeSettings, startOfMonth.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, orders, subscriptions, formulas, financeSettings, startOfMonth.getTime()],
  );
  const ismHistory = useMemo(
    () => ismLastMonths(payments, orders, subscriptions, formulas, financeSettings, 6),
    [payments, orders, subscriptions, formulas, financeSettings],
  );

  const handleDownloadReport = async () => {
    try {
      const { jsPDF } = await import('jspdf');

      const doc = new jsPDF();
      const stats = getOrderStats(orders, 'month');
      const now = new Date();
      const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

      doc.setFontSize(20);
      doc.setTextColor(234, 88, 12);
      doc.text('O RESTO', 105, 20, { align: 'center' });

      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`Rapport Mensuel - ${monthName}`, 105, 30, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`, 105, 37, { align: 'center' });

      doc.setDrawColor(234, 88, 12);
      doc.setLineWidth(0.5);
      doc.line(20, 42, 190, 42);

      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Statistiques du Mois (caisse)', 20, 52);

      doc.setFontSize(11);
      const statsY = 60;
      doc.text(`Total Revenus: ${formatCurrency(stats.revenue)}`, 20, statsY);
      doc.text(`Total Commandes: ${stats.orders}`, 20, statsY + 7);
      doc.text(`Total Clients: ${stats.customers}`, 20, statsY + 14);

      doc.setFontSize(14);
      doc.text("Chiffre d'affaires global (caisse + abonnements)", 20, statsY + 28);
      doc.setFontSize(11);
      doc.text(`CA du jour: ${formatCurrency(caDay.orders + caDay.subs)} (caisse ${formatCurrency(caDay.orders)} + abos ${formatCurrency(caDay.subs)})`, 20, statsY + 36);
      doc.text(`CA de la semaine: ${formatCurrency(caWeek.orders + caWeek.subs)} (caisse ${formatCurrency(caWeek.orders)} + abos ${formatCurrency(caWeek.subs)})`, 20, statsY + 43);
      doc.text(`CA du mois: ${formatCurrency(caMonth.orders + caMonth.subs)} (caisse ${formatCurrency(caMonth.orders)} + abos ${formatCurrency(caMonth.subs)})`, 20, statsY + 50);
      doc.text(`Abonnes actifs: ${restoStats.activeClients} - Repas valides aujourd'hui: ${todayAccepted.length}`, 20, statsY + 57);

      // Solde ISM du mois
      doc.setFontSize(14);
      doc.text('Solde ISM du mois (à verser)', 20, statsY + 71);
      doc.setFontSize(11);
      doc.text(`Abonnements: ${ismMonth.aboCount} x ${formatCurrency(financeSettings.ismPerSubscription)} = ${formatCurrency(ismMonth.ismAbo)}`, 20, statsY + 79);
      doc.text(`  dont Préscolaire-Élémentaire: ${ismMonth.split.primaire} • Lycée: ${ismMonth.split.lycee} • Hebdo: ${ismMonth.split.hebdo}`, 20, statsY + 86);
      doc.text(`Ventes: ${formatCurrency(ismMonth.salesGross)} x ${financeSettings.ismSalesPct}% = ${formatCurrency(ismMonth.ismSales)}`, 20, statsY + 93);
      doc.text(`SOLDE TOTAL ISM: ${formatCurrency(ismMonth.total)}`, 20, statsY + 100);

      doc.setFontSize(14);
      doc.text('Top 5 Produits', 20, statsY + 114);

      doc.setFontSize(10);
      topProducts.forEach((product, i) => {
        const y = statsY + 122 + (i * 7);
        doc.text(`${i + 1}. ${product.name}`, 25, y);
        doc.text(`${product.sold} vendus`, 120, y);
        doc.text(formatCurrency(product.revenue), 160, y);
      });

      doc.setFontSize(14);
      doc.text('Dernières Commandes', 20, statsY + 164);

      doc.setFontSize(9);
      recentOrders.slice(0, 10).forEach((order, i) => {
        const y = statsY + 172 + (i * 6);
        const date = order.createdAt.toLocaleDateString('fr-FR');
        doc.text(`${order.number}`, 25, y);
        doc.text(`${order.status}`, 60, y);
        doc.text(formatCurrency(order.total), 100, y);
        doc.text(date, 140, y);
      });

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('O RESTO - Repas, Menus & Abonnements', 105, 285, { align: 'center' });

      doc.save(`rapport-${monthName.replace(' ', '-')}.pdf`);
    } catch {
      /* génération PDF indisponible */
    }
  };

  const handleDownloadExcel = () => {
    try {
      const now = new Date();
      const rows: string[][] = [];
      rows.push(['O RESTO — Rapport Direction']);
      rows.push([`Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`]);
      rows.push([]);
      rows.push(['CHIFFRE D\'AFFAIRES', 'Caisse', 'Abonnements', 'Total']);
      rows.push(['CA du jour', String(caDay.orders), String(caDay.subs), String(caDay.orders + caDay.subs)]);
      rows.push(['CA de la semaine', String(caWeek.orders), String(caWeek.subs), String(caWeek.orders + caWeek.subs)]);
      rows.push(['CA du mois', String(caMonth.orders), String(caMonth.subs), String(caMonth.orders + caMonth.subs)]);
      rows.push([]);
      rows.push(['SOLDE ISM DU MOIS (à verser)', 'Montant']);
      rows.push([`Abonnements : ${ismMonth.aboCount} x ${financeSettings.ismPerSubscription}`, String(ismMonth.ismAbo)]);
      rows.push([`  dont Préscolaire-Élémentaire`, String(ismMonth.split.primaire)]);
      rows.push([`  dont Lycée`, String(ismMonth.split.lycee)]);
      rows.push([`  dont Hebdo`, String(ismMonth.split.hebdo)]);
      rows.push([`Ventes : ${financeSettings.ismSalesPct}% de ${ismMonth.salesGross}`, String(ismMonth.ismSales)]);
      rows.push(['TOTAL ISM', String(ismMonth.total)]);
      rows.push([]);
      rows.push(['Abonnés actifs', String(restoStats.activeClients)]);
      rows.push(['Repas validés aujourd\'hui', String(todayAccepted.length)]);
      rows.push([]);
      rows.push(['TOP PRODUITS', 'Vendus', 'Revenus']);
      topProducts.forEach((p) => rows.push([p.name, String(p.sold), String(p.revenue)]));
      rows.push([]);
      rows.push(['PAIEMENTS ABONNEMENTS', 'Client', 'Montant', 'Moyen', 'Statut', 'Date']);
      payments.forEach((p) => rows.push([
        p.reference,
        subscriptions.find((s) => s.id === p.subscriptionId)?.clientUsername ?? '',
        String(p.amount), p.method, p.status,
        new Date(p.createdAt).toLocaleDateString('fr-FR'),
      ]));
      rows.push([]);
      rows.push(['COMMANDES CAISSE', 'Client', 'Total', 'Statut', 'Date']);
      orders.forEach((o) => rows.push([
        o.number, o.customerName ?? '', String(o.total), o.status,
        o.createdAt.toLocaleDateString('fr-FR'),
      ]));

      const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-dg-${now.toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (import.meta.env.DEV) console.error('[O RESTO] Export Excel:', error);
    }
  };

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: 'realtime', label: 'Temps réel' },
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' }
  ];

  return (
    <div className="min-h-screen animate-fade-in">
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-[1400px] mx-auto">
        {/* Barre supérieure */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-green-700 flex items-center justify-center">
                  <Radar aria-hidden className="w-5 h-5 text-white" />
                </span>
                Tableau de bord DG
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">
                  <span className="w-1.5 h-1.5 bg-green-700 rounded-full animate-pulse" /> En direct
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                {isAdmin ? 'Pilotage global O RESTO — Caisse + Abonnements + Solde ISM' : 'Pilotage de votre site — Repas, abonnés, alertes'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <>
                  <button onClick={handleDownloadReport} className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-700">
                    <FileDown className="w-4 h-4" /><span className="hidden sm:inline">Rapport PDF</span>
                  </button>
                  <button onClick={handleDownloadExcel} className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-700">
                    <FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto shadow-sm">
            <Calendar aria-hidden className="w-4 h-4 text-slate-500 ml-2" />
            <div className="flex flex-1 sm:flex-none gap-1" role="tablist" aria-label="Période">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPeriod(option.value)}
                  aria-pressed={period === option.value}
                  className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    period === option.value
                      ? 'bg-green-700 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className={`${DARK_CARD} p-4 sm:p-5 hover:border-emerald-500/40 transition-colors`}>
                <div className="flex items-start justify-between mb-3">
                  <span className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${stat.chip} flex items-center justify-center`}>
                    <Icon className="w-5 h-5" strokeWidth={2.5} />
                  </span>
                  <span className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full ${stat.positive ? 'text-emerald-400 bg-emerald-500/15' : 'text-red-400 bg-red-500/15'}`}>
                    {stat.change}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">{stat.value}</p>
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-1">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Solde ISM du mois — Direction */}
        {isAdmin && (
          <section className="rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-[#1a1408] via-[#151b2b] to-[#151b2b]">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 flex flex-wrap items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-slate-600 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-white" />
              </span>
              <div>
                <p className="font-black text-white flex items-center gap-2">
                  Solde ISM du mois — à verser <Crown className="w-4 h-4 text-amber-400" />
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400">2 000 F par abonnement (lycée comme préscolaire-élémentaire) + {financeSettings.ismSalesPct} % des ventes</p>
              </div>
              <p className="ml-auto text-2xl sm:text-4xl font-black text-amber-400 tracking-tight">{formatCurrency(ismMonth.total)}</p>
            </div>
            <div className="p-4 sm:p-6 grid sm:grid-cols-3 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Part abonnements</p>
                <p className="text-xl sm:text-2xl font-black text-white mt-1">{formatCurrency(ismMonth.ismAbo)}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {ismMonth.aboCount} abo(s) × {formatCurrency(financeSettings.ismPerSubscription)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Présco-Élém : {ismMonth.split.primaire}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">Lycée : {ismMonth.split.lycee}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-300">Hebdo : {ismMonth.split.hebdo}{ismMonth.split.autres > 0 ? ` (+${ismMonth.split.autres})` : ''}</span>
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Part ventes ({financeSettings.ismSalesPct} %)</p>
                <p className="text-xl sm:text-2xl font-black text-white mt-1">{formatCurrency(ismMonth.ismSales)}</p>
                <p className="text-xs text-slate-400 mt-1">Caisse du mois : {formatCurrency(ismMonth.salesGross)}</p>
                <button onClick={() => onNavigate('finance')} className="mt-2 text-xs font-bold text-amber-400 hover:underline flex items-center gap-1">
                  Détail comptable <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Solde ISM — 6 derniers mois</p>
                <div className="h-28 mt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ismHistory} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                        formatter={(value: unknown) => [formatCurrency(Number(value)), 'Solde ISM']}
                      />
                      <Bar dataKey="total" name="Solde ISM" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Alertes */}
        {(pendingCash.length > 0 || expiringSoon.length > 0 || lowMeals.length > 0) && (
          <div className="grid md:grid-cols-3 gap-3">
            {expiringSoon.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
                <p className="font-bold text-red-300 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {expiringSoon.length} abonnement(s) expirent ≤ 2 jours</p>
                <p className="text-xs text-red-200/70 mt-1">{expiringSoon.slice(0, 3).map((s) => s.clientUsername).join(', ')}{expiringSoon.length > 3 ? '…' : ''}</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Performance */}
          <div className={`lg:col-span-2 ${DARK_CARD} p-4 sm:p-6`}>
            <h2 className="text-base sm:text-lg font-bold text-white">
              Performance {period === 'realtime' ? 'en temps réel' : period === 'day' ? 'journalière' : period === 'week' ? 'hebdomadaire' : 'mensuelle'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {period === 'realtime' ? 'Dernières 12 heures — mise à jour instantanée' : 'Caisse + abonnements encaissés'}
            </p>
            {hasGlobalData ? (
            <div className="h-64 sm:h-80 w-full mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={globalData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" stroke="#64748b" style={{ fontSize: '12px', fontWeight: '600' }} tick={{ fill: '#94a3b8' }} />
                  <YAxis
                    stroke="#64748b" style={{ fontSize: '11px' }} tick={{ fill: '#94a3b8' }} width={60}
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px', color: '#fff' }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}
                    itemStyle={{ color: '#fff', padding: '4px 0' }}
                    cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '5 5' }}
                    formatter={(value: unknown, name: string) => [formatCurrency(Number(value)), name]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px' }} iconType="circle" formatter={(value) => <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '13px' }}>{value}</span>} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="caisse" name="Caisse" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#d97706', stroke: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="abonnements" name="Abonnements" stroke="#14b8a6" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#0d9488', stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            ) : (
              <div className="h-64 sm:h-80 w-full mt-3 flex flex-col items-center justify-center text-center border border-dashed border-white/15 rounded-2xl">
                <TrendingUp className="w-10 h-10 text-slate-600" />
                <p className="mt-2 font-bold text-slate-300 text-sm">Aucune vente ni abonnement sur la période</p>
                <p className="text-xs text-slate-500 mt-1">Les courbes Caisse + Abonnements apparaîtront ici dès le premier encaissement.</p>
              </div>
            )}
          </div>

          {/* Top produits */}
          <div className={`${DARK_CARD} p-4 sm:p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white">Top produits</h2>
              <span className="px-3 py-1 rounded-full bg-slate-500/15 text-slate-400 text-xs font-bold">Plus vendus</span>
            </div>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm flex-shrink-0 ${
                      i === 0 ? 'bg-gradient-to-br from-yellow-400 to-slate-500 text-white' :
                      i === 1 ? 'bg-white/15 text-slate-200' :
                      i === 2 ? 'bg-slate-500/20 text-slate-300' :
                      'bg-white/5 text-slate-400'
                    }`}>
                      {i + 1}
                    </div>
                    <img src={p.image} alt={p.name} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400"><span className="font-bold text-slate-400">{p.sold}</span> vendus</p>
                    </div>
                    <span className="text-sm font-bold text-slate-400 whitespace-nowrap">{formatCurrency(p.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">Aucune donnée disponible</div>
            )}
          </div>
        </div>

        {/* Commandes récentes */}
        <div className={`${DARK_CARD} p-4 sm:p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Commandes récentes</h2>
              <p className="text-xs text-slate-400 mt-0.5">Dernières activités</p>
            </div>
            <button onClick={() => onNavigate('history')} className="text-sm font-semibold text-slate-400 hover:text-slate-300 flex items-center gap-1">
              Voir tout <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="hidden md:block overflow-x-auto">
            {recentOrders.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 text-slate-400 font-semibold text-xs">N° Commande</th>
                    <th className="text-left py-3 text-slate-400 font-semibold text-xs">Client</th>
                    <th className="text-left py-3 text-slate-400 font-semibold text-xs">Articles</th>
                    <th className="text-right py-3 text-slate-400 font-semibold text-xs">Montant</th>
                    <th className="text-center py-3 text-slate-400 font-semibold text-xs">Statut</th>
                    <th className="text-right py-3 text-slate-400 font-semibold text-xs">Heure</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 font-semibold text-slate-100 text-sm">{order.number}</td>
                      <td className="py-3 text-slate-300 text-sm">{order.customerName || '-'}</td>
                      <td className="py-3 text-slate-400 text-sm">{order.items.length} article(s)</td>
                      <td className="py-3 text-right font-bold text-white text-sm">{formatCurrency(order.total)}</td>
                      <td className="py-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColors[order.status]}`}>
                          {statusLabels[order.status]}
                        </span>
                      </td>
                      <td className="py-3 text-right text-slate-400 text-sm">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{order.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">Aucune commande récente</div>
            )}
          </div>
          <div className="md:hidden space-y-2">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-bold text-slate-100">{order.number}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{order.customerName || 'Client'} · {order.items.length} article(s)</p>
                  </div>
                  <p className="text-sm font-bold text-white flex-shrink-0">{formatCurrency(order.total)}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">Aucune commande récente</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
