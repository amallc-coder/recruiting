import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Button, Card } from '../../components/primitives'
import { useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { ReqStatusBadge } from './badges'
import { RequisitionForm } from './RequisitionForm'
import { PipelineBoard } from './PipelineBoard'
import { ScreeningQuestionsCard } from './ScreeningQuestionsCard'
import { AutoScreenCard } from './AutoScreenCard'
import { SlotsCard } from './SlotsCard'
import {
  getRequisition,
  listFacilities,
  listOrgUsers,
  listRoleFamilies,
  transitionRequisition,
  availableActions,
  daysOpen,
  appCount,
  type ReqAction,
} from '../../lib/v2/requisitions'
import type { RequisitionRow, Facility, OrgUser, RoleFamily } from '../../lib/v2/types'

export function RequisitionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [req, setReq] = useState<RequisitionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([])

  function load() {
    if (!id) return
    setLoading(true)
    getRequisition(id).then((r) => {
      setReq(r)
      setLoading(false)
    })
  }
  useEffect(load, [id])
  useEffect(() => {
    Promise.all([listFacilities(), listOrgUsers(), listRoleFamilies()]).then(([f, u, rf]) => {
      setFacilities(f)
      setUsers(u)
      setRoleFamilies(rf)
    })
  }, [])

  async function act(action: ReqAction) {
    if (!req) return
    const { error } = await transitionRequisition(req.id, action)
    if (error) toast({ tone: 'error', title: 'Action failed', description: error })
    else {
      toast({ tone: 'success', title: 'Requisition updated' })
      load()
    }
  }
  if (loading) return <Spinner label="Loading requisition…" />
  if (!req) return <EmptyState title="Requisition not found" hint="It may have been removed." />

  const managerName = req.manager?.full_name ?? 'Unassigned'
  const hmName = req.hiring_manager?.full_name ?? null

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/requisitions')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Requisitions
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{req.title}</h1>
            <ReqStatusBadge status={req.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {req.facility?.division?.name ? `${req.facility.division.name} · ` : ''}
            {req.facility?.name ?? '—'}
            {req.department?.name ? ` · ${req.department.name}` : ''} · {req.role_family}
            {req.specialty ? ` · ${req.specialty}` : ''} · Recruiter: {managerName}
            {hmName ? ` · Hiring manager: ${hmName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {availableActions(req.status).map(({ action, label }) => (
            <Button key={action} size="sm" variant={action === 'approve' ? 'primary' : 'secondary'} onClick={() => act(action)}>
              {label}
            </Button>
          ))}
          <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Days open" value={daysOpen(req)} hint={req.filled_at ? 'to fill' : req.opened_at ? 'and counting' : 'not opened yet'} />
        <StatCard label="Candidates" value={appCount(req)} hint={`${req.headcount} opening${req.headcount === 1 ? '' : 's'}`} />
        <StatCard
          label="Approval"
          value={req.approval_status}
          tone={req.approval_status === 'approved' ? 'good' : req.approval_status === 'rejected' ? 'warn' : 'default'}
          info="Where the requisition sits in the approval chain. 'Approved' = it cleared sign-off and can be opened/published to candidates."
        />
      </div>

      {/* Description & requirements */}
      {(req.description || req.requirements) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {req.description && (
            <Card className="p-5">
              <div className="stat-label">Description</div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{req.description}</p>
            </Card>
          )}
          {req.requirements && (
            <Card className="p-5">
              <div className="stat-label">Requirements</div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{req.requirements}</p>
            </Card>
          )}
        </div>
      )}

      {/* Pipeline */}
      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-tight text-ink">Pipeline</h2>
        <PipelineBoard requisitionId={req.id} roleFamily={req.role_family} orgId={req.org_id} onChanged={load} />
      </div>

      {/* Screening questions config (seeds screenings for candidates on this req) */}
      <ScreeningQuestionsCard requisitionId={req.id} roleFamily={req.role_family} title={req.title} />

      {/* Conversational screening automation + interview self-scheduling */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AutoScreenCard requisitionId={req.id} />
        <SlotsCard requisitionId={req.id} facilityId={req.facility_id} />
      </div>

      {editing && (
        <RequisitionForm
          existing={req}
          facilities={facilities}
          users={users}
          roleFamilies={roleFamilies}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            load()
          }}
        />
      )}
    </div>
  )
}
