import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  type CandidateInput,
} from '../../lib/v2/candidates'
import type { Candidate, CandidateStatus } from '../../lib/v2/types'

const STATUSES: CandidateStatus[] = ['new', 'active', 'passive', 'placed', 'do_not_contact', 'archived']

const STATUS_LABELS: Record<CandidateStatus, string> = {
  new: 'New',
  active: 'Active',
  passive: 'Passive',
  placed: 'Placed',
  do_not_contact: 'Do not contact',
  archived: 'Archived',
}

const STATUS_TONE: Record<CandidateStatus, BadgeTone> = {
  new: 'neutral',
  active: 'sage',
  passive: 'clay',
  placed: 'sage',
  do_not_contact: 'rust',
  archived: 'neutral',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
]

export function CandidatesPage() {
  const { toast } = useToast()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CandidateStatus | 'all'>('all')
  const [editing, setEditing] = useState<Candidate | 'new' | null>(null)

  function load() {
    setLoading(true)
    listCandidates({ search, status }).then((rows) => {
      setCandidates(rows)
      setLoading(false)
    })
  }
  useEffect(load, [search, status])

  const stats = useMemo(
    () => ({
      total: candidates.length,
      active: candidates.filter((c) => c.status === 'active').length,
      placed: candidates.filter((c) => c.status === 'placed').length,
    }),
    [candidates],
  )

  async function remove(c: Candidate) {
    const { error } = await deleteCandidate(c.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Candidate removed', description: c.full_name })
      load()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Candidates</h1>
          <p className="mt-1 text-sm text-muted">Your talent pool across every role.</p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
          New candidate
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={stats.total} hint="matching the current filters" />
        <StatCard label="Active" value={stats.active} tone={stats.active > 0 ? 'good' : 'default'} hint="status = active" />
        <StatCard label="Placed" value={stats.placed} tone={stats.placed > 0 ? 'good' : 'default'} hint="status = placed" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            leftIcon={<Search size={16} />}
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as CandidateStatus | 'all')}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading candidates…" />
      ) : candidates.length === 0 ? (
        <EmptyState title="No candidates found" hint="Adjust your filters or add a new candidate." />
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{c.full_name}</span>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                  {c.tags.map((t) => (
                    <Badge key={t} tone="neutral">
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.source && <span>Source: {c.source}</span>}
                </div>
              </div>
              <div className="inline-flex gap-1">
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(c)}>
                  <Pencil size={14} />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(c)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <CandidateForm
          candidate={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function CandidateForm({
  candidate,
  onClose,
  onSaved,
}: {
  candidate: Candidate | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [fullName, setFullName] = useState(candidate?.full_name ?? '')
  const [email, setEmail] = useState(candidate?.email ?? '')
  const [phone, setPhone] = useState(candidate?.phone ?? '')
  const [source, setSource] = useState(candidate?.source ?? '')
  const [status, setStatus] = useState<CandidateStatus>(candidate?.status ?? 'new')
  const [tags, setTags] = useState((candidate?.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!fullName.trim()) {
      toast({ tone: 'error', title: 'Full name is required' })
      return
    }
    setSaving(true)
    const input: CandidateInput = {
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: source.trim() || null,
      status,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }
    const { error } = candidate
      ? await updateCandidate(candidate.id, input)
      : await createCandidate(input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: candidate ? 'Candidate updated' : 'Candidate added' })
      onSaved()
    }
  }

  return (
    <Modal
      title={candidate ? 'Edit candidate' : 'New candidate'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {candidate ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Indeed, referral" />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as CandidateStatus)}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
        </div>
        <Input
          label="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Comma-separated, e.g. RN, night shift, bilingual"
        />
      </div>
    </Modal>
  )
}
