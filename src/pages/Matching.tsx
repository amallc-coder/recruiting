import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Save, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { rankCandidates, type MatchResult, type MatchInput } from '../lib/match'
import {
  ROLE_LABELS,
  type Candidate,
  type CoverageNeed,
  type Facility,
} from '../lib/types'
import { EmptyState, RoleBadge, Spinner, StageBadge } from '../components/ui'

interface Position {
  need: CoverageNeed
  facility: Facility
}

export function Matching() {
  const [needs, setNeeds] = useState<CoverageNeed[]>([])
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
    const [n, f, c] = await Promise.all([
      supabase.from('coverage_needs').select('*'),
      supabase.from('facilities').select('*'),
      supabase.from('candidates').select('*'),
    ])
    setNeeds((n.data as CoverageNeed[]) ?? [])
    setFacilities((f.data as Facility[]) ?? [])
    setCandidates((c.data as Candidate[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const positions = useMemo<Position[]>(() => {
    const facById = new Map(facilities.map((f) => [f.id, f]))
    return needs
      .filter((n) => n.need_count > 0)
      .map((need) => ({ need, facility: facById.get(need.facility_id)! }))
      .filter((p) => p.facility)
      .sort((a, b) => a.facility.name.localeCompare(b.facility.name))
  }, [needs, facilities])

  const selected = positions.find((p) => p.need.id === selectedId) ?? null
  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])

  useEffect(() => {
    setResults(null)
    setDescription(selected?.need.description ?? '')
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDescription() {
    if (!selected) return
    setSavingDesc(true)
    await supabase.from('coverage_needs').update({ description }).eq('id', selected.need.id)
    setSavingDesc(false)
    load()
  }

  async function runMatch() {
    if (!selected) return
    setRanking(true)
    setResults(null)
    const input: MatchInput = {
      role: selected.need.role,
      description,
      region: selected.facility.region,
    }
    // Prefer same-role candidates; if none, consider everyone.
    let pool = candidates.filter((c) => c.role === selected.need.role)
    if (pool.length === 0) pool = candidates
    const res = await rankCandidates(input, pool)
    setResults(res)
    setRanking(false)
  }

  if (loading) return <Spinner label="Loading…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Sparkles size={22} className="text-brand-600" /> AI Matching
        </h1>
        <p className="text-sm text-gray-500">
          Pick an open position, describe what it needs, and rank candidates by fit.
        </p>
      </div>

      {positions.length === 0 ? (
        <EmptyState
          title="No open positions"
          hint="Set a role's Need to 1 or more on a facility to create a position to match against."
        />
      ) : (
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Open position</label>
            <select
              className="input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select a position…</option>
              {positions.map((p) => (
                <option key={p.need.id} value={p.need.id}>
                  {p.facility.name} — {ROLE_LABELS[p.need.role]} (need {p.need.need_count})
                  {p.facility.region ? ` · ${p.facility.region}` : ''}
                </option>
              ))}
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
            <h2 className="text-sm font-semibold text-gray-700">
              Ranked candidates ({results.length})
            </h2>
            {results[0] && (
              <span className="text-xs text-gray-400">
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
                      <span className="font-medium text-gray-900">{c.full_name}</span>
                      <RoleBadge role={c.role} />
                      <StageBadge stage={c.current_stage} />
                    </div>
                    <ScorePill score={r.score} />
                  </div>
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${scoreColor(r.score)}`}
                        style={{ width: `${r.score}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{r.summary}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {r.strengths.length > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold uppercase tracking-wide text-green-700">Strengths</div>
                        <ul className="mt-0.5 list-disc pl-4 text-gray-600">
                          {r.strengths.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {r.gaps.length > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold uppercase tracking-wide text-amber-700">Gaps</div>
                        <ul className="mt-0.5 list-disc pl-4 text-gray-600">
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
  if (score >= 70) return 'bg-green-500'
  if (score >= 45) return 'bg-amber-500'
  return 'bg-gray-400'
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 70 ? 'bg-green-100 text-green-700' : score >= 45 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  return <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone}`}>{score}</span>
}
