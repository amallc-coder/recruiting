import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus, Plus, Check, X, ArrowRight, Trash2 } from 'lucide-react'
import { Button, Card, Input, Select, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import {
  listRequisitionRequests,
  createRequisitionRequest,
  reviewRequest,
  convertRequest,
  deleteRequest,
  REQUEST_URGENCIES,
  type RequisitionRequest,
  type RequestStatus,
  type Urgency,
} from '../../lib/v2/requisitionRequests'
import { listFacilities, listRoleFamilies } from '../../lib/v2/requisitions'
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
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  function refresh() {
    listRequisitionRequests().then(setRows)
  }
  useEffect(() => {
    refresh()
    listFacilities().then(setFacilities)
    listRoleFamilies().then(setRoleFamilies)
  }, [])

  const facName = useMemo(() => new Map(facilities.map((f) => [f.id, f.name])), [facilities])
  const rfLabel = useMemo(() => new Map(roleFamilies.map((r) => [r.code, r.label])), [roleFamilies])

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
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} className="mr-1.5" /> New request
        </Button>
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
                    <span>{r.facility_id ? facName.get(r.facility_id) ?? 'Facility' : 'No facility'}</span>
                    <span>{r.role_family ? rfLabel.get(r.role_family) ?? r.role_family : 'No role family'}</span>
                    <span>{r.headcount} opening{r.headcount === 1 ? '' : 's'}</span>
                    <span className={URGENCY_TONE[r.urgency]}>{r.urgency} priority</span>
                    {r.target_start && <span>needs by {r.target_start}</span>}
                  </div>
                  {r.reason && <p className="mt-2 text-sm text-ink">{r.reason}</p>}
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
  onClose,
  onSaved,
}: {
  facilities: Facility[]
  roleFamilies: RoleFamily[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [facilityId, setFacilityId] = useState('')
  const [roleFamily, setRoleFamily] = useState('')
  const [headcount, setHeadcount] = useState('1')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [targetStart, setTargetStart] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      role_family: roleFamily || null,
      headcount: Math.max(1, parseInt(headcount, 10) || 1),
      urgency,
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
          <Select label="Facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} placeholder="Select facility…">
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}{f.state ? ` · ${f.state}` : ''}</option>
            ))}
          </Select>
          <Select label="Role family" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Select role…">
            {roleFamilies.map((rf) => (
              <option key={rf.code} value={rf.code}>{rf.label}</option>
            ))}
          </Select>
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
