import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL et Anon Key sont requis. Vérifiez votre fichier .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Types pour la base de données
export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          number: string;
          items: any;
          extras: any;
          subtotal: number;
          tax: number;
          total: number;
          status: string;
          type: string;
          created_at: string;
          customer_name: string | null;
          payment_method: string | null;
          amount_received: number | null;
          change: number | null;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      products: {
        Row: {
          id: string;
          name: string;
          category: string;
          price: number;
          description: string | null;
          image: string | null;
          available: boolean;
          extras: any;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
      };
    };
  };
}
