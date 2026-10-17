import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
// Gives the phone a localStorage backed by SQLite, where the sign-in session is kept. The web already has one.
import 'expo-sqlite/localStorage/install';

// The project URL and publishable (anon) key are meant to ship inside the app: row-level security in
// supabase/migrations decides what each signed-in person can touch. A .env file overrides app.json.
const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string };
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || extra.supabaseKey || '';

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;
