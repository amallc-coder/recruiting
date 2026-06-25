import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Facility } from '../lib/types'

// Loads the facilities the current user can see (RLS-scoped to their regions).
export function useFacilities() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('facilities')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (!active) return
        setFacilities((data as Facility[]) ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const byId = (id: string | null) => facilities.find((f) => f.id === id) ?? null
  return { facilities, byId, loading }
}
