// One-time cloud seeding: pushes the bundled master data (95 facilities, the
// open requisitions as coverage needs, and the 160-role position catalog) into
// a freshly-created Supabase project. Idempotent — skips any table that already
// has rows. Runs as the signed-in admin (RLS allows admin writes).
import { supabase } from './supabase'
import { MASTER_FACILITIES, MASTER_REQS, type MasterReq } from './masterData'
import { POSITION_SEED } from './positionsSeed'

function reqRole(category: string, position: string): string {
  const p = position.toLowerCase()
  switch (category) {
    case 'Clinical - MA': return 'ma'
    case 'Provider - Advanced Practice': return 'np'
    case 'Provider - Physician': return 'md'
    case 'Clinical - Nursing': return p.includes('rn') && !p.includes('lpn') ? 'rn' : 'lpn'
    case 'Clinical - Tech': return 'tech'
    case 'Admin - Front Office': return 'admin'
    case 'Operations - Leadership': return 'ops'
    default: return 'admin'
  }
}
const reqPriority = (p: string) => (p === 'Critical' ? 'urgent' : p === 'High' ? 'premium' : 'standard')

export interface SeedProgress { step: string; done?: boolean }
export interface SeedResult { facilities: number; coverage: number; positions: number; skipped: string[] }

async function count(table: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return count ?? 0
}

export async function seedCloud(onProgress?: (p: SeedProgress) => void): Promise<SeedResult> {
  const log = (step: string, done = false) => onProgress?.({ step, done })
  const skipped: string[] = []
  const result: SeedResult = { facilities: 0, coverage: 0, positions: 0, skipped }

  // ---- Facilities + coverage needs ----
  if ((await count('facilities')) > 0) {
    skipped.push('facilities')
  } else {
    log('Loading 95 facilities…')
    const facRows = MASTER_FACILITIES.map((f) => ({
      name: f.name,
      division: f.type,
      region: f.region ?? f.state ?? null,
      portfolio: f.network,
      city: f.city,
      state: f.state,
      census: f.total_census ?? f.current_census,
      notes: [f.assigned_physician && `Physician: ${f.assigned_physician}`, f.assigned_np && `NP: ${f.assigned_np}`]
        .filter(Boolean).join(' · ') || null,
      active: true,
    }))
    const { data: inserted, error } = await supabase.from('facilities').insert(facRows).select('id,name')
    if (error) throw new Error('facilities: ' + error.message)
    result.facilities = inserted?.length ?? 0

    // Map master facility code -> new uuid by name, so coverage links correctly.
    const byName = new Map((inserted ?? []).map((r) => [String(r.name), r.id as string]))
    const idFor = (code: string) => {
      const mf = MASTER_FACILITIES.find((f) => f.id === code)
      return mf ? byName.get(mf.name) ?? null : null
    }

    log('Loading open requisitions…')
    const covMap = new Map<string, { facility_id: string; role: string; need: number; pri: string; desc: string }>()
    for (const r of MASTER_REQS as MasterReq[]) {
      const facility_id = idFor(r.facility_id)
      if (!facility_id) continue
      const role = reqRole(r.category, r.position)
      const key = facility_id + '|' + role
      const need = Math.max(1, Math.ceil(r.openings_count || 1))
      const pri = reqPriority(r.priority)
      const desc = `${r.position} — ${r.type} opening (${r.category}) at ${r.facility_name}${r.city ? ', ' + r.city : ''}.${r.recruiter ? ' Recruiter: ' + r.recruiter + '.' : ''}`
      const ex = covMap.get(key)
      if (ex) { ex.need += need; if (pri === 'urgent') ex.pri = 'urgent'; else if (pri === 'premium' && ex.pri !== 'urgent') ex.pri = 'premium' }
      else covMap.set(key, { facility_id, role, need, pri, desc })
    }
    const covRows = [...covMap.values()].map((c) => ({
      facility_id: c.facility_id, role: c.role, have_count: 0, need_count: c.need, priority: c.pri, description: c.desc,
    }))
    if (covRows.length) {
      const { error: covErr } = await supabase.from('coverage_needs').insert(covRows)
      if (covErr) throw new Error('coverage_needs: ' + covErr.message)
      result.coverage = covRows.length
    }
  }

  // ---- Positions catalog ----
  if ((await count('positions')) > 0) {
    skipped.push('positions')
  } else {
    log('Loading 160 positions…')
    const posRows = POSITION_SEED.map((p) => ({
      code: p.code, title: p.title, category: p.category, org_types: p.org_types,
      rate_min: p.rate_min, rate_max: p.rate_max, rate_unit: p.rate_unit,
      responsibilities: p.responsibilities, requirements: p.requirements, keywords: p.keywords,
      ai_generated: p.ai_generated ?? false, active: true,
    }))
    for (let i = 0; i < posRows.length; i += 80) {
      const { error } = await supabase.from('positions').insert(posRows.slice(i, i + 80))
      if (error) throw new Error('positions: ' + error.message)
    }
    result.positions = posRows.length
  }

  log('Done', true)
  return result
}
