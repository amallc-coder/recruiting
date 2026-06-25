import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { demoClient, isDemo } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const demoMode = isDemo()
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured && !demoMode) {
  // Don't crash the whole app — the UI shows a friendly "not configured" screen.
  // These values are safe to expose; data is protected by Row Level Security.
  console.warn('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

// Use `||` (not `??`) so an EMPTY-STRING env var — which is what an unset
// GitHub Actions repo variable injects at build time — falls back to the
// placeholder instead of making createClient throw "supabaseUrl is required"
// and crashing the whole app before it can render.
const realClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
)

// In demo mode, swap in the browser-only mock so the whole app works offline.
export const supabase: SupabaseClient = demoMode
  ? (demoClient as unknown as SupabaseClient)
  : realClient
