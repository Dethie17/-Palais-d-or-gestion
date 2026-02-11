import React, { createContext, useContext, ReactNode } from 'react';
import { Order } from '@/types/menu';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface AppContextType {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  deleteOrder: (id: string) => void;
  clearAllOrders: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useLocalStorage<Order[]>('fooddash-orders', []);

  const addOrder = (order: Order) => {
    setOrders((prev) => [order, ...prev]);
  };

  const updateOrder = (id: string, updates: Partial<Order>) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? { ...order, ...updates } : order))
    );
  };

  const deleteOrder = (id: string) => {
    setOrders((prev) => prev.filter((order) => order.id !== id));
  };

  const clearAllOrders = () => {
    setOrders([]);
  };

  return (
    <AppContext.Provider
      value={{
        orders,
        addOrder,
        updateOrder,
        deleteOrder,
        clearAllOrders,
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
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let startDate: Date;
  if (period === 'day') startDate = startOfDay;
  else if (period === 'week') startDate = startOfWeek;
  else startDate = startOfMonth;

  const filteredOrders = orders.filter(
    (order) => order.createdAt >= startDate && order.status === 'completed'
  );

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
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + index);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const dayOrders = orders.filter(
      (order) =>
        order.status === 'completed' &&
        order.createdAt >= date &&
        order.createdAt < nextDate
    );

    const amount = dayOrders.reduce((sum, order) => sum + order.total, 0);

    return { day, amount };
  });

  return salesByDay;
}

export function getChartData(orders: Order[], period: 'day' | 'week' | 'month') {
  const completedOrders = orders.filter((order) => order.status === 'completed');
  
  if (period === 'day') {
    // Afficher les 7 derniers jours
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const now = new Date();
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);
      
      const dayOrders = completedOrders.filter(
        (order) => order.createdAt >= date && order.createdAt < nextDate
      );
      
      const revenue = dayOrders.reduce((sum, order) => sum + order.total, 0);
      const orderCount = dayOrders.length;
      const customers = dayOrders.length; // Chaque commande = 1 client
      
      data.push({
        label: days[date.getDay()],
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
