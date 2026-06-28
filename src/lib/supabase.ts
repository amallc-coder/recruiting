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

/**
 * Fetch ALL rows from a table, paginating past PostgREST's default 1000-row
 * response cap so large tables (e.g. candidates) are never silently truncated.
 *
 * In demo mode the localStorage mock returns everything in one call (and has no
 * `.range()`), so we short-circuit. For live pagination a stable `id` sort is
 * appended after the caller's own ordering, so page boundaries can't skip or
 * duplicate rows when the primary sort has ties (bulk-imported rows that share
 * `created_at`). Mirrors the Supabase response shape: `{ data, error }`.
 *
 *   await selectAll('candidates', '*', (q) => q.order('created_at', { ascending: false }))
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function selectAll<T = any>(
  table: string,
  columns = '*',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build?: (q: any) => any,
): Promise<{ data: T[]; error: unknown }> {
  if (demoMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(columns)
    if (build) q = build(q)
    const { data, error } = await q
    return { data: (data as T[]) ?? [], error }
  }
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(columns)
    if (build) q = build(q)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) return { data: all, error }
    const batch = (data as T[]) ?? []
    all.push(...batch)
    if (batch.length < PAGE) break
  }
  return { data: all, error: null }
}
