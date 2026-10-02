import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { Product } from '@/types/menu';
import { supabase } from '@/lib/supabase';
import { mockProducts } from '@/data/mockData';

interface ProductContextType {
  products: Product[];
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  loading: boolean;
  offline: boolean;
  reload: () => void;
}

const LS_PRODUCTS_KEY = 'o-resto-products-v1';

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Mode hors-ligne : Supabase injoignable → catalogue local Miam's, modifs locales conservées
  const [offline, setOffline] = useState(false);

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

  function writeLocalProducts(list: Product[]) {
    try {
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(list));
    } catch {
      /* stockage indisponible */
    }
  }

  const addProduct = async (product: Product) => {
    try {
      // Mise à jour optimiste + persistance locale
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

      if (error && !offline) {
        // Rollback en cas d'erreur en ligne
        setProducts((prev) => {
          const next = prev.filter((p) => p.id !== product.id);
          writeLocalProducts(next);
          return next;
        });
      }
    } catch {
      if (!offline) {
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
      }
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      // Mise à jour optimiste + persistance locale
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
    } catch {
      if (!offline) {
        await loadProducts();
      }
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      // Sauvegarde pour rollback
      const productToDelete = products.find((p) => p.id === id);
      // Suppression optimiste + persistance locale
      setProducts((prev) => {
        const next = prev.filter((p) => p.id !== id);
        writeLocalProducts(next);
        return next;
      });

      // Suppression dans Supabase
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error && !offline && productToDelete) {
        // Rollback en cas d'erreur en ligne
        setProducts((prev) => [...prev, productToDelete]);
      }
    } catch {
      if (!offline) {
        await loadProducts();
      }
    }
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
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error('useProducts doit être utilisé dans un ProductProvider');
  }
  return context;
}
