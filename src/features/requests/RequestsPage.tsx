import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus, Plus, Check, X, ArrowRight, Trash2, Link2, Mail } from 'lucide-react'
import { Button, Card, Input, Select, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import {
  listRequisitionRequests,
  createRequisitionRequest,
  reviewRequest,
  convertRequest,
  deleteRequest,
  patchRequest,
  REQUEST_URGENCIES,
  type RequisitionRequest,
  type RequestStatus,
  type Urgency,
  type PositionType,
} from '../../lib/v2/requisitionRequests'
import { listFacilities, listRoleFamilies } from '../../lib/v2/requisitions'
import { listDepartments, type Department } from '../../lib/v2/hierarchy'
import type { Facility, RoleFamily } from '../../lib/v2/types'

const STATUS_TONE: Record<RequestStatus, string> = {
  requested: 'bg-clay-50 text-clay-600',
  approved: 'bg-sage-50 text-sage-700',
  declined: 'bg-rust-50 text-rust-500',
  converted: 'bg-sage-500 text-white',
}
const URGENCY_TONE: Record<Urgency, string> = {
  low: 'text-muted',
  normal: 'text-ink',
  high: 'text-clay-600',
  urgent: 'text-rust-600 font-semibold',
}
const REVIEWER_ROLES = ['admin', 'recruiter', 'coordinator']

export function RequestsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const isReviewer = REVIEWER_ROLES.includes(profile?.role ?? '')
  const [rows, setRows] = useState<RequisitionRequest[] | null>(null)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  function refresh() {
    listRequisitionRequests().then(setRows)
  }
  useEffect(() => {
    refresh()
    listFacilities().then(setFacilities)
    listRoleFamilies().then(setRoleFamilies)
    listDepartments().then(setDepartments)
  }, [])

  const facName = useMemo(() => new Map(facilities.map((f) => [f.id, f.name])), [facilities])
  const rfLabel = useMemo(() => new Map(roleFamilies.map((r) => [r.code, r.label])), [roleFamilies])
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments])

  if (!rows) return <Spinner label="Loading requests…" />

  const open = rows.filter((r) => r.status === 'requested').length
  const approved = rows.filter((r) => r.status === 'approved').length
  const converted = rows.filter((r) => r.status === 'converted').length

  async function review(r: RequisitionRequest, status: 'approved' | 'declined') {
    setBusy(r.id)
    const { error } = await reviewRequest(r.id, status)
    setBusy(null)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else refresh()
  }

  async function convert(r: RequisitionRequest) {
    setBusy(r.id)
    const { requisitionId, error } = await convertRequest(r.id)
    setBusy(null)
    if (error || !requisitionId) {
      toast({ tone: 'error', title: 'Could not convert', description: error ?? undefined })
      return
    }
    toast({ tone: 'success', title: 'Requisition created', description: 'Opened as a draft requisition.' })
    refresh()
  }

  async function remove(r: RequisitionRequest) {
    if (!confirm(`Delete the request "${r.title}"?`)) return
    setRows((p) => p!.filter((x) => x.id !== r.id))
    await deleteRequest(r.id)
  }

  async function triage(r: RequisitionRequest, patch: Partial<RequisitionRequest>) {
    setRows((p) => p!.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
    const { error } = await patchRequest(r.id, patch)
    if (error) {
      toast({ tone: 'error', title: 'Update failed', description: error })
      refresh()
    }
  }

  const publicLink = `${window.location.origin}${import.meta.env.BASE_URL}#/staffing-request`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <FilePlus size={22} className="text-sage-600" /> Requests to fill
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isReviewer
              ? 'Incoming staffing requests from hiring managers. Approve and convert them into requisitions.'
              : 'Request coverage for your facility. Recruiting will review and open a requisition.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isReviewer && (
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(publicLink)
                toast({ tone: 'success', title: 'Public request link copied', description: 'Share it with facility managers — no login needed.' })
              }}
            >
              <Link2 size={15} className="mr-1.5" /> Copy facility link
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus size={15} className="mr-1.5" /> New request
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Awaiting review" value={open} tone={open > 0 ? 'warn' : 'default'} />
        <StatCard label="Approved" value={approved} />
        <StatCard label="Converted to reqs" value={converted} tone={converted > 0 ? 'good' : 'default'} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No requests yet" hint={isReviewer ? 'Hiring managers can submit requests to fill here.' : 'Submit a request to fill an open need at your facility.'} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[r.status]}`}>{r.status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>{r.facility_id ? facName.get(r.facility_id) ?? 'Facility' : r.facility_name || 'No facility'}</span>
                    {r.department_id && <span>{deptName.get(r.department_id) ?? 'Dept'}</span>}
                    <span>{r.role_family ? rfLabel.get(r.role_family) ?? r.role_family : 'No role family'}</span>
                    <span>{r.headcount} opening{r.headcount === 1 ? '' : 's'}</span>
                    <span className={URGENCY_TONE[r.urgency]}>{r.urgency} priority</span>
                    {r.target_start && <span>needs by {r.target_start}</span>}
                    {r.position_type === 'replacement' ? (
                      <span className="rounded bg-clay-50 px-1.5 text-clay-600">
                        Replacement{r.replacing_name ? ` · ${r.replacing_name}` : ''}
                      </span>
                    ) : (
                      <span className="rounded bg-sage-50 px-1.5 text-sage-700">New position</span>
                    )}
                    {r.source === 'public' && <span className="rounded bg-clay-50 px-1.5 text-clay-600">via link</span>}
                  </div>
                  {r.requester_name && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>Requested by <span className="text-ink">{r.requester_name}</span></span>
                      {r.requester_email && (
                        <a href={`mailto:${r.requester_email}`} className="inline-flex items-center gap-1 text-sage-700 hover:underline">
                          <Mail size={11} /> {r.requester_email}
                        </a>
                      )}
                    </div>
                  )}
                  {r.reason && <p className="mt-2 text-sm text-ink">{r.reason}</p>}

                  {/* Triage: public requests often lack a facility_id / role_family; set them so Convert works. */}
                  {isReviewer && r.status !== 'converted' && (!r.facility_id || !r.role_family) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2 py-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Triage:</span>
                      {!r.facility_id && (
                        <select
                          value={r.facility_id ?? ''}
                          onChange={(e) => triage(r, { facility_id: e.target.value || null })}
                          className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs"
                        >
                          <option value="">Set facility…</option>
                          {facilities.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      )}
                      {!r.role_family && (
                        <select
                          value={r.role_family ?? ''}
                          onChange={(e) => triage(r, { role_family: e.target.value || null })}
                          className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs"
                        >
                          <option value="">Set role family…</option>
                          {roleFamilies.map((rf) => (
                            <option key={rf.code} value={rf.code}>{rf.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {r.requisition_id && (
                    <Link to={`/requisitions/${r.requisition_id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-sage-700 hover:underline">
                      View requisition <ArrowRight size={12} />
                    </Link>
                  )}
                </div>

                {isReviewer && (
                  <div className="flex shrink-0 items-center gap-2">
                    {r.status === 'requested' && (
                      <>
                        <Button variant="secondary" onClick={() => review(r, 'approved')} loading={busy === r.id}>
                          <Check size={15} className="mr-1" /> Approve
                        </Button>
                        <button onClick={() => review(r, 'declined')} disabled={busy === r.id} className="rounded-lg border border-line px-2 py-2 text-muted hover:border-rust-300 hover:text-rust-500" title="Decline">
                          <X size={15} />
                        </button>
                      </>
                    )}
                    {(r.status === 'requested' || r.status === 'approved') && (
                      <Button onClick={() => convert(r)} loading={busy === r.id}>
                        Create requisition
                      </Button>
                    )}
                    <button onClick={() => remove(r)} className="text-muted hover:text-rust-500" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <NewRequestModal
          facilities={facilities}
          roleFamilies={roleFamilies}
          departments={departments}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refresh() }}
        />
      )}
    </div>
  )
}

function NewRequestModal({
  facilities,
  roleFamilies,
  departments,
  onClose,
  onSaved,
}: {
  facilities: Facility[]
  roleFamilies: RoleFamily[]
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [facilityId, setFacilityId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [roleFamily, setRoleFamily] = useState('')
  const [headcount, setHeadcount] = useState('1')
  const [positionType, setPositionType] = useState<PositionType>('new')
  const [replacingName, setReplacingName] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [targetStart, setTargetStart] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const facilityDepts = departments.filter((d) => d.facility_id === facilityId)

  async function save() {
    if (!title.trim() || !facilityId) {
      setError('A title and facility are required.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await createRequisitionRequest({
      title: title.trim(),
      facility_id: facilityId,
      department_id: departmentId || null,
      role_family: roleFamily || null,
      headcount: Math.max(1, parseInt(headcount, 10) || 1),
      urgency,
      position_type: positionType,
      replacing_name: positionType === 'replacement' ? replacingName.trim() || null : null,
      target_start: targetStart || null,
      reason: reason.trim() || null,
    })
    setSaving(false)
    if (error) {
      setError(error)
      return
    }
    toast({ tone: 'success', title: 'Request submitted' })
    onSaved()
  }

  return (
    <Modal
      title="Request to fill"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Submit request</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="What do you need?" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Night-shift RN, Med/Surg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Facility" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setDepartmentId('') }} placeholder="Select facility…">
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}{f.state ? ` · ${f.state}` : ''}</option>
            ))}
          </Select>
          <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder={facilityId ? (facilityDepts.length ? 'Select department…' : 'No departments') : 'Pick a facility first'}>
            {facilityDepts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>
        <Select label="Role family" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Select role…">
          {roleFamilies.map((rf) => (
            <option key={rf.code} value={rf.code}>{rf.label}</option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="New or replacement position" value={positionType} onChange={(e) => setPositionType(e.target.value as PositionType)}>
            <option value="new">New position</option>
            <option value="replacement">Replacement</option>
          </Select>
          {positionType === 'replacement' && (
            <Input label="Who is being replaced" value={replacingName} onChange={(e) => setReplacingName(e.target.value)} placeholder="Name of departing staff member" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Openings" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          <Select label="Priority" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
            {REQUEST_URGENCIES.map((u) => (
              <option key={u} value={u} className="capitalize">{u}</option>
            ))}
          </Select>
          <Input label="Needed by" type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value)} />
        </div>
        <div>
          <label className="label">Context / justification</label>
          <textarea className="input min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this needed — census growth, resignation, leave coverage…" />
        </div>
        {error && <p className="text-sm text-rust-700">{error}</p>}
      </div>
    </Modal>
  )
}
