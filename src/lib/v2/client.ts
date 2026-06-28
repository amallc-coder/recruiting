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
