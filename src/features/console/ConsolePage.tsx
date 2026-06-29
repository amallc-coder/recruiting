import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Terminal, CornerDownLeft, Search } from 'lucide-react'
import { Card, Button } from '../../components/primitives'
import { Spinner } from '../../components/ui'
import { askConsole, type ConsoleResult } from '../../lib/v2/agent/console'

const EXAMPLES = [
  'How many open requisitions are there by role family?',
  'Candidates who have never been screened',
  'Offers that were sent but not yet answered',
  'Open RN requisitions in Texas',
  'Screenings completed with an AI score below 60',
]

function fmtCell(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'number') return v.toLocaleString()
  const s = String(v)
  // ISO date → short date
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleDateString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00').toLocaleDateString()
  return s
}

export function ConsolePage() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ConsoleResult | null>(null)

  async function run(q: string) {
    const query = q.trim()
    if (!query) return
    setQuestion(query)
    setLoading(true)
    setResult(null)
    const r = await askConsole(query)
    setResult(r)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <Terminal size={22} className="text-clay-500" /> Command console
        </h1>
        <p className="mt-1 text-sm text-muted">
          Ask about your data in plain language. Answers query the live ATS under your access — it's
          strictly read-only, and every question is logged.
        </p>
      </div>

      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(question)
          }}
        >
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. open RN reqs in Texas with no applicants"
              className="input h-11 pl-9 pr-28"
            />
            <Button type="submit" size="sm" loading={loading} className="absolute right-1.5 top-1/2 -translate-y-1/2">
              Ask <CornerDownLeft size={13} className="ml-1" />
            </Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => run(ex)}
              className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted hover:border-ink/30 hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {loading && <Spinner label="Interpreting…" />}

      {result && !loading && (
        <Card className="p-5">
          {!result.ok ? (
            <p className="text-sm text-rust-600">{result.error}</p>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">{result.answer || 'Results'}</h2>
                <span className="font-mono text-xs text-muted">
                  {result.intent === 'count' ? `${result.total} total` : `${result.rows.length} of ${result.total}`}
                </span>
              </div>
              {result.summary && <p className="mb-4 text-xs text-muted">Interpreted as: {result.summary}</p>}

              {result.intent === 'count' ? (
                <div className="text-4xl font-semibold tracking-tight text-ink tnum">{result.total.toLocaleString()}</div>
              ) : result.rows.length === 0 ? (
                <p className="text-sm text-muted">No matching rows.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        {result.columns.map((c) => (
                          <th key={c.key} className="px-3 py-2 font-medium">
                            {c.label}
                          </th>
                        ))}
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => {
                        const href = result.link?.(row) ?? null
                        return (
                          <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-paper">
                            {result.columns.map((c) => (
                              <td key={c.key} className="px-3 py-2 text-ink">
                                {fmtCell(row[c.key])}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right">
                              {href && (
                                <Link to={href} className="text-xs text-clay-600 underline-offset-2 hover:underline">
                                  Open
                                </Link>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
