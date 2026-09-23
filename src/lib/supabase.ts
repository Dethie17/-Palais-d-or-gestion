import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('votre-projet') &&
  supabaseUrl.startsWith('http');

// En local / démo sans clés : on crée un client "placeholder" pour que
// l'app démarre quand même. Tous les appels échoueront proprement et les
// Contexts basculeront sur le repli local (localStorage + comptes démo).
// En production : renseignez VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
if (!isSupabaseConfigured) {
  console.warn(
    '[O RESTO] Supabase non configuré — mode démo local actif. ' +
      'Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY pour la persistance distante.'
  );
}

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? (supabaseUrl as string) : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? (supabaseAnonKey as string) : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Types pour la base de données
export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          number: string;
          items: Record<string, unknown>[];
          extras: Record<string, unknown>[] | null;
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
          extras: Record<string, unknown>[] | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
      };
      establishments: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          manager: string | null;
          phone: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['establishments']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['establishments']['Insert']>;
      };
      formulas: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          duration_days: number;
          meals_included: number;
          rules: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['formulas']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['formulas']['Insert']>;
      };
      subscriptions: {
        Row: {
          id: string;
          client_username: string;
          formula_id: string;
          start_date: string;
          end_date: string;
          status: string;
          meals_remaining: number;
          qr_token: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
      };
      validations: {
        Row: {
          id: string;
          qr_token: string;
          client_username: string;
          establishment_id: string;
          validated_at: string;
          status: string;
          reason: string | null;
        };
        Insert: Omit<Database['public']['Tables']['validations']['Row'], 'validated_at'>;
        Update: Partial<Database['public']['Tables']['validations']['Insert']>;
      };
      oresto_payments: {
        Row: {
          id: string;
          subscription_id: string | null;
          amount: number;
          method: string;
          status: string;
          reference: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['oresto_payments']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['oresto_payments']['Insert']>;
      };
    };
  };
}
