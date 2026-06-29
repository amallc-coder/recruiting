import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Sparkles, CalendarClock, RotateCcw, MapPin } from 'lucide-react'
import { Button, Card, Badge, Input, Select } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { listRequisitionOptions, type ReqOption } from '../../lib/v2/requisitions'
import {
  runTalentSearch,
  listRediscovery,
  listReEngagement,
  type SearchResult,
  type SearchFilter,
  type ReEngageRow,
} from '../../lib/v2/sourcing'
import type { RankedCandidate } from '../../lib/v2/matching'

type Tab = 'search' | 'rediscover' | 'reengage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'search', label: 'Talent search' },
  { key: 'rediscover', label: 'Rediscover' },
  { key: 'reengage', label: 'Re-engagement' },
]

export function SourcingPage() {
  const [tab, setTab] = useState<Tab>('search')
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sourcing &amp; CRM</h1>
        <p className="mt-1 text-sm text-muted">
          Plain-language talent search, rediscovery for open requisitions, and credential-renewal re-engagement.
        </p>
      </div>

      <div className="flex w-fit rounded-lg border border-line bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'search' && <SearchTab />}
      {tab === 'rediscover' && <RediscoverTab />}
      {tab === 'reengage' && <ReEngageTab />}
    </div>
  )
}

function CandidateRow({
  id,
  name,
  right,
  sub,
  chips,
}: {
  id: string
  name: string
  right?: React.ReactNode
  sub?: React.ReactNode
  chips?: React.ReactNode
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <Link to={`/candidates/${id}`} className="font-medium text-ink hover:underline">
          {name}
        </Link>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
        {chips && <div className="mt-1.5 flex flex-wrap gap-1">{chips}</div>}
      </div>
      {right}
    </Card>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? 'sage' : score >= 40 ? 'clay' : 'neutral'
  return <Badge tone={tone}>{score}% match</Badge>
}

// ---- Talent search (natural language) ----
function SearchTab() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<SearchFilter | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  async function run() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    const { filter: f, results: r, error: e } = await runTalentSearch(query)
    setFilter(f)
    setResults(r)
    setError(e)
    setRan(true)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <Input
              label="Search in plain language"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              leftIcon={<Search size={16} />}
              placeholder="NPs in Texas with an active DEA available within 30 days"
            />
          </div>
          <Button leftIcon={<Sparkles size={15} />} loading={loading} onClick={run}>
            Search
          </Button>
        </div>
        {filter?.summary && (
          <p className="mt-2 text-xs text-muted">
            <span className="font-medium text-ink">Interpreted as:</span> {filter.summary}
          </p>
        )}
        {error && <p className="mt-2 text-sm text-rust-700">{error}</p>}
      </Card>

      {loading ? (
        <Spinner label="Searching the talent pool…" />
      ) : ran && results.length === 0 && !error ? (
        <EmptyState title="No candidates matched" hint="Try a broader query or different credentials." />
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <CandidateRow
              key={r.id}
              id={r.id}
              name={r.full_name}
              right={<ScoreBadge score={r.score} />}
              sub={[r.email, r.phone].filter(Boolean).join(' · ') || r.status}
              chips={
                <>
                  {r.credentials.map((c, i) => (
                    <Badge key={`c${i}`} tone={c.active ? 'sage' : 'neutral'}>
                      {c.type}
                      {c.issuing_state ? ` · ${c.issuing_state}` : ''}
                      {c.active ? ' ✓' : ''}
                    </Badge>
                  ))}
                  {r.matched.map((m, i) => (
                    <Badge key={`m${i}`} tone="clay">
                      {m}
                    </Badge>
                  ))}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Talent rediscovery for a requisition ----
function RediscoverTab() {
  const [reqs, setReqs] = useState<ReqOption[]>([])
  const [reqId, setReqId] = useState('')
  const [loading, setLoading] = useState(false)
  const [ranked, setRanked] = useState<RankedCandidate[]>([])
  const [ran, setRan] = useState(false)

  useEffect(() => {
    listRequisitionOptions().then(setReqs)
  }, [])

  async function run(id: string) {
    setReqId(id)
    setRanked([])
    setRan(false)
    if (!id) return
    setLoading(true)
    const { ranked: r } = await listRediscovery(id)
    setRanked(r)
    setRan(true)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <Select
          label="Requisition"
          value={reqId}
          onChange={(e) => run(e.target.value)}
          options={reqs.map((r) => ({ value: r.id, label: `${r.title} · ${r.role_family}` }))}
          placeholder="Pick a requisition to rediscover past candidates"
        />
        <p className="mt-2 text-xs text-muted">
          Ranks your existing talent pool against this requisition (excluding anyone already in its pipeline), using the
          explainable match engine.
        </p>
      </Card>

      {loading ? (
        <Spinner label="Scoring the talent pool…" />
      ) : ran && ranked.length === 0 ? (
        <EmptyState title="No new matches" hint="Everyone who matches is already in this requisition's pipeline." />
      ) : (
        <div className="space-y-2">
          {ranked.map((r) => (
            <CandidateRow
              key={r.id}
              id={r.id}
              name={r.full_name}
              right={<ScoreBadge score={r.score} />}
              sub={`Status: ${r.status}`}
              chips={r.matched.map((m, i) => (
                <Badge key={i} tone="clay">
                  {m}
                </Badge>
              ))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Re-engagement queue (credential renewals) ----
function ReEngageTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReEngageRow[]>([])

  function load() {
    setLoading(true)
    listReEngagement().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const buckets: { key: 30 | 60 | 90; label: string }[] = [
    { key: 30, label: 'Renewing within 30 days' },
    { key: 60, label: '31–60 days' },
    { key: 90, label: '61–90 days' },
  ]

  if (loading) return <Spinner label="Scanning credential renewals…" />

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {buckets.map((b) => (
          <StatCard key={b.key} label={b.label} value={rows.filter((r) => r.bucket === b.key).length} tone={b.key === 30 ? 'warn' : 'default'} />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <p className="text-sm text-muted">
          Candidates whose license, DEA, or other credential renews within 90 days — reach out to keep them active.
        </p>
        <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={13} />} onClick={load} className="ml-auto">
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing renewing soon" hint="No tracked credentials expire in the next 90 days." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <CandidateRow
              key={r.credential_id}
              id={r.candidate_id}
              name={r.full_name}
              right={
                <Badge tone={r.bucket === 30 ? 'rust' : r.bucket === 60 ? 'clay' : 'neutral'}>
                  <CalendarClock size={12} className="mr-1" aria-hidden />
                  {r.days}d
                </Badge>
              }
              sub={[r.email, r.phone].filter(Boolean).join(' · ')}
              chips={
                <>
                  <Badge tone="neutral">{r.type}</Badge>
                  {r.issuing_state && (
                    <Badge tone="neutral">
                      <MapPin size={11} className="mr-0.5" aria-hidden />
                      {r.issuing_state}
                    </Badge>
                  )}
                  <span className="text-xs text-muted">expires {new Date(r.expiration_date).toLocaleDateString()}</span>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
