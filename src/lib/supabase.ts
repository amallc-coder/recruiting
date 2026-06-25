import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { demoClient, isDemo } from './demo'

// Live project defaults. These two values are SAFE to expose in a frontend app
// (the anon key is designed to be public; all data is protected by Row Level
// Security). They're baked in as defaults so the deployed site connects even if
// the GitHub Actions build env vars are unset/empty — an unset repo variable
// injects an EMPTY STRING, which is why we use `||` (not `??`) here. Env vars
// still override these for local dev or pointing at a different project.
const DEFAULT_SUPABASE_URL = 'https://pcpkhdfgmjrzvwfkcznn.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjcGtoZGZnbWpyenZ3Zmtjem5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzA4OTMsImV4cCI6MjA5NzkwNjg5M30.rCadRglp5TXt5iRz4Ip3skkHUbU6cVM6_bJF9ICnzRg'

const url = (import.meta.env.VITE_SUPABASE_URL as string) || DEFAULT_SUPABASE_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_SUPABASE_ANON_KEY

export const demoMode = isDemo()
export const isSupabaseConfigured = Boolean(url && anonKey)

const realClient = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// In demo mode, swap in the browser-only mock so the whole app works offline.
export const supabase: SupabaseClient = demoMode
  ? (demoClient as unknown as SupabaseClient)
  : realClient
