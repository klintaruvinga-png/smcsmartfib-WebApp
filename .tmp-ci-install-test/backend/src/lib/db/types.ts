/**
 * Hand-authored Supabase `Database` type for the SMC SuperFIB backend.
 *
 * This is a faithful stand-in for the type normally produced by
 * `supabase gen types typescript --local` (wired up as the `db:types` script in
 * package.json). That command requires a running local Supabase instance, which
 * in turn needs Docker — Docker is NOT available in this environment, so the
 * generator would fail. We therefore hand-author the interface and keep it in
 * sync with `migrations/001_init.sql` (which has been extended with a
 * `password_hash` column on `users` and a `trend` column on `fib_levels` to
 * support the new query functions).
 *
 * If/when a local Supabase instance becomes available, regenerate this file with
 * `npm run db:types` and confirm the generated output still matches the schema
 * below.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          role: string;
          ea_api_key: string | null;
          password_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: string;
          ea_api_key?: string | null;
          password_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: string;
          ea_api_key?: string | null;
          password_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      fib_levels: {
        Row: {
          id: number;
          user_id: string;
          ea_api_key: string;
          symbol: string;
          timeframe: string;
          family: string;
          ratio: string;
          price: string;
          source: string;
          trend: string | null;
          calculated_at: string;
          received_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          ea_api_key: string;
          symbol: string;
          timeframe: string;
          family: string;
          ratio: string;
          price: string;
          source?: string;
          trend?: string | null;
          calculated_at?: string;
          received_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          ea_api_key?: string;
          symbol?: string;
          timeframe?: string;
          family?: string;
          ratio?: string;
          price?: string;
          source?: string;
          trend?: string | null;
          calculated_at?: string;
          received_at?: string;
        };
      };
      ea_sessions: {
        Row: {
          id: string;
          ea_api_key: string;
          user_id: string;
          ip_address: string | null;
          user_agent: string | null;
          connected_at: string;
          last_ping: string;
          status: string;
        };
        Insert: {
          id?: string;
          ea_api_key: string;
          user_id: string;
          ip_address?: string | null;
          user_agent?: string | null;
          connected_at?: string;
          last_ping?: string;
          status?: string;
        };
        Update: {
          id?: string;
          ea_api_key?: string;
          user_id?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          connected_at?: string;
          last_ping?: string;
          status?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
