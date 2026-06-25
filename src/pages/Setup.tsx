import { useEffect, useState } from 'react'
import { Database, Loader2, CheckCircle2, AlertTriangle, CloudUpload } from 'lucide-react'
import { supabase, demoMode } from '../lib/supabase'
import { seedCloud, type SeedResult } from '../lib/cloudSeed'

export function Setup() {
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const tables = ['facilities', 'coverage_needs', 'positions', 'candidates', 'profiles']
    const out: Record<string, number | null> = {}
    await Promise.all(tables.map(async (t) => {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
      out[t] = count ?? 0
    }))
    setCounts(out)
  }
  useEffect(() => { if (!demoMode) refresh() }, [])

  async function run() {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await seedCloud((p) => setStep(p.step))
      setResult(r)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false); setStep(null)
  }

  if (demoMode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-ink">Cloud setup</h1>
        <div className="rounded-lg bg-clay-50 px-4 py-3 text-sm text-clay-600">
          You’re in <strong>local mode</strong>. Cloud setup applies to the connected Supabase project —
          sign out of local mode and sign in with your Supabase account to use it.
        </div>
      </div>
    )
  }

  const label: Record<string, string> = {
    facilities: 'Facilities', coverage_needs: 'Open needs', positions: 'Positions', candidates: 'Candidates', profiles: 'Users',
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Cloud setup</h1>
        <p className="text-sm text-muted">Connected to your Supabase project. Load the starter data, then invite your team.</p>
      </div>

      <div className="card flex items-center gap-3 p-4 text-sm">
        <Database size={18} className="text-sage-600" />
        <span className="font-medium text-ink">Connected</span>
        <span className="text-muted">·</span>
        <code className="text-xs text-muted">pcpkhdfgmjrzvwfkcznn.supabase.co</code>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Object.keys(label).map((t) => (
          <div key={t} className="card p-3 text-center">
            <div className="text-2xl font-semibold text-ink">{counts[t] ?? '—'}</div>
            <div className="text-xs text-muted">{label[t]}</div>
          </div>
        ))}
      </div>

      <div className="card space-y-3 p-4">
        <div className="font-medium text-ink">Load starter data</div>
        <p className="text-sm text-muted">
          Seeds the <strong>95 facilities</strong>, the <strong>open requisitions</strong> as coverage needs, and the
          <strong> 160-role position catalog</strong> from the master workbook. Safe to run once — it skips any table
          that already has data. Candidates come from the <a href="#/import" className="underline">Import</a> screen.
        </p>
        <button className="btn-primary w-fit" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
          {busy ? (step ?? 'Working…') : 'Load starter data'}
        </button>

        {result && (
          <div className="flex items-start gap-2 rounded-lg bg-sage-50 px-4 py-3 text-sm text-sage-700">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <div>
              Loaded {result.facilities} facilities, {result.coverage} coverage needs, {result.positions} positions.
              {result.skipped.length > 0 && <> Skipped (already present): {result.skipped.join(', ')}.</>}
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rust-50 px-4 py-3 text-sm text-rust-500">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </div>
    </div>
  )
}
