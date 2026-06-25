import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, User as UserIcon, Download, X, UserPlus } from 'lucide-react'
import { supabase, demoMode } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/export'
import { REGION_SUGGESTIONS, type Profile, type Role } from '../lib/types'
import { EmptyState, Modal, Spinner } from '../components/ui'

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
  const [inviting, setInviting] = useState(false)

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
          <h1 className="text-2xl font-semibold text-ink">Team</h1>
          <p className="text-sm text-muted">Manage roles and assign each recruiter's regions/territory.</p>
        </div>
        <button className="btn-primary" onClick={() => setInviting(true)}>
          <UserPlus size={16} /> Invite teammate
        </button>
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

      <div className="card border-sage-100 bg-sage-50 p-4 text-sm text-sage-700">
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
                      <UserIcon size={18} className="text-muted" />
                    )}
                    <div>
                      <div className="font-medium text-ink">
                        {p.full_name || '—'} {isSelf && <span className="text-xs text-muted">(you)</span>}
                      </div>
                      <div className="text-xs text-muted">{p.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-md border-0 bg-transparent text-xs font-medium text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      value={p.role}
                      disabled={isSelf || savingId === p.id}
                      onChange={(e) => updateProfile(p.id, { role: e.target.value as Role })}
                    >
                      <option value="recruiter">Recruiter</option>
                      <option value="admin">Admin</option>
                    </select>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.active ? 'bg-sage-100 text-sage-700' : 'bg-brand-50 text-muted'
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
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      Regions covered
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {assigned.length === 0 && (
                        <span className="text-xs text-muted">No regions assigned — this recruiter sees nothing yet.</span>
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
                        className="rounded-md border-0 bg-surface py-1 text-xs text-muted ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
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

      {inviting && (
        <InviteModal regionOptions={regionOptions} onClose={() => setInviting(false)} onInvited={load} />
      )}
    </div>
  )
}

function InviteModal({
  regionOptions,
  onClose,
  onInvited,
}: {
  regionOptions: string[]
  onClose: () => void
  onInvited: () => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('recruiter')
  const [regions, setRegions] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function send() {
    setError(null)
    if (demoMode) {
      setError('Invites send real emails — connect Supabase first (local mode can’t send mail).')
      return
    }
    setSending(true)
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim(), full_name: fullName.trim(), role, regions },
    })
    setSending(false)
    if (error || (data && data.error)) {
      setError((data && data.error) || error?.message || 'Could not send invite.')
      return
    }
    setDone(true)
    onInvited()
  }

  return (
    <Modal title="Invite teammate" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-sage-50 px-4 py-3 text-sm text-sage-700">
            Invite sent to <strong>{email}</strong>. They’ll get an email with a link to set their
            own password, then appear here.
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Sends a secure sign-up link. The teammate sets their own password — you never handle it.
          </p>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Full name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role === 'recruiter' && (
            <div>
              <label className="label">Regions (optional)</label>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {r}
                    <button onClick={() => setRegions((rs) => rs.filter((x) => x !== r))} className="text-brand-400 hover:text-brand-700">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <select
                  className="rounded-md border-0 bg-surface py-1 text-xs text-muted ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
                  value=""
                  onChange={(e) => { if (e.target.value) setRegions((rs) => [...rs, e.target.value]) }}
                >
                  <option value="">+ Add region…</option>
                  {regionOptions.filter((r) => !regions.includes(r)).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={send} disabled={sending || !email}>
              {sending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
