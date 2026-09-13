import { createClient } from "@supabase/supabase-js";

export function readSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = [];
  if (!url || !String(url).trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key || !String(key).trim())
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, key, missing };
}

export function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
