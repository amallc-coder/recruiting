import { useEffect, useMemo, useState } from 'react'
import { Sparkles, UserPlus } from 'lucide-react'
import { Button, Card, Badge, Select, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { listOpenRequisitions, matchCandidatesForRequisition, type RankedCandidate } from '../../lib/v2/matching'
import { addApplication, listStages } from '../../lib/v2/pipeline'
import type { RequisitionRow } from '../../lib/v2/types'

const STRONG_SCORE = 60

export function MatchingPage() {
  const { toast } = useToast()
  const [requisitions, setRequisitions] = useState<RequisitionRow[]>([])
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [ranked, setRanked] = useState<RankedCandidate[] | null>(null)
  const [ranking, setRanking] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    listOpenRequisitions()
      .then(setRequisitions)
      .finally(() => setLoadingReqs(false))
  }, [])

  const selected = useMemo(
    () => requisitions.find((r) => r.id === selectedId) ?? null,
    [requisitions, selectedId],
  )

  useEffect(() => {
    if (!selectedId) {
      setRanked(null)
      return
    }
    let cancelled = false
    setRanking(true)
    setRanked(null)
    matchCandidatesForRequisition(selectedId)
      .then((res) => {
        if (!cancelled) setRanked(res.ranked)
      })
      .finally(() => {
        if (!cancelled) setRanking(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const stats = useMemo(() => {
    const list = ranked ?? []
    return {
      count: list.length,
      top: list.reduce((m, c) => Math.max(m, c.score), 0),
      strong: list.filter((c) => c.score >= STRONG_SCORE).length,
    }
  }, [ranked])

  async function addToPipeline(candidate: RankedCandidate) {
    if (!selected) return
    setAdding(candidate.id)
    const stages = await listStages(selected.role_family)
    const firstStageId = stages[0]?.id ?? null
    const { error } = await addApplication(selected.id, candidate.id, firstStageId, selected.org_id)
    setAdding(null)
    if (error) toast({ tone: 'error', title: 'Could not add to pipeline', description: error })
    else toast({ tone: 'success', title: `${candidate.full_name} added to pipeline` })
  }

  const reqOptions = requisitions.map((r) => ({
    value: r.id,
    label: `${r.title} · ${r.role_family}`,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <Sparkles size={22} className="text-sage-600" /> Candidate Matching
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pick an open requisition and rank candidates by how well they fit its requirements.
        </p>
      </div>

      <Card className="p-5">
        {loadingReqs ? (
          <Spinner label="Loading requisitions…" />
        ) : requisitions.length === 0 ? (
          <p className="text-sm text-muted">No open requisitions to match against.</p>
        ) : (
          <Select
            label={`Requisition (${requisitions.length} open)`}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            options={reqOptions}
            placeholder="Select a requisition…"
          />
        )}
      </Card>

      {selectedId && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Candidates ranked" value={stats.count} />
          <StatCard label="Top score" value={stats.top} tone={stats.top >= STRONG_SCORE ? 'good' : 'default'} />
          <StatCard
            label="Strong matches"
            value={stats.strong}
            hint={`score ≥ ${STRONG_SCORE}`}
            tone={stats.strong > 0 ? 'good' : 'default'}
          />
        </div>
      )}

      {ranking && <Spinner label="Scoring candidates…" />}

      {!ranking && !selectedId && (
        <EmptyState
          title="Pick a requisition to rank candidates"
          hint="Choose an open requisition above and we'll score every candidate against it."
        />
      )}

      {!ranking && selectedId && ranked && ranked.length === 0 && (
        <EmptyState
          title="No candidates to rank"
          hint="Add candidates (with résumé or screening text) to match them here."
        />
      )}

      {!ranking && ranked && ranked.length > 0 && (
        <div className="space-y-3">
          {ranked.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{c.full_name}</span>
                  <Badge tone="neutral">{c.status}</Badge>
                  <Badge tone={c.score >= STRONG_SCORE ? 'sage' : 'neutral'}>{c.score}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<UserPlus size={14} />}
                  loading={adding === c.id}
                  onClick={() => addToPipeline(c)}
                >
                  Add to pipeline
                </Button>
              </div>
              {c.matched.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.matched.map((m) => (
                    <span
                      key={m}
                      className="inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-muted"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
