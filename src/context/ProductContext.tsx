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
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger les produits depuis Supabase au démarrage
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      console.log('🔄 Chargement des produits depuis Supabase...');
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('❌ Erreur lors du chargement des produits:', error);
        // Si erreur, utiliser les produits mock et les insérer dans Supabase
        console.log('ℹ️  Initialisation avec les produits mock...');
        await initializeMockProducts();
        setProducts(mockProducts);
      } else if (data && data.length > 0) {
        console.log(`✅ ${data.length} produit(s) chargé(s) depuis Supabase`);
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
      } else {
        console.log('ℹ️  Aucun produit en base, initialisation avec les produits mock...');
        await initializeMockProducts();
        setProducts(mockProducts);
      }
    } catch (error) {
      console.error('❌ Erreur fatale lors du chargement des produits:', error);
      setProducts(mockProducts);
    } finally {
      setLoading(false);
    }
  };

  const initializeMockProducts = async () => {
    try {
      // Insérer les produits mock dans Supabase
      const productsToInsert = mockProducts.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        description: p.description || null,
        image: p.image || null,
        available: p.available ?? true,
        extras: p.extras || [],
      }));

      const { error } = await supabase.from('products').upsert(productsToInsert, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      });

      if (error) {
        console.error('❌ Erreur lors de l\'insertion des produits mock:', error);
      } else {
        console.log('✅ Produits mock insérés dans Supabase');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation des produits mock:', error);
    }
  };

  const addProduct = async (product: Product) => {
    try {
      console.log('🔵 Ajout produit - Début:', product.id);
      // Mise à jour optimiste
      setProducts((prev) => [...prev, product]);

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
        console.error('❌ ERREUR Supabase lors de l\'ajout du produit:', error);
        console.error('❌ Message:', error.message);
        // Rollback en cas d'erreur
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
      } else {
        console.log('✅ Produit ajouté avec succès dans Supabase');
      }
    } catch (error) {
      console.error('❌ Erreur fatale lors de l\'ajout du produit:', error);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      console.log('🔵 Mise à jour produit - Début:', id, updates);
      // Mise à jour optimiste
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

      // Préparer les données pour Supabase
      const supabaseUpdates: any = {};
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

      if (error) {
        console.error('❌ ERREUR Supabase lors de la mise à jour du produit:', error);
        console.error('❌ Message:', error.message);
        // Rollback: recharger les produits
        await loadProducts();
      } else {
        console.log('✅ Produit mis à jour avec succès dans Supabase');
      }
    } catch (error) {
      console.error('❌ Erreur fatale lors de la mise à jour du produit:', error);
      await loadProducts();
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      console.log('🔵 Suppression produit - Début:', id);
      // Sauvegarde pour rollback
      const productToDelete = products.find((p) => p.id === id);
      // Suppression optimiste
      setProducts((prev) => prev.filter((p) => p.id !== id));

      // Suppression dans Supabase
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error) {
        console.error('❌ ERREUR Supabase lors de la suppression du produit:', error);
        console.error('❌ Message:', error.message);
        // Rollback en cas d'erreur
        if (productToDelete) {
          setProducts((prev) => [...prev, productToDelete]);
        }
      } else {
        console.log('✅ Produit supprimé avec succès de Supabase');
      }
    } catch (error) {
      console.error('❌ Erreur fatale lors de la suppression du produit:', error);
      await loadProducts();
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
