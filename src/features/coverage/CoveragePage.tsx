import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listFacilityCoverage,
  listRoleFamilies,
  upsertCoverageNeed,
  deleteCoverageNeed,
  gap,
  type CoverageInput,
} from '../../lib/v2/coverage'
import type { FacilityCoverage, CoverageNeed, CoveragePriority, RoleFamily } from '../../lib/v2/types'

const PRIORITY_TONE: Record<CoveragePriority, BadgeTone> = {
  standard: 'neutral',
  premium: 'clay',
  urgent: 'rust',
}

interface EditState {
  facilityId: string
  facilityName: string
  need: CoverageNeed | null
}

export function CoveragePage() {
  const { toast } = useToast()
  const [facilities, setFacilities] = useState<FacilityCoverage[]>([])
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<EditState | null>(null)

  function load() {
    setLoading(true)
    Promise.all([listFacilityCoverage(), listRoleFamilies()]).then(([fc, rf]) => {
      setFacilities(fc)
      setRoleFamilies(rf)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const rollup = useMemo(() => {
    const needs = facilities.flatMap((f) => f.needs)
    return {
      openPositions: needs.reduce((s, n) => s + gap(n), 0),
      urgent: needs.filter((n) => n.priority === 'urgent' && gap(n) > 0).length,
      withGaps: facilities.filter((f) => f.needs.some((n) => gap(n) > 0)).length,
    }
  }, [facilities])

  async function remove(n: CoverageNeed) {
    const { error } = await deleteCoverageNeed(n.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Coverage need removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading coverage…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Facility Coverage</h1>
          <p className="mt-1 text-sm text-muted">Have vs. need by role across each facility.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open positions" value={rollup.openPositions} hint="sum of need − have" />
        <StatCard label="Urgent gaps" value={rollup.urgent} tone={rollup.urgent > 0 ? 'warn' : 'default'} hint="priority = urgent" />
        <StatCard label="Facilities with gaps" value={rollup.withGaps} hint={`of ${facilities.length}`} />
      </div>

      {facilities.length === 0 ? (
        <EmptyState title="No facilities yet" hint="Add facilities to start tracking coverage." />
      ) : (
        <div className="space-y-4">
          {facilities.map((f) => (
            <Card key={f.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">{f.name}</h2>
                  {f.region && <Badge tone="neutral">{f.region}</Badge>}
                  {[f.city, f.state].filter(Boolean).length > 0 && (
                    <span className="text-xs text-muted">{[f.city, f.state].filter(Boolean).join(', ')}</span>
                  )}
                </div>
                <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setEdit({ facilityId: f.id, facilityName: f.name, need: null })}>
                  Add role
                </Button>
              </div>
              {f.needs.length === 0 ? (
                <p className="text-sm text-muted">No coverage needs recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="py-1.5 pr-3 font-medium">Role</th>
                        <th className="py-1.5 pr-3 font-medium tnum">Have</th>
                        <th className="py-1.5 pr-3 font-medium tnum">Need</th>
                        <th className="py-1.5 pr-3 font-medium tnum">Gap</th>
                        <th className="py-1.5 pr-3 font-medium">Priority</th>
                        <th className="py-1.5 pr-3 font-medium">Current provider</th>
                        <th className="py-1.5 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {f.needs.map((n) => (
                        <tr key={n.id} className="border-b border-line/60">
                          <td className="py-2 pr-3 font-medium text-ink">{n.role_family}</td>
                          <td className="py-2 pr-3 tnum">{n.have_count}</td>
                          <td className="py-2 pr-3 tnum">{n.need_count}</td>
                          <td className={`py-2 pr-3 tnum font-semibold ${gap(n) > 0 ? 'text-rust-600' : 'text-sage-600'}`}>{gap(n)}</td>
                          <td className="py-2 pr-3"><Badge tone={PRIORITY_TONE[n.priority]}>{n.priority}</Badge></td>
                          <td className="py-2 pr-3 text-muted">{n.current_provider || '—'}</td>
                          <td className="py-2 text-right">
                            <div className="inline-flex gap-1">
                              <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit({ facilityId: f.id, facilityName: f.name, need: n })}>
                                <Pencil size={14} />
                              </Button>
                              <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => remove(n)}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {edit && (
        <CoverageForm
          state={edit}
          roleFamilies={roleFamilies}
          usedRoles={facilities.find((f) => f.id === edit.facilityId)?.needs.map((n) => n.role_family) ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function CoverageForm({
  state,
  roleFamilies,
  usedRoles,
  onClose,
  onSaved,
}: {
  state: EditState
  roleFamilies: RoleFamily[]
  usedRoles: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const existing = state.need
  const [roleFamily, setRoleFamily] = useState(existing?.role_family ?? '')
  const [have, setHave] = useState(existing?.have_count ?? 0)
  const [need, setNeed] = useState(existing?.need_count ?? 0)
  const [priority, setPriority] = useState<CoveragePriority>(existing?.priority ?? 'standard')
  const [provider, setProvider] = useState(existing?.current_provider ?? '')
  const [saving, setSaving] = useState(false)

  const roleOptions = roleFamilies
    .filter((rf) => existing || !usedRoles.includes(rf.code))
    .map((rf) => ({ value: rf.code, label: `${rf.code} — ${rf.label}` }))

  async function save() {
    if (!roleFamily) {
      toast({ tone: 'error', title: 'Pick a role family' })
      return
    }
    setSaving(true)
    const input: CoverageInput = { have_count: have, need_count: need, priority, current_provider: provider || null }
    const { error } = await upsertCoverageNeed(state.facilityId, roleFamily, input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: existing ? 'Coverage updated' : 'Coverage added' })
      onSaved()
    }
  }

  return (
    <Modal
      title={`${existing ? 'Edit' : 'Add'} coverage — ${state.facilityName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {existing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Role family"
          value={roleFamily}
          onChange={(e) => setRoleFamily(e.target.value)}
          options={roleOptions}
          placeholder="Select a role family"
          disabled={Boolean(existing)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Have" type="number" min={0} value={have} onChange={(e) => setHave(Number(e.target.value))} />
          <Input label="Need" type="number" min={0} value={need} onChange={(e) => setNeed(Number(e.target.value))} />
        </div>
        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as CoveragePriority)}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'premium', label: 'Premium' },
            { value: 'urgent', label: 'Urgent' },
          ]}
        />
        <Input label="Current provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Agency X (optional)" />
      </div>
    </Modal>
  )
}
