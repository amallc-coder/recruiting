import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, User as UserIcon, Download, X, UserPlus, Mail, KeyRound, Loader2 } from 'lucide-react'
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
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null)
  const [accountEdit, setAccountEdit] = useState<Profile | null>(null)

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

  const isPlaceholderEmail = (email: string | null | undefined) =>
    !email || /@placeholder\.|\.invalid$/i.test(email)

  async function sendReset(p: Profile) {
    if (demoMode) { setNotice({ ok: false, msg: 'Local mode can’t send email — connect Supabase.' }); return }
    if (isPlaceholderEmail(p.email)) {
      setNotice({ ok: false, msg: `${p.full_name || 'This user'} still has a placeholder email — set a real one first, then send the reset.` })
      return
    }
    setSavingId(p.id); setNotice(null)
    const { error } = await supabase.auth.resetPasswordForEmail(p.email, {
      redirectTo: window.location.origin + window.location.pathname + '#/login',
    })
    setSavingId(null)
    setNotice(error
      ? { ok: false, msg: `Couldn’t send reset: ${error.message}` }
      : { ok: true, msg: `Password-reset email sent to ${p.email}.` })
  }

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
        <strong>Recruiters &amp; logins:</strong> imported recruiters appear as <em>placeholders</em> (assigned
        work, no login). Give one access by <strong>editing their email</strong> to a real address, then
        <strong> Send password reset</strong> — they’ll get a link to set their own password. You can also
        <em> Invite teammate</em> to add someone fresh.
      </div>

      {notice && (
        <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${notice.ok ? 'bg-sage-50 text-sage-700' : 'bg-rust-50 text-rust-500'}`}>
          <span className="flex-1">{notice.msg}</span>
          <button className="text-muted hover:text-ink" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}

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
                      <div className="flex items-center gap-2 font-medium text-ink">
                        {p.full_name || '—'} {isSelf && <span className="text-xs text-muted">(you)</span>}
                        {(p.placeholder || isPlaceholderEmail(p.email)) && p.role === 'recruiter' && (
                          <span className="rounded bg-clay-50 px-1.5 py-0.5 text-[10px] font-medium text-clay-600">placeholder · no login</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">{isPlaceholderEmail(p.email) ? 'no email set' : p.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isSelf && !demoMode && (
                      <>
                        <button className="btn-secondary py-1" disabled={savingId === p.id} onClick={() => setAccountEdit(p)} title="Set login email">
                          <Mail size={14} /> Email
                        </button>
                        <button className="btn-secondary py-1" disabled={savingId === p.id} onClick={() => sendReset(p)} title="Send password-reset email">
                          {savingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Reset
                        </button>
                      </>
                    )}
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
      {accountEdit && (
        <EmailModal
          profile={accountEdit}
          onClose={() => setAccountEdit(null)}
          onSaved={(msg) => { setAccountEdit(null); setNotice({ ok: true, msg }); load() }}
        />
      )}
    </div>
  )
}

function EmailModal({ profile, onClose, onSaved }: {
  profile: Profile
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isPlaceholder = !profile.email || /@placeholder\.|\.invalid$/i.test(profile.email)
  const [email, setEmail] = useState(isPlaceholder ? '' : profile.email)
  const [reset, setReset] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const next = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) { setError('Enter a valid email address.'); return }
    setSaving(true); setError(null)
    const { data, error: fErr } = await supabase.functions.invoke('recruiter-admin', {
      body: { action: 'update_email', user_id: profile.id, email: next },
    })
    if (fErr || (data && data.error)) { setSaving(false); setError((data && data.error) || fErr?.message || 'Could not update email.'); return }
    let msg = `Login email set to ${next}.`
    if (reset) {
      const { error: rErr } = await supabase.auth.resetPasswordForEmail(next, {
        redirectTo: window.location.origin + window.location.pathname + '#/login',
      })
      msg += rErr ? ` (Couldn’t send reset: ${rErr.message})` : ' A password-reset email was sent so they can set their password.'
    }
    setSaving(false)
    onSaved(msg)
  }

  return (
    <Modal title={`Set login email — ${profile.full_name || 'recruiter'}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Set this recruiter’s real email so they can sign in. Their assigned candidates and jobs stay
          intact. Optionally send a password-reset link so they choose their own password.
        </p>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} />
          Send a password-reset email now
        </label>
        {error && <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !email.trim()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save email
          </button>
        </div>
      </div>
    </Modal>
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
