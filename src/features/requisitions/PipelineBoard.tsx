import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core'
import { GripVertical, Plus } from 'lucide-react'
import { Button, Select, Modal, useToast } from '../../components/primitives'
import { Spinner } from '../../components/ui'
import { PlacementBadge } from './badges'
import {
  listStages,
  listPipeline,
  moveStage,
  bulkMove,
  rejectApplications,
  tagCandidates,
  logEmails,
  listSelectableCandidates,
  addApplication,
} from '../../lib/v2/pipeline'
import type { PipelineStage, PipelineCard } from '../../lib/v2/types'

export function PipelineBoard({
  requisitionId,
  roleFamily,
  orgId,
  onChanged,
}: {
  requisitionId: string
  roleFamily: string
  orgId: string
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [cards, setCards] = useState<PipelineCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState('')
  const [adding, setAdding] = useState(false)
  const reverting = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function reload() {
    setLoading(true)
    Promise.all([listStages(roleFamily), listPipeline(requisitionId)]).then(([s, c]) => {
      setStages(s)
      setCards(c)
      setLoading(false)
    })
  }
  useEffect(reload, [requisitionId, roleFamily]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstStageId = stages[0]?.id ?? null
  const rejectedStageId = stages.find((s) => s.stage_type === 'rejected')?.id ?? null

  const byStage = useMemo(() => {
    const map = new Map<string, PipelineCard[]>()
    for (const s of stages) map.set(s.id, [])
    for (const c of cards) {
      const sid = c.stageId && map.has(c.stageId) ? c.stageId : firstStageId
      if (sid) map.get(sid)!.push(c)
    }
    return map
  }, [cards, stages, firstStageId])

  function onDragEnd(e: DragEndEvent) {
    const appId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId) return
    const card = cards.find((c) => c.application.id === appId)
    if (!card || card.stageId === overId) return
    const prevStage = card.stageId
    setCards((cs) => cs.map((c) => (c.application.id === appId ? { ...c, stageId: overId, daysInStage: 0 } : c))) // optimistic
    moveStage(appId, overId).then(({ error }) => {
      if (error) {
        reverting.current = true
        setCards((cs) => cs.map((c) => (c.application.id === appId ? { ...c, stageId: prevStage } : c)))
        toast({ tone: 'error', title: 'Move failed', description: error })
      } else {
        onChanged?.()
      }
    })
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function clearSel() {
    setSelected(new Set())
  }
  const selectedCards = cards.filter((c) => selected.has(c.application.id))
  const selectedCandidateIds = Array.from(new Set(selectedCards.map((c) => c.candidate.id)))

  async function doBulkMove() {
    if (!bulkStage || !selected.size) return
    const ids = Array.from(selected)
    const { error } = await bulkMove(ids, bulkStage)
    if (error) toast({ tone: 'error', title: 'Bulk move failed', description: error })
    else toast({ tone: 'success', title: `Moved ${ids.length}` })
    clearSel()
    reload()
    onChanged?.()
  }
  async function doReject() {
    const reason = window.prompt('Reject reason (applies to all selected):')?.trim()
    if (!reason) return
    const { error } = await rejectApplications(Array.from(selected), reason, rejectedStageId)
    if (error) toast({ tone: 'error', title: 'Reject failed', description: error })
    else toast({ tone: 'success', title: `Rejected ${selected.size}` })
    clearSel()
    reload()
    onChanged?.()
  }
  async function doTag() {
    const tag = window.prompt('Tag to add to selected candidates:')?.trim()
    if (!tag) return
    const { error } = await tagCandidates(selectedCandidateIds, tag)
    if (error) toast({ tone: 'error', title: 'Tag failed', description: error })
    else toast({ tone: 'success', title: `Tagged ${selectedCandidateIds.length}` })
    clearSel()
    reload()
  }
  async function doEmail() {
    const subject = window.prompt('Email subject:')?.trim()
    if (!subject) return
    const body = window.prompt('Email body:')?.trim() || ''
    const { error } = await logEmails(selectedCandidateIds, subject, body)
    if (error) toast({ tone: 'error', title: 'Email failed', description: error })
    else toast({ tone: 'success', title: `Logged email to ${selectedCandidateIds.length}` })
    clearSel()
  }

  if (loading) return <Spinner label="Loading pipeline…" />
  if (!stages.length) return <p className="text-sm text-muted">No pipeline stages defined for role family {roleFamily}.</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {cards.length} candidate{cards.length === 1 ? '' : 's'} in pipeline
        </span>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} leftIcon={<Plus size={14} />}>
          Add candidate
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-card">
          <span className="px-1 text-sm font-medium text-ink">{selected.size} selected</span>
          <Select aria-label="Move selected to stage" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} placeholder="Move to…" className="h-8 w-40 py-0">
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={doBulkMove} disabled={!bulkStage}>
            Move
          </Button>
          <Button size="sm" variant="secondary" onClick={doReject}>
            Reject…
          </Button>
          <Button size="sm" variant="secondary" onClick={doEmail}>
            Email…
          </Button>
          <Button size="sm" variant="secondary" onClick={doTag}>
            Tag…
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSel} className="ml-auto">
            Clear
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => (
            <StageColumn key={stage.id} stage={stage} count={byStage.get(stage.id)?.length ?? 0}>
              {(byStage.get(stage.id) ?? []).map((card) => (
                <CandidateCard key={card.application.id} card={card} selected={selected.has(card.application.id)} onToggle={() => toggle(card.application.id)} />
              ))}
            </StageColumn>
          ))}
        </div>
      </DndContext>

      {adding && (
        <AddCandidate
          requisitionId={requisitionId}
          orgId={orgId}
          stageId={firstStageId}
          existing={cards.map((c) => c.candidate.id)}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            reload()
            onChanged?.()
          }}
        />
      )}
    </div>
  )
}

