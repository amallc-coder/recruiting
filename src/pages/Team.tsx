import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, User as UserIcon, Download, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/export'
import { REGION_SUGGESTIONS, type Profile, type Role } from '../lib/types'
import { EmptyState, Spinner } from '../components/ui'

interface RecruiterRegion {
  recruiter_id: string
  region: string
}

export function Team() {
  const { profile: me } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [regions, setRegions] = useState<RecruiterRegion[]>([])
  const [facilityRegions, setFacilityRegions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [p, r, f] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('recruiter_regions').select('*'),
      supabase.from('facilities').select('region'),
    ])
    setProfiles((p.data as Profile[]) ?? [])
    setRegions((r.data as RecruiterRegion[]) ?? [])
    const fr = Array.from(
      new Set(((f.data as { region: string | null }[]) ?? []).map((x) => x.region).filter(Boolean)),
    ) as string[]
    setFacilityRegions(fr)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Region options = known facility regions + curated suggestions, de-duped.
  const regionOptions = useMemo(
    () => Array.from(new Set([...facilityRegions, ...REGION_SUGGESTIONS])).sort(),
    [facilityRegions],
  )

  async function updateProfile(id: string, patch: Partial<Profile>) {
    setSavingId(id)
    await supabase.from('profiles').update(patch).eq('id', id)
    await load()
    setSavingId(null)
  }

  async function addRegion(recruiterId: string, region: string) {
    if (!region) return
    setSavingId(recruiterId)
    await supabase.from('recruiter_regions').insert({ recruiter_id: recruiterId, region })
    await load()
    setSavingId(null)
  }

  async function removeRegion(recruiterId: string, region: string) {
    setSavingId(recruiterId)
    await supabase.from('recruiter_regions').delete().eq('recruiter_id', recruiterId).eq('region', region)
    await load()
    setSavingId(null)
  }

  const regionsFor = (id: string) => regions.filter((r) => r.recruiter_id === id).map((r) => r.region)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500">Manage roles and assign each recruiter's regions/territory.</p>
        </div>
        <button
          className="btn-secondary"
          onClick={() =>
            downloadCsv(
              `team-${new Date().toISOString().slice(0, 10)}.csv`,
              profiles.map((p) => ({
                full_name: p.full_name,
                email: p.email,
                role: p.role,
                active: p.active,
                regions: regionsFor(p.id).join('; '),
              })),
            )
          }
          disabled={profiles.length === 0}
        >
          <Download size={16} /> Export
        </button>
      </div>

      <div className="card border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Adding people:</strong> create their account in Supabase → Authentication → Users →
        <em> Add user</em> (email + password, mark confirmed). They appear here on first sign-in. Then
        set their role and assign the regions they cover — recruiters only see facilities, needs, and
        candidates in their assigned regions.
      </div>

      {loading ? (
        <Spinner label="Loading team…" />
      ) : profiles.length === 0 ? (
        <EmptyState title="No team members yet" />
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => {
            const isSelf = p.id === me?.id
            const assigned = regionsFor(p.id)
            const available = regionOptions.filter((r) => !assigned.includes(r))
            return (
              <div key={p.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {p.role === 'admin' ? (
                      <ShieldCheck size={18} className="text-brand-600" />
                    ) : (
                      <UserIcon size={18} className="text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {p.full_name || '—'} {isSelf && <span className="text-xs text-gray-400">(you)</span>}
                      </div>
                      <div className="text-xs text-gray-400">{p.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-md border-0 bg-transparent text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      value={p.role}
                      disabled={isSelf || savingId === p.id}
                      onChange={(e) => updateProfile(p.id, { role: e.target.value as Role })}
                    >
                      <option value="recruiter">Recruiter</option>
                      <option value="admin">Admin</option>
                    </select>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.active ? 'Active' : 'Disabled'}
                    </span>
                    {!isSelf && (
                      <button className="btn-secondary py-1" disabled={savingId === p.id} onClick={() => updateProfile(p.id, { active: !p.active })}>
                        {p.active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Territory assignment (admins see everything, so only show for recruiters) */}
                {p.role === 'recruiter' && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Regions covered
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {assigned.length === 0 && (
                        <span className="text-xs text-gray-400">No regions assigned — this recruiter sees nothing yet.</span>
                      )}
                      {assigned.map((region) => (
                        <span key={region} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                          {region}
                          <button onClick={() => removeRegion(p.id, region)} className="text-brand-400 hover:text-brand-700" aria-label={`Remove ${region}`}>
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <select
                        className="rounded-md border-0 bg-white py-1 text-xs text-gray-600 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-brand-500"
                        value=""
                        disabled={savingId === p.id}
                        onChange={(e) => addRegion(p.id, e.target.value)}
                      >
                        <option value="">+ Add region…</option>
                        {available.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
