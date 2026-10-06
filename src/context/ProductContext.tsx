import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { Product } from '@/types/menu';
import { supabase } from '@/lib/supabase';
import { mockProducts } from '@/data/mockData';
import { KioskOrder, KioskOrderItem, KioskOrderStatus } from '@/types/menu';

interface ProductContextType {
  products: Product[];
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  loading: boolean;
  offline: boolean;
  reload: () => void;
  kioskOrders: KioskOrder[];
  setKioskOrders: (orders: KioskOrder[]) => void;
  cart: KioskOrderItem[];
  setCart: (items: KioskOrderItem[]) => void;
  addToCart: (product: Product, qty?: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  checkout: (childId: string, parentUsername: string) => Promise<KioskOrder | null>;
}

const LS_PRODUCTS_KEY = 'o-resto-products-v1';
const LS_KIOSK_ORDERS_KEY = 'o-resto-kiosk-orders-v1';
const LS_CART_KEY = 'o-resto-kiosk-cart-v1';

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Mode hors-ligne : Supabase injoignable → catalogue local Miam's, modifs locales conservées
  const [offline, setOffline] = useState(false);
  const [kioskOrders, setKioskOrders] = useState<KioskOrder[]>([]);
  const [cart, setCart] = useState<KioskOrderItem[]>([]);

  const addProduct = async (product: Product) => {
    // Mise à jour optimiste
    setProducts((prev) => {
      const next = [...prev, product];
      writeLocalProducts(next);
      return next;
    });

    // Insertion dans Supabase
    const { error } = await supabase.from('products').insert({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      description: product.description || null,
      image: product.image || null,
      available: product.available ?? true,
      extras: product.extras || [],
    });

    if (error) {
      // Rollback en cas d'erreur
      setProducts((prev) => {
        const next = prev.filter((p) => p.id !== product.id);
        writeLocalProducts(next);
        return next;
      });
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    // Mise à jour optimiste
    setProducts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      writeLocalProducts(next);
      return next;
    });

    // Préparer les données pour Supabase
    const supabaseUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) supabaseUpdates.name = updates.name;
    if (updates.category !== undefined) supabaseUpdates.category = updates.category;
    if (updates.price !== undefined) supabaseUpdates.price = updates.price;
    if (updates.description !== undefined) supabaseUpdates.description = updates.description || null;
    if (updates.image !== undefined) supabaseUpdates.image = updates.image || null;
    if (updates.available !== undefined) supabaseUpdates.available = updates.available;
    if (updates.extras !== undefined) supabaseUpdates.extras = updates.extras || [];

    // Mise à jour dans Supabase
    const { error } = await supabase
      .from('products')
      .update(supabaseUpdates)
      .eq('id', id);

    if (error && !offline) {
      // Rollback: recharger les produits
      await loadProducts();
    }
  };

  // Charger les produits depuis Supabase au démarrage
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        // Repli hors-ligne : catalogue local persisté puis mock
        setOffline(true);
        setProducts(readLocalProducts() ?? mockProducts);
      } else if (data && data.length > 0) {
        setOffline(false);
        // Convertir les données Supabase en Products
        const productsFromDB = data.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          price: row.price,
          description: row.description || undefined,
          image: row.image || undefined,
          available: row.available,
          options: undefined, // Options non stockées dans Supabase pour l'instant
          extras: row.extras || undefined,
        }));
        setProducts(productsFromDB);
        writeLocalProducts(productsFromDB);
      } else {
        // Table vide : initialiser Supabase avec le catalogue local (best-effort)
        try {
          await supabase.from('products').insert(
            mockProducts.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              price: p.price,
              description: p.description || null,
              image: p.image || null,
              available: p.available ?? true,
              extras: p.extras || [],
            })),
          );
        } catch {
          /* pas bloquant : on affiche quand même le catalogue local */
        }
        setProducts(mockProducts);
        writeLocalProducts(mockProducts);
      }
    } catch {
      setOffline(true);
      setProducts(readLocalProducts() ?? mockProducts);
    } finally {
      setLoading(false);
    }
  };

  // Charger les commandes kiosque depuis Supabase / localStorage à la montée en charge
  useEffect(() => {
    loadKioskOrders();
  }, []);

  const loadKioskOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('kiosk_orders')
        .select('*')
        .order('createdAt', { ascending: false });

      if (error && !offline) {
        // Fallback localStorage
        try {
          const raw = localStorage.getItem(LS_KIOSK_ORDERS_KEY);
          if (raw) setKioskOrders(JSON.parse(raw));
        } catch { }
      } else if (data) {
        setKioskOrders(data as KioskOrder[]);
        try {
          localStorage.setItem(LS_KIOSK_ORDERS_KEY, JSON.stringify(data));
        } catch { }
      }
    } catch {
      // Fallback localStorage
      try {
        const raw = localStorage.getItem(LS_KIOSK_ORDERS_KEY);
        if (raw) setKioskOrders(JSON.parse(raw));
      } catch { }
    }
  };

  const deleteProduct = async (id: string) => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeLocalProducts(next);
      return next;
    });

    const { error } = await supabase.from('products').delete().eq('id', id);

    if (error && !offline) {
      await loadProducts();
    }
  };

  const addToCart = (product: Product, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, qty: item.qty + qty } : item
        );
      }
      const newItem: KioskOrderItem = {
        productId: product.id,
        name: product.name,
        price: product.price,
        qty,
      };
      return [...prev, newItem];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Persistances locales
  useEffect(() => {
    try {
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
    } catch { }
    try {
      localStorage.setItem(LS_KIOSK_ORDERS_KEY, JSON.stringify(kioskOrders));
    } catch { }
    try {
      localStorage.setItem(LS_CART_KEY, JSON.stringify(cart));
    } catch { }
  }, [products, kioskOrders, cart]);

  function writeLocalProducts(products: Product[]): void {
    try {
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
    } catch { }
  }

  function readLocalProducts(): Product[] | null {
    try {
      const raw = localStorage.getItem(LS_PRODUCTS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Product[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const checkout = async (childId: string, parentUsername: string): Promise<KioskOrder | null> => {
    const total = cart.reduce((sum, it) => sum + it.price * it.qty, 0);
    const order: KioskOrder = {
      id: `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      childId,
      parentUsername,
      items: [...cart],
      total,
      status: 'pending' as KioskOrderStatus,
      reference: `KIOSK-${Math.random().toString(36).toUpperCase().slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      servedAt: null,
    };
    setKioskOrders((prev) => {
      const next = [...prev, order];
      try {
        localStorage.setItem(LS_KIOSK_ORDERS_KEY, JSON.stringify(next));
      } catch { }
      return next;
    });
    setCart([]);
    try {
      localStorage.setItem(LS_CART_KEY, JSON.stringify([]));
    } catch { }
    // Persist dans Supabase (best-effort)
    try {
      await supabase.from('kiosk_orders').insert({
        id: order.id,
        child_id: childId,
        parent_username: parentUsername,
        items: order.items,
        total: order.total,
        status: 'pending',
        reference: order.reference,
        created_at: order.createdAt,
        served_at: null,
      });
    } catch { }
    return order;
  };

  return (
    <ProductContext.Provider
      value={{
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        loading,
        offline,
        reload: loadProducts,
        kioskOrders,
        setKioskOrders,
        cart,
        setCart,
        addToCart,
        removeFromCart,
        clearCart,
        checkout,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error('useProducts must be used within ProductProvider');
  return ctx;
}
