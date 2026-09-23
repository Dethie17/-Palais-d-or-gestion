import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { Order } from '@/types/menu';
import { supabase } from '@/lib/supabase';

interface AppContextType {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  deleteOrder: (id: string) => void;
  clearAllOrders: () => void;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger les commandes depuis Supabase au démarrage
  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      console.log('🔄 Chargement des commandes depuis Supabase...');
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erreur lors du chargement des commandes:', error);
        console.error('❌ Message:', error.message);
        // Si erreur de connexion, commencer avec une liste vide
        setOrders([]);
      } else if (data && data.length > 0) {
        console.log(`✅ ${data.length} commande(s) chargée(s) depuis Supabase`);
        console.log('📦 Données:', data);
        // Convertir les données Supabase en Orders
        const ordersFromDB = data.map((row) => {
          // 🔧 FIX TIMEZONE: Parser la date UTC et garder le VRAI jour
          // Au lieu de convertir en heure locale, on garde la date UTC telle quelle
          const utcDateString = row.created_at;
          const utcDate = new Date(utcDateString);
          
          // Extraire le VRAI jour depuis la chaîne UTC (avant conversion)
          // Format: "2026-02-11T23:12:37.598+00:00" → on veut le 11, pas le 12
          const utcDateOnly = utcDateString.split('T')[0]; // "2026-02-11"
          const [year, month, day] = utcDateOnly.split('-').map(Number);
          
          // Créer une date en heure locale MAIS avec le jour UTC correct
          const correctedDate = new Date(year, month - 1, day, 
            utcDate.getHours(), utcDate.getMinutes(), utcDate.getSeconds(), utcDate.getMilliseconds());
          
          console.log(`🔧 ${row.number}: UTC "${utcDateString}" → Jour UTC=${utcDateOnly} → Date corrigée="${correctedDate.toLocaleString('fr-FR')}"`);
          
          return {
            id: row.id,
            number: row.number,
            items: row.items,
            extras: row.extras || undefined,
            subtotal: row.subtotal,
            tax: row.tax,
            total: row.total,
            status: row.status as Order['status'],
            type: row.type as Order['type'],
            createdAt: correctedDate,
            customerName: row.customer_name || undefined,
            paymentMethod: row.payment_method || undefined,
            amountReceived: row.amount_received || undefined,
            change: row.change || undefined,
          };
        });
        setOrders(ordersFromDB);
      } else {
        console.log('ℹ️ Aucune commande dans Supabase - Liste vide');
        // Base vide, commencer sans commandes
        setOrders([]);
      }
    } catch (error) {
      console.error('❌ ERREUR critique chargement:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const addOrder = async (order: Order) => {
    try {
      console.log('🔵 Ajout commande - Début:', order.number);
      console.log('🔵 Date locale:', order.createdAt.toLocaleString('fr-FR'));
      
      // Mettre à jour l'état local immédiatement pour une meilleure réactivité
      setOrders((prev) => [order, ...prev]);

      // 🔧 FIX: Forcer la date en UTC pour éviter les décalages timezone
      const utcDate = order.createdAt.toISOString();
      console.log('🔧 Date UTC pour Supabase:', utcDate);

      const orderToInsert = {
        id: order.id,
        number: order.number,
        items: order.items,
        extras: order.extras,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        status: order.status,
        type: order.type,
        created_at: utcDate,
        customer_name: order.customerName,
        payment_method: order.paymentMethod,
        amount_received: order.amountReceived,
        change: order.change,
      };

      console.log('🔵 Données à insérer:', orderToInsert);

      const { data, error } = await supabase.from('orders').insert([orderToInsert]).select();
      
      if (error) {
        console.error('❌ ERREUR Supabase lors de l\'ajout:', error);
        console.error('❌ Message:', error.message);
        console.error('❌ Détails:', error.details);
        // En cas d'erreur, on garde quand même l'ajout local
      } else {
        console.log('✅ Commande sauvegardée dans Supabase:', data);
      }
    } catch (error) {
      console.error('❌ ERREUR critique ajout commande:', error);
      // En cas d'erreur, on garde quand même l'ajout local
    }
  };

  const updateOrder = async (id: string, updates: Partial<Order>) => {
    try {
      // Mettre à jour l'état local immédiatement pour une meilleure réactivité
      setOrders((prev) =>
        prev.map((order) => (order.id === id ? { ...order, ...updates } : order))
      );

      const updateData: Record<string, unknown> = {};
      
      if (updates.status) updateData.status = updates.status;
      if (updates.paymentMethod) updateData.payment_method = updates.paymentMethod;
      if (updates.customerName) updateData.customer_name = updates.customerName;
      if (updates.items) updateData.items = updates.items;
      if (updates.extras !== undefined) updateData.extras = updates.extras;
      if (updates.subtotal !== undefined) updateData.subtotal = updates.subtotal;
      if (updates.tax !== undefined) updateData.tax = updates.tax;
      if (updates.total !== undefined) updateData.total = updates.total;
      if (updates.amountReceived !== undefined) updateData.amount_received = updates.amountReceived;
      if (updates.change !== undefined) updateData.change = updates.change;

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Erreur mise à jour Supabase:', error);
        // En cas d'erreur, on garde quand même la mise à jour locale
      }
    } catch (error) {
      console.error('Erreur mise à jour:', error);
      // En cas d'erreur, on garde quand même la mise à jour locale
    }
  };

  const deleteOrder = async (id: string) => {
    try {
      // Mettre à jour l'état local immédiatement pour une meilleure réactivité
      setOrders((prev) => prev.filter((order) => order.id !== id));

      const { error } = await supabase.from('orders').delete().eq('id', id);

      if (error) {
        console.error('Erreur suppression Supabase:', error);
        // En cas d'erreur, on garde quand même la suppression locale
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      // En cas d'erreur, on garde quand même la suppression locale
    }
  };

  const clearAllOrders = async () => {
    try {
      const { error } = await supabase.from('orders').delete().neq('id', '');

      if (error) {
        console.error('Erreur suppression totale:', error);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        orders,
        addOrder,
        updateOrder,
        deleteOrder,
        clearAllOrders,
        loading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Helper functions for statistics
export function getOrderStats(orders: Order[], period: 'day' | 'week' | 'month') {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);

  let startDate: Date;
  if (period === 'day') startDate = startOfDay;
  else if (period === 'week') startDate = startOfWeek;
  else startDate = startOfMonth;

  // 🔧 DEBUG
  console.log('📅 DEBUG Filtre:', {
    maintenant: now.toLocaleString('fr-FR'),
    debutPeriode: startDate.toLocaleString('fr-FR'),
    periode: period,
    totalCommandes: orders.length
  });

  // 🔧 FIX COMPLET: Comparer uniquement les JOURS, pas les heures
  const filteredOrders = orders.filter((order) => {
    const orderYear = order.createdAt.getFullYear();
    const orderMonth = order.createdAt.getMonth();
    const orderDate = order.createdAt.getDate();
    
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const startDateNum = startDate.getDate();
    
    // Créer des timestamps à minuit pile pour comparaison exacte
    const orderDayTimestamp = new Date(orderYear, orderMonth, orderDate, 0, 0, 0, 0).getTime();
    const startDayTimestamp = new Date(startYear, startMonth, startDateNum, 0, 0, 0, 0).getTime();
    
    const isInPeriod = orderDayTimestamp >= startDayTimestamp && order.status === 'completed';
    
    // 🔧 DEBUG: Afficher chaque commande avec jour exact
    if (order.status === 'completed') {
      const orderDayStr = `${orderDate}/${orderMonth + 1}/${orderYear}`;
      const startDayStr = `${startDateNum}/${startMonth + 1}/${startYear}`;
      console.log(`  📦 ${order.number}: Jour=${orderDayStr} (${order.createdAt.toLocaleString('fr-FR')}) | Filtre≥${startDayStr} → ${isInPeriod ? '✅ Incluse' : '❌ Exclue'}`);
    }
    
    return isInPeriod;
  });

  const revenue = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  const orderCount = filteredOrders.length;
  const customerCount = new Set(filteredOrders.map((o) => o.customerName || o.id)).size;

  // Calculate previous period for change percentage
  const periodLength = now.getTime() - startDate.getTime();
  const previousStartDate = new Date(startDate.getTime() - periodLength);
  const previousOrders = orders.filter(
    (order) =>
      order.createdAt >= previousStartDate &&
      order.createdAt < startDate &&
      order.status === 'completed'
  );

  const previousRevenue = previousOrders.reduce((sum, order) => sum + order.total, 0);
  const previousOrderCount = previousOrders.length;
  const previousCustomerCount = new Set(previousOrders.map((o) => o.customerName || o.id)).size;

  const revenueChange =
    previousRevenue > 0
      ? ((revenue - previousRevenue) / previousRevenue) * 100
      : revenue === 0 && previousRevenue === 0
      ? 0
      : revenue > 0
      ? 100
      : 0;
  const orderChange =
    previousOrderCount > 0
      ? ((orderCount - previousOrderCount) / previousOrderCount) * 100
      : orderCount === 0 && previousOrderCount === 0
      ? 0
      : orderCount > 0
      ? 100
      : 0;
  const customerChange =
    previousCustomerCount > 0
      ? ((customerCount - previousCustomerCount) / previousCustomerCount) * 100
      : customerCount === 0 && previousCustomerCount === 0
      ? 0
      : customerCount > 0
      ? 100
      : 0;

  return {
    revenue,
    revenueChange: `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}%`,
    orders: orderCount,
    ordersChange: `${orderChange >= 0 ? '+' : ''}${orderChange.toFixed(1)}%`,
    customers: customerCount,
    customersChange: `${customerChange >= 0 ? '+' : ''}${customerChange.toFixed(1)}%`,
  };
}

export function getTopProducts(orders: Order[]) {
  const productStats = new Map<
    string,
    { id: string; name: string; image: string; sold: number; revenue: number }
  >();

  orders
    .filter((o) => o.status === 'completed')
    .forEach((order) => {
      order.items.forEach((item) => {
        const existing = productStats.get(item.id);
        if (existing) {
          existing.sold += item.quantity;
          existing.revenue += item.price * item.quantity;
        } else {
          productStats.set(item.id, {
            id: item.id,
            name: item.name,
            image: item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
            sold: item.quantity,
            revenue: item.price * item.quantity,
          });
        }
      });
    });

  return Array.from(productStats.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export function getWeeklySales(orders: Order[]) {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const salesByDay = days.map((day, index) => {
    const targetDate = new Date(startOfWeek);
    targetDate.setDate(startOfWeek.getDate() + index);
    
    // 🔧 FIX: Comparer par jour uniquement
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();

    const dayOrders = orders.filter((order) => {
      if (order.status !== 'completed') return false;
      
      const orderYear = order.createdAt.getFullYear();
      const orderMonth = order.createdAt.getMonth();
      const orderDay = order.createdAt.getDate();
      
      return orderYear === targetYear && orderMonth === targetMonth && orderDay === targetDay;
    });

    const amount = dayOrders.reduce((sum, order) => sum + order.total, 0);

    return { day, amount };
  });

  return salesByDay;
}

export function getChartData(orders: Order[], period: 'realtime' | 'day' | 'week' | 'month') {
  const completedOrders = orders.filter((order) => order.status === 'completed');
  
  if (period === 'realtime') {
    // Afficher les 12 dernières heures en temps réel
    const now = new Date();
    const data = [];
    
    for (let i = 11; i >= 0; i--) {
      const endDate = new Date(now);
      endDate.setHours(now.getHours() - i);
      endDate.setMinutes(59, 59, 999);
      
      const startDate = new Date(endDate);
      startDate.setMinutes(0, 0, 0);
      
      const hourOrders = completedOrders.filter(
        (order) => order.createdAt >= startDate && order.createdAt <= endDate
      );
      
      const revenue = hourOrders.reduce((sum, order) => sum + order.total, 0);
      const orderCount = hourOrders.length;
      const customers = hourOrders.length;
      
      const hour = startDate.getHours();
      data.push({
        label: `${hour}h`,
        revenue,
        orders: orderCount,
        customers
      });
    }
    
    return data;
  } else if (period === 'day') {
    // Afficher les 7 derniers jours
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const now = new Date();
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - i);
      
      // 🔧 FIX: Comparer par jour uniquement
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth();
      const targetDay = targetDate.getDate();
      
      const dayOrders = completedOrders.filter((order) => {
        const orderYear = order.createdAt.getFullYear();
        const orderMonth = order.createdAt.getMonth();
        const orderDay = order.createdAt.getDate();
        
        return orderYear === targetYear && orderMonth === targetMonth && orderDay === targetDay;
      });
      
      const revenue = dayOrders.reduce((sum, order) => sum + order.total, 0);
      const orderCount = dayOrders.length;
      const customers = dayOrders.length; // Chaque commande = 1 client
      
      data.push({
        label: days[targetDate.getDay()],
        revenue,
        orders: orderCount,
        customers
      });
    }
    
    return data;
  } else if (period === 'week') {
    // Afficher les 4 dernières semaines
    const now = new Date();
    const data = [];
    
    for (let i = 3; i >= 0; i--) {
      const endDate = new Date(now);
      endDate.setDate(now.getDate() - (i * 7));
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      
      const weekOrders = completedOrders.filter(
        (order) => order.createdAt >= startDate && order.createdAt <= endDate
      );
      
      const revenue = weekOrders.reduce((sum, order) => sum + order.total, 0);
      const orderCount = weekOrders.length;
      const customers = weekOrders.length;
      
      const weekNumber = 4 - i;
      data.push({
        label: `S${weekNumber}`,
        revenue,
        orders: orderCount,
        customers
      });
    }
    
    return data;
  } else {
    // Mois : Afficher les 5 dernières semaines
    const now = new Date();
    const data = [];
    
    for (let i = 4; i >= 0; i--) {
      const endDate = new Date(now);
      endDate.setDate(now.getDate() - (i * 7));
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      
      const weekOrders = completedOrders.filter(
        (order) => order.createdAt >= startDate && order.createdAt <= endDate
      );
      
      const revenue = weekOrders.reduce((sum, order) => sum + order.total, 0);
      const orderCount = weekOrders.length;
      const customers = weekOrders.length;
      
      const weekNumber = 5 - i;
      data.push({
        label: `S${weekNumber}`,
        revenue,
        orders: orderCount,
        customers
      });
    }
    
    return data;
  }
}
