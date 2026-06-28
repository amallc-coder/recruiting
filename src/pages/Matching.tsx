import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Save, Search } from 'lucide-react'
import { supabase, selectAll } from '../lib/supabase'
import { rankCandidates, type MatchResult, type MatchInput } from '../lib/match'
import {
  ROLE_LABELS,
  type Candidate,
  type Job,
  type Facility,
} from '../lib/types'
import { EmptyState, RoleBadge, Spinner, StageBadge } from '../components/ui'

export function Matching() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [ranking, setRanking] = useState(false)

  async function load() {
    setLoading(true)
    const [j, f, c] = await Promise.all([
      selectAll('jobs', '*'),
      supabase.from('facilities').select('*'),
      selectAll('candidates', '*'),
    ])
    setJobs((j.data as Job[]) ?? [])
    setFacilities((f.data as Facility[]) ?? [])
    setCandidates((c.data as Candidate[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const facById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities])

  // Open positions = published jobs (those still hiring first).
  const positions = useMemo<Job[]>(() => {
    return jobs
      .filter((j) => j.status === 'published')
      .sort((a, b) => (b.openings_remaining ?? b.openings ?? 1) - (a.openings_remaining ?? a.openings ?? 1) || a.title.localeCompare(b.title))
  }, [jobs])

  const selected = positions.find((j) => j.id === selectedId) ?? null
  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])

  const jobLocation = (j: Job) => j.location || facById.get(j.facility_id ?? '')?.region || ''

  useEffect(() => {
    setResults(null)
    setDescription(selected?.description ?? '')
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDescription() {
    if (!selected) return
    setSavingDesc(true)
    await supabase.from('jobs').update({ description }).eq('id', selected.id)
    setSavingDesc(false)
    load()
  }

  async function runMatch() {
    if (!selected) return
    setRanking(true)
    setResults(null)
    // Build the full role context from the edited description + the job's
    // responsibilities and requirements.
    const fullText = [description, selected.responsibilities, selected.requirements].filter(Boolean).join('\n')
    const input: MatchInput = {
      role: selected.role ?? 'ma',
      description: fullText,
      region: jobLocation(selected),
    }
    // Prefer same-role candidates; if none (or the job has no role), consider everyone.
    let pool = selected.role ? candidates.filter((c) => c.role === selected.role) : candidates
    if (pool.length === 0) pool = candidates
    const res = await rankCandidates(input, pool)
    setResults(res)
    setRanking(false)
  }

  if (loading) return <Spinner label="Loading…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
          <Sparkles size={22} className="text-brand-600" /> AI Matching
        </h1>
        <p className="text-sm text-muted">
          Pick an open position, describe what it needs, and rank candidates by fit.
        </p>
      </div>

      {positions.length === 0 ? (
        <EmptyState
          title="No open positions"
          hint="Publish a job (Jobs → set status to Published) or import your openings to match candidates against them."
        />
      ) : (
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Open position <span className="font-normal text-muted">({positions.length} published)</span></label>
            <select
              className="input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select a position…</option>
              {positions.map((j) => {
                const open = j.openings_remaining ?? j.openings ?? 1
                const loc = jobLocation(j)
                return (
                  <option key={j.id} value={j.id}>
                    {j.title}{j.role ? ` · ${ROLE_LABELS[j.role]}` : ''}{loc ? ` · ${loc}` : ''} (open {open})
                  </option>
                )
              })}
            </select>
          </div>

          {selected && (
            <div>
              <label className="label">Position requirements / verbiage</label>
              <textarea
                className="input min-h-[110px]"
                placeholder="Describe the role: shift/schedule, certifications, setting (SNF/LTC), must-haves, nice-to-haves… The richer this is, the better the match."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={saveDescription} disabled={savingDesc}>
                  <Save size={16} /> {savingDesc ? 'Saving…' : 'Save details'}
                </button>
                <button className="btn-primary" onClick={runMatch} disabled={ranking}>
                  <Search size={16} /> {ranking ? 'Ranking…' : 'Find best matches'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {ranking && <Spinner label="Scoring candidates…" />}

      {results && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">
              Ranked candidates ({results.length})
            </h2>
            {results[0] && (
              <span className="text-xs text-muted">
                {results[0].method === 'ai' ? '✨ Scored by Claude' : 'Scored locally (connect Supabase + Anthropic key for AI scoring)'}
              </span>
            )}
          </div>
          {results.length === 0 ? (
            <EmptyState title="No candidates to rank" hint="Add candidates (with résumé text) to match them here." />
          ) : (
            results.map((r) => {
              const c = candidateById.get(r.candidateId)
              if (!c) return null
              return (
                <div key={r.candidateId} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{c.full_name}</span>
                      <RoleBadge role={c.role} />
                      <StageBadge stage={c.current_stage} />
                    </div>
                    <ScorePill score={r.score} />
                  </div>
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-brand-50">
                      <div
                        className={`h-full rounded-full ${scoreColor(r.score)}`}
                        style={{ width: `${r.score}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted">{r.summary}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {r.strengths.length > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold uppercase tracking-wide text-sage-700">Strengths</div>
                        <ul className="mt-0.5 list-disc pl-4 text-muted">
                          {r.strengths.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {r.gaps.length > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold uppercase tracking-wide text-clay-600">Gaps</div>
                        <ul className="mt-0.5 list-disc pl-4 text-muted">
                          {r.gaps.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-sage-500'
  if (score >= 45) return 'bg-clay-500'
  return 'bg-gray-400'
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 70 ? 'bg-sage-100 text-sage-700' : score >= 45 ? 'bg-clay-100 text-clay-600' : 'bg-brand-50 text-muted'
  return <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone}`}>{score}</span>
}
