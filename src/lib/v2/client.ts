import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../supabase'

// The requisitions / pipeline workspace runs against the v2 schema. Until prod is
// migrated to v2 (the cutover), point it at a Supabase branch/preview via env:
//   VITE_V2_SUPABASE_URL, VITE_V2_SUPABASE_ANON_KEY
// With those unset it falls back to the main client, so after cutover the module
// "just works" against prod with no code change.
const url = import.meta.env.VITE_V2_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_V2_SUPABASE_ANON_KEY as string | undefined

export const v2: SupabaseClient =
  url && anon
    ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
    : supabase

/** True when the module is pointed at a dedicated v2 branch/preview (not prod). */
export const v2IsBranch = Boolean(url && anon)

/**
 * Set at the go-live deploy (VITE_V2_LIVE=true) once prod has been migrated to
 * v2. Then the app uses the v2 UI against the MAIN client (no separate branch
 * URL needed) — this is what flips the whole app at cutover.
 */
export const v2IsLive = import.meta.env.VITE_V2_LIVE === 'true'

/**
 * Render the v2 UI when EITHER a dedicated v2 branch is configured (pre-cutover
 * preview) OR v2 has gone live on prod. Gate all v2 page swaps on this, not on
 * v2IsBranch, so the cutover flips by config with no code change.
 */
export const useV2 = v2IsBranch || v2IsLive

/**
 * Fetch ALL rows from a table, paginating past PostgREST's default 1000-row cap.
 * Pages by a stable `id` order so rows are never skipped or duplicated across
 * pages. `build` lets callers add filters/embeds (applied to every page). Use
 * this for client-side aggregations (analytics, KPIs, matching) over tables that
 * can exceed 1000 rows; for a plain count prefer `select('id',{count:'exact',
 * head:true})`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T = any>(
  table: string,
  columns = '*',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build?: (q: any) => any,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = v2.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (build) q = build(q)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return out
}
