import { useMemo, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase, demoMode } from '../lib/supabase'
import { ROLE_LABELS, STAGE_LABELS, type Facility, type Profile } from '../lib/types'
import {
  parseWorkbook, autoMap, mapSheet, isTeamSheet, unpivotTeamSheet,
  type Field, type ParsedSheet, type MappedCandidate,
} from '../lib/importXlsx'

// Tabs in a "Recruitment Team Sheet" that are NOT individual recruiters: the
// truncated rollup ("All Data"), backup/scratch tabs, the pivot "List", and
// empty placeholder tabs. The real per-recruiter tabs are the source of truth.
const NON_RECRUITER_TAB = /^(all data|back ?up|list|new recruiter)/i

const FIELDS: { value: Field; label: string }[] = [
  { value: 'ignore', label: '— ignore —' },
  { value: 'full_name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'facility', label: 'Facility' },
  { value: 'role', label: 'Role / Position' },
  { value: 'stage', label: 'Stage / Status' },
  { value: 'start_date', label: 'Start date' },
  { value: 'state', label: 'State' },
  { value: 'city', label: 'City / Region' },
  { value: 'notes', label: 'Notes' },
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const stripFac = (s: string) =>
  norm(s).replace(/\b(health care center|healthcare center|care center|nursing home|health care|healthcare|center|clinic|snf|stl|bh|assisted living|llc|the)\b/g, '').replace(/\s+/g, ' ').trim()

export function Import() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, Field>>({})
  const [dedup, setDedup] = useState(true)
  const [createRecruiters, setCreateRecruiters] = useState(true)
  const [result, setResult] = useState<{ imported: number; skipped: number; facMatched: number; recruiters: number } | null>(null)

  async function onFile(file: File) {
    setError(null); setResult(null); setBusy(true)
    try {
      const parsed = await parseWorkbook(file)
      if (!parsed.length) { setError('No sheets with data found in that file.'); setBusy(false); return }
      // Build a unified auto-mapping over the union of all headers.
      const union: Record<string, Field> = {}
      for (const s of parsed) {
        const m = autoMap(s.headers)
        for (const h of s.headers) if (!(h in union)) union[h] = m[h]
      }
      setSheets(parsed)
      setMapping(union)
    } catch (e) {
      setError('Could not read that file. Make sure it is an .xlsx or .csv. ' + (e instanceof Error ? e.message : ''))
    }
    setBusy(false)
  }

  // Detect the wide "Recruitment Team Sheet" layout (Candidate N blocks).
  const teamSources = useMemo(
    () => (sheets ?? []).filter((s) => isTeamSheet(s.headers) && s.rows.length > 0 && !NON_RECRUITER_TAB.test(s.name)),
    [sheets],
  )
  const teamMode = teamSources.length > 0

  // All mapped candidates across sheets (live preview as mapping changes).
  // In team mode we unpivot the per-recruiter tabs; otherwise apply the column
  // mapping to flat tabs.
  const mapped: MappedCandidate[] = useMemo(() => {
    if (!sheets) return []
    if (teamMode) return teamSources.flatMap(unpivotTeamSheet)
    return sheets.flatMap((s) => mapSheet(s, mapping))
  }, [sheets, mapping, teamMode, teamSources])

  const allHeaders = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const s of sheets ?? []) for (const h of s.headers) if (!seen.has(h)) { seen.add(h); list.push(h) }
    return list
  }, [sheets])

  const hasName = mapped.length > 0

  async function runImport() {
    if (!sheets) return
    setBusy(true); setError(null)
    try {
      const [{ data: facData }, { data: profData }] = await Promise.all([
        supabase.from('facilities').select('id,name,city,state'),
        supabase.from('profiles').select('id,full_name,role'),
      ])
      const facilities = (facData as Facility[]) ?? []
      const profiles = (profData as Profile[]) ?? []

      // Facility matcher: exact-ish on stripped name, else substring.
      const facMatch = (text: string | null): string | null => {
        if (!text) return null
        const t = stripFac(text)
        if (!t) return null
        let best: Facility | null = null
        for (const f of facilities) {
          const fn = stripFac(f.name)
          if (fn.length < 3) continue
          if (fn === t) return f.id
          if (!best && t.length >= 3 && (fn.includes(t) || t.includes(fn))) best = f
        }
        return best?.id ?? null
      }

      // Recruiter matcher (+ optional create in local mode).
      const recMap = new Map<string, string>()
      for (const p of profiles) if (p.full_name) recMap.set(norm(p.full_name), p.id)
      const newProfiles: Record<string, unknown>[] = []
      const resolveRecruiter = (name: string | null): { id: string | null; text: string | null } => {
        if (!name) return { id: null, text: null }
        const key = norm(name)
        if (recMap.has(key)) return { id: recMap.get(key)!, text: null }
        // fuzzy: last-name contains
        for (const [k, id] of recMap) if (k.includes(key) || key.includes(k)) return { id, text: null }
        if (createRecruiters && demoMode) {
          const id = 'imp-' + key.replace(/\s+/g, '-').slice(0, 24) + '-' + (newProfiles.length + 1)
          recMap.set(key, id)
          newProfiles.push({ id, full_name: name, email: `${key.replace(/\s+/g, '.')}@imported.local`, role: 'recruiter', active: true })
          return { id, text: null }
        }
        return { id: null, text: name }
      }

      // Dedup vs existing.
      // Dedup key: name + email, falling back to facility when there is no
      // email (team-sheet candidates have no contact info).
      const dedupKey = (name: string, email: string | null, facility: string | null) =>
        norm(name) + '|' + norm(email || facility || '')
      const seen = new Set<string>()
      if (dedup) {
        const { data: existing } = await supabase.from('candidates').select('full_name,email')
        for (const c of (existing as { full_name: string; email: string | null }[]) ?? [])
          seen.add(dedupKey(c.full_name, c.email, null))
      }

      let facMatched = 0
      const rows: Record<string, unknown>[] = []
      for (const m of mapped) {
        const key = dedupKey(m.full_name, m.email, m.facilityText)
        if (dedup && seen.has(key)) continue
        seen.add(key)
        const facility_id = facMatch(m.facilityText)
        if (facility_id) facMatched++
        const rec = resolveRecruiter(m.recruiter)
        const noteParts = [
          rec.text && `Recruiter: ${rec.text}`,
          !facility_id && m.facilityText && `Facility (unmatched): ${m.facilityText}`,
          `Imported from "${m.sheet}"`,
        ].filter(Boolean)
        rows.push({
          full_name: m.full_name,
          role: m.role,
          email: m.email,
          phone: m.phone,
          source: 'Import',
          facility_id,
          region: facility_id ? undefined : (m.state || m.city || null),
          recruiter_id: rec.id,
          current_stage: m.current_stage,
          start_date: m.start_date,
          resume_text: `${m.full_name} — ${ROLE_LABELS[m.role]}.${m.facilityText ? ` Target: ${m.facilityText}.` : ''}${m.city || m.state ? ` ${[m.city, m.state].filter(Boolean).join(', ')}.` : ''}`,
          checklist: {},
          notes: noteParts.join(' · '),
        })
      }

      if (newProfiles.length) await supabase.from('profiles').insert(newProfiles)
      if (rows.length) {
        // chunk inserts to stay friendly to storage / network
        for (let i = 0; i < rows.length; i += 200) {
          const { error: insErr } = await supabase.from('candidates').insert(rows.slice(i, i + 200))
          if (insErr) throw new Error(insErr.message)
        }
      }
      setResult({ imported: rows.length, skipped: mapped.length - rows.length, facMatched, recruiters: newProfiles.length })
    } catch (e) {
      setError('Import failed: ' + (e instanceof Error ? e.message : String(e)) +
        (demoMode ? ' (Local mode stores in this browser — very large files can exceed its storage; connect Supabase for big imports.)' : ''))
    }
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Import from Excel</h1>
        <p className="text-sm text-muted">
          Upload a spreadsheet (.xlsx or .csv). It’s parsed right here in your browser — every tab is
          read, columns are auto-detected, and rows import as candidates. One tab per recruiter works:
          the tab name becomes the recruiter.
        </p>
      </div>

      {!sheets && (
        <label className="card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-line p-10 text-center hover:border-brand-300 hover:bg-brand-50/40">
          {busy ? <Loader2 className="animate-spin text-brand-500" /> : <Upload className="text-brand-500" />}
          <div className="text-sm font-medium text-ink">Click to choose a file, or drop it here</div>
          <div className="text-xs text-muted">.xlsx, .xlsm, or .csv — handled entirely in-browser</div>
          <input
            type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          />
        </label>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rust-50 px-4 py-3 text-sm text-rust-500">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="flex items-start gap-2 rounded-lg bg-sage-50 px-4 py-3 text-sm text-sage-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <div>
            Imported <strong>{result.imported}</strong> candidates ({result.facMatched} matched to a facility
            {result.recruiters > 0 && <>, {result.recruiters} new recruiters created</>}).{' '}
            {result.skipped > 0 && <>Skipped {result.skipped} (duplicates or no name).</>}{' '}
            <a href="#/candidates" className="font-semibold underline">View candidates →</a>
          </div>
        </div>
      )}

      {sheets && !result && (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <FileSpreadsheet size={18} className="text-brand-600" />
              <span className="font-medium text-ink">{sheets.length} tab{sheets.length !== 1 ? 's' : ''}</span>
              <span className="text-muted">·</span>
              <span className="text-muted">{mapped.length} candidate rows detected</span>
              <button className="btn-secondary ml-auto py-1" onClick={() => { setSheets(null); setMapping({}) }}>Choose a different file</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sheets.map((s) => (
                <span key={s.name} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-muted">
                  {s.name} <span className="text-muted">{s.rows.length}</span>
                </span>
              ))}
            </div>
          </div>

          {teamMode ? (
            <div className="card p-4">
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sage-600" />
                <div>
                  <span className="font-semibold text-ink">Recruitment Team Sheet detected.</span>{' '}
                  <span className="text-muted">
                    Reading the {teamSources.length} recruiter tab{teamSources.length !== 1 ? 's' : ''} directly —
                    each opening’s candidates (Candidate 1, 2, 3 …) are unpivoted into individual records, with the
                    recruiter, facility, position, and pipeline stage pulled from the Open / Interview / Offer / Hire
                    dates. The rollup “All Data”, backup, and list tabs are skipped to avoid duplicates.
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} /> Skip duplicates (name + facility)</label>
                {demoMode && <label className="flex items-center gap-1.5"><input type="checkbox" checked={createRecruiters} onChange={(e) => setCreateRecruiters(e.target.checked)} /> Create a recruiter for each new name</label>}
              </div>
            </div>
          ) : (
            <div className="card p-4">
              <div className="mb-3 text-sm font-semibold text-ink">Column mapping</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allHeaders.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted" title={h}>{h}</span>
                    <select
                      className="rounded-md border-0 bg-surface py-1 text-xs text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
                      value={mapping[h] ?? 'ignore'}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as Field }))}
                    >
                      {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} /> Skip duplicates (name + email)</label>
                {demoMode && <label className="flex items-center gap-1.5"><input type="checkbox" checked={createRecruiters} onChange={(e) => setCreateRecruiters(e.target.checked)} /> Create a recruiter for each new name</label>}
              </div>
            </div>
          )}

          {hasName ? (
            <div className="card overflow-hidden">
              <div className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">Preview (first 25)</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-paper text-left text-xs text-muted">
                    <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Recruiter</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Start</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {mapped.slice(0, 25).map((m, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium text-ink">{m.full_name}</td>
                        <td className="px-3 py-1.5 text-muted">{ROLE_LABELS[m.role]}</td>
                        <td className="px-3 py-1.5 text-muted">{STAGE_LABELS[m.current_stage]}</td>
                        <td className="px-3 py-1.5 text-muted">{m.recruiter ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted">{m.facilityText ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted">{m.email ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted">{m.start_date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <span className="text-sm text-muted">Ready to import <strong>{mapped.length}</strong> candidates.</span>
                <button className="btn-primary" onClick={runImport} disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Import {mapped.length}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-clay-50 px-4 py-3 text-sm text-clay-600">
              No “Name” column detected. Use the mapping above to point a column at <strong>Name</strong>.
            </div>
          )}
        </>
      )}
    </div>
  )
}
