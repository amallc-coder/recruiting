import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

// Returns the profiles the current user is allowed to see (RLS-scoped).
// Admins get the whole team; recruiters get just themselves. Used to populate
// "assigned recruiter" dropdowns.
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => {
        if (!active) return
        setProfiles((data as Profile[]) ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const byId = (id: string | null) => profiles.find((p) => p.id === id) ?? null
  return { profiles, byId, loading }
}