function AddCandidate({
  requisitionId,
  orgId,
  stageId,
  existing,
  onClose,
  onAdded,
}: {
  requisitionId: string
  orgId: string
  stageId: string | null
  existing: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const { toast } = useToast()
  const [cands, setCands] = useState<{ id: string; full_name: string }[]>([])
  const [sel, setSel] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    listSelectableCandidates().then(setCands)
  }, [])
  const options = cands.filter((c) => !existing.includes(c.id))

  async function add() {
    if (!sel) return
    setSaving(true)
    const { error } = await addApplication(requisitionId, sel, stageId, orgId)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Add failed', description: error })
    else {
      toast({ tone: 'success', title: 'Candidate added to pipeline' })
      onAdded()
    }
  }

  return (
    <Modal
      title="Add candidate to pipeline"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} loading={saving} disabled={!sel}>
            Add
          </Button>
        </>
      }
    >
      <Select
        label="Candidate"
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        placeholder={options.length ? 'Select candidate…' : 'No more candidates to add'}
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </Select>
    </Modal>
  )
}

function StageColumn({ stage, count, children }: { stage: PipelineStage; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted">{stage.name}</span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-ink tnum">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-32 flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors ${isOver ? 'border-ink/40 bg-brand-50/60' : 'border-line bg-paper/40'}`}
      >
        {children}
      </div>
    </div>
  )
}

function CandidateCard({ card, selected, onToggle }: { card: PipelineCard; selected: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.application.id })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const rejected = card.application.status === 'rejected'
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card border border-line p-2.5 ${isDragging ? 'opacity-60 shadow-lg' : ''} ${selected ? 'ring-2 ring-ink/40' : ''} ${rejected ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${card.candidate.full_name}`}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{card.candidate.full_name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <PlacementBadge level={card.readiness} missing={card.missingCredentials} />
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
              Fit {card.fitScore == null ? '—' : card.fitScore}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
            <span className="tnum">{card.daysInStage}d in stage</span>
            {card.candidate.source && <span className="truncate rounded bg-brand-50 px-1.5 py-0.5">{card.candidate.source}</span>}
          </div>
        </div>
        <button
          {...listeners}
          {...attributes}
          aria-label={`Drag ${card.candidate.full_name}`}
          className="shrink-0 cursor-grab rounded p-0.5 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
      </div>
    </div>
  )
}
