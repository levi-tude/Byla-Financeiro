import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config, hasSupabase } from '../config.js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }
  return client;
}
