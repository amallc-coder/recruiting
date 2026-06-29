import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, UserRound, X } from 'lucide-react'
import { Button, Card, Badge, Select, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import {
  loadTeam,
  setRole,
  setActive,
  addRegion,
  removeRegion,
  TEAM_ROLES,
  ROLE_LABELS,
  REGION_LIMITED_ROLES,
  type TeamData,
  type TeamMember,
  type TeamRole,
} from '../../lib/v2/team'

const ROLE_TONE: Record<string, BadgeTone> = {
  admin: 'ink',
  recruiter: 'sage',
  coordinator: 'clay',
  hiring_manager: 'clay',
  compliance: 'neutral',
}

export function TeamPage() {
  const { profile: me } = useAuth()
  const { toast } = useToast()
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    loadTeam().then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [])
  useEffect(load, [load])

  async function run(id: string, fn: () => Promise<{ error: string | null }>, ok: string) {
    setBusyId(id)
    const { error } = await fn()
    setBusyId(null)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else {
      toast({ tone: 'success', title: ok })
      load()
    }
  }

  if (loading) return <Spinner label="Loading team…" />
  if (!data) return <EmptyState title="Could not load the team" />

  const { members, regionsByUser, regionOptions } = data

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Team</h1>
        <p className="mt-1 text-sm text-muted">Manage roles, access, and each recruiter's regions.</p>
      </div>

      <Card className="border-l-4 border-sage-500 bg-sage-50/40 p-4 text-sm text-ink/90">
        <strong>Regions control what recruiters see.</strong> Recruiters and hiring managers are
        region-limited — they only see facilities, coverage, and requisitions in regions assigned to
        them (they always see candidates assigned to them). Assign regions below to open up their
        view. Admins, coordinators, and compliance see all regions.
      </Card>

      {members.length === 0 ? (
        <EmptyState title="No team members yet" />
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              isSelf={m.id === me?.id}
              busy={busyId === m.id}
              regions={regionsByUser[m.id] ?? []}
              regionOptions={regionOptions}
              onRole={(role) => run(m.id, () => setRole(m.id, role), `Role set to ${ROLE_LABELS[role]}`)}
              onActive={(active) => run(m.id, () => setActive(m.id, active), active ? 'Enabled' : 'Disabled')}
              onAddRegion={(region) => run(m.id, () => addRegion(m.id, region), `Added ${region}`)}
              onRemoveRegion={(region) => run(m.id, () => removeRegion(m.id, region), `Removed ${region}`)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        Recruiter logins — invite, set login email, password reset — are handled separately and are
        coming in a follow-up. This page manages role, access, and regions.
      </p>
    </div>
  )
}

function MemberCard({
  member,
  isSelf,
  busy,
  regions,
  regionOptions,
  onRole,
  onActive,
  onAddRegion,
  onRemoveRegion,
}: {
  member: TeamMember
  isSelf: boolean
  busy: boolean
  regions: string[]
  regionOptions: string[]
  onRole: (role: TeamRole) => void
  onActive: (active: boolean) => void
  onAddRegion: (region: string) => void
  onRemoveRegion: (region: string) => void
}) {
  const regionLimited = REGION_LIMITED_ROLES.has(member.role)
  const available = regionOptions.filter((r) => !regions.includes(r))

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {member.role === 'admin' ? (
            <ShieldCheck size={18} className="text-ink" />
          ) : (
            <UserRound size={18} className="text-muted" />
          )}
          <div>
            <div className="flex items-center gap-2 font-medium text-ink">
              {member.full_name || member.email || '—'}
              {isSelf && <span className="text-xs text-muted">(you)</span>}
              <Badge tone={ROLE_TONE[member.role] ?? 'neutral'}>{ROLE_LABELS[member.role as TeamRole] ?? member.role}</Badge>
              {!member.active && <Badge tone="rust">Disabled</Badge>}
            </div>
            <div className="text-xs text-muted">{member.email || 'no email set'}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={`Role for ${member.full_name || member.email}`}
            value={TEAM_ROLES.includes(member.role as TeamRole) ? member.role : ''}
            disabled={isSelf || busy}
            onChange={(e) => onRole(e.target.value as TeamRole)}
            options={TEAM_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            className="h-8 w-40 py-0"
          />
          {!isSelf && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => onActive(!member.active)}>
              {member.active ? 'Disable' : 'Enable'}
            </Button>
          )}
        </div>
      </div>

      {regionLimited && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Regions covered</div>
          <div className="flex flex-wrap items-center gap-2">
            {regions.length === 0 && (
              <span className="text-xs text-rust-700">No regions assigned — sees no facility-scoped data yet.</span>
            )}
            {regions.map((region) => (
              <span
                key={region}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-ink"
              >
                {region}
                <button
                  onClick={() => onRemoveRegion(region)}
                  className="text-muted hover:text-ink"
                  aria-label={`Remove ${region}`}
                  disabled={busy}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <select
              className="rounded-md border-0 bg-surface py-1 text-xs text-muted ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
              value=""
              disabled={busy || available.length === 0}
              onChange={(e) => {
                if (e.target.value) onAddRegion(e.target.value)
              }}
            >
              <option value="">{available.length ? '+ Add region…' : 'All regions added'}</option>
              {available.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Card>
  )
}
