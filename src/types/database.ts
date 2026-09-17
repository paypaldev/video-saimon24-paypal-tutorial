// Hand-written to match supabase/migrations. Once you have the Supabase CLI
// linked, regenerate with: supabase gen types typescript --local > src/types/database.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          plan: string;
          plan_renews_at: string | null;
          generations_used: number;
          style_json: Json;
          paypal_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          plan?: string;
          plan_renews_at?: string | null;
          generations_used?: number;
          style_json?: Json;
          paypal_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          plan?: string;
          plan_renews_at?: string | null;
          generations_used?: number;
          style_json?: Json;
          paypal_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          payload: Json;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          provider?: string;
          event_id: string;
          event_type: string;
          payload: Json;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          provider?: string;
          event_id?: string;
          event_type?: string;
          payload?: Json;
          received_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          prompt: string;
          style_json: Json;
          model: string;
          storage_path: string;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          prompt: string;
          style_json: Json;
          model: string;
          storage_path: string;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          prompt?: string;
          style_json?: Json;
          model?: string;
          storage_path?: string;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_generation_credit: {
        Args: { p_limit: number };
        Returns: number;
      };
      refund_generation_credit: {
        Args: { p_user_id: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Asset = Database["public"]["Tables"]["assets"]["Row"];
