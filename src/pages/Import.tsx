import { useEffect, useMemo, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase, demoMode } from '../lib/supabase'
import { ROLE_LABELS, STAGE_LABELS, DEFAULT_COMPANY_ID, type Facility, type Profile } from '../lib/types'
import { slugify } from '../lib/ats'
import { matchRecruiter, type RecruiterMatch } from '../lib/recruiterMatch'
import {
  parseWorkbook, autoMap, mapSheet, isTeamSheet, unpivotTeamSheet, extractTeamSheetJobs, teamSheetRecruiters,
  type Field, type ParsedSheet, type MappedCandidate, type MappedJob,
} from '../lib/importXlsx'

// Tabs in a "Recruitment Team Sheet" that are NOT individual recruiters.
const NON_RECRUITER_TAB = /^(all data|back ?up|list|new recruiter)/i

// Recruiter-mapping sentinel choices (vs. a real profile id).
const PLACEHOLDER = '__placeholder__'
const UNASSIGNED = '__unassigned__'

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
const uid = () => ((crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2))

interface ImportResult {
  imported: number; skipped: number; facMatched: number; jobs: number; linked: number
  assigned: number; placeholders: string[]; unassignedRecruiters: string[]
}

export function Import() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, Field>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [recruiterMap, setRecruiterMap] = useState<Record<string, string>>({})
  const [dedup, setDedup] = useState(true)
  const [importJobs, setImportJobs] = useState(true)
  const [linkOpenings, setLinkOpenings] = useState(true)
  const [result, setResult] = useState<ImportResult | null>(null)

  // Existing users, for recruiter matching.
  useEffect(() => {
    let active = true
    supabase.from('profiles').select('id,full_name,email,role').then(({ data }) => {
      if (active) setProfiles((data as Profile[]) ?? [])
    })
    return () => { active = false }
  }, [])

  async function onFile(file: File) {
    setError(null); setResult(null); setBusy(true)
    try {
      const parsed = await parseWorkbook(file)
      if (!parsed.length) { setError('No sheets with data found in that file.'); setBusy(false); return }
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

  const teamSources = useMemo(
    () => (sheets ?? []).filter((s) => isTeamSheet(s.headers) && s.rows.length > 0 && !NON_RECRUITER_TAB.test(s.name)),
    [sheets],
  )
  const teamMode = teamSources.length > 0

  const mapped: MappedCandidate[] = useMemo(() => {
    if (!sheets) return []
    if (teamMode) return teamSources.flatMap(unpivotTeamSheet)
    return sheets.flatMap((s) => mapSheet(s, mapping))
  }, [sheets, mapping, teamMode, teamSources])

  const teamJobs: MappedJob[] = useMemo(() => {
    if (!sheets || !teamMode) return []
    const seen = new Set<string>()
    const out: MappedJob[] = []
    for (const j of teamSources.flatMap(extractTeamSheetJobs)) {
      const k = norm(j.title) + '|' + norm(j.location || j.facilityText || '')
      if (seen.has(k)) continue
      seen.add(k); out.push(j)
    }
    return out
  }, [sheets, teamMode, teamSources])

  const totalOpenings = useMemo(() => teamJobs.reduce((s, j) => s + j.openings, 0), [teamJobs])

  // Recruiter names from the sheet + their auto-matches to existing users.
  const recruiterNames = useMemo(() => (teamMode ? teamSheetRecruiters(teamSources) : []), [teamMode, teamSources])
  const autoMatches = useMemo(() => {
    const m: Record<string, RecruiterMatch | null> = {}
    for (const n of recruiterNames) m[n] = matchRecruiter(n, profiles)
    return m
  }, [recruiterNames, profiles])

  // Seed the mapping: auto-matched users, else a placeholder by default.
  useEffect(() => {
    if (!recruiterNames.length) return
    setRecruiterMap((prev) => {
      const next = { ...prev }
      for (const n of recruiterNames) if (next[n] === undefined) next[n] = autoMatches[n]?.id ?? PLACEHOLDER
      return next
    })
  }, [recruiterNames, autoMatches])

  const recCounts = useMemo(() => {
    let matched = 0, ph = 0, un = 0
    for (const n of recruiterNames) {
      const v = recruiterMap[n]
      if (v === PLACEHOLDER) ph++
      else if (!v || v === UNASSIGNED) un++
      else matched++
    }
    return { matched, ph, un }
  }, [recruiterNames, recruiterMap])

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
        supabase.from('profiles').select('id,full_name,email,role'),
      ])
      const facilities = (facData as Facility[]) ?? []
      const allProfiles = (profData as Profile[]) ?? []

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

      // ---- Resolve recruiters from the mapping (creating placeholders) ----
      const resolvedRec = new Map<string, string | null>()
      const placeholders: string[] = []
      const unassignedRec: string[] = []
      const localPlaceholders: Record<string, unknown>[] = []
      const f = (supabase as unknown as { functions?: { invoke: (n: string, o: { body: unknown }) => Promise<{ data: { id?: string } | null; error: unknown }> } }).functions
      for (const name of recruiterNames) {
        const choice = recruiterMap[name] ?? UNASSIGNED
        if (choice === UNASSIGNED) { resolvedRec.set(name, null); unassignedRec.push(name); continue }
        if (choice === PLACEHOLDER) {
          if (demoMode) {
            const id = uid()
            localPlaceholders.push({ id, full_name: name, email: null, role: 'recruiter', active: true, placeholder: true })
            resolvedRec.set(name, id); placeholders.push(name)
          } else if (f?.invoke) {
            const { data, error: fErr } = await f.invoke('recruiter-upsert', { body: { full_name: name } })
            if (!fErr && data?.id) { resolvedRec.set(name, data.id); placeholders.push(name) }
            else { resolvedRec.set(name, null); unassignedRec.push(name) }
          } else { resolvedRec.set(name, null); unassignedRec.push(name) }
          continue
        }
        resolvedRec.set(name, choice)
      }
      if (localPlaceholders.length) await supabase.from('profiles').insert(localPlaceholders)

      const recId = (name: string | null): string | null => {
        if (!name) return null
        if (resolvedRec.has(name)) return resolvedRec.get(name)!
        return matchRecruiter(name, allProfiles)?.id ?? null
      }

      // ---- Candidates ----
      const dedupKey = (name: string, email: string | null, facility: string | null) =>
        norm(name) + '|' + norm(email || facility || '')
      const seen = new Set<string>()
      if (dedup) {
        const { data: existing } = await supabase.from('candidates').select('full_name,email')
        for (const c of (existing as { full_name: string; email: string | null }[]) ?? [])
          seen.add(dedupKey(c.full_name, c.email, null))
      }

      let facMatched = 0, assigned = 0
      const rows: Record<string, unknown>[] = []
      const candMeta: { id: string; key: string; full_name: string; email: string | null; phone: string | null; stage: string }[] = []
      for (const m of mapped) {
        const dk = dedupKey(m.full_name, m.email, m.facilityText)
        if (dedup && seen.has(dk)) continue
        seen.add(dk)
        const facility_id = facMatch(m.facilityText)
        if (facility_id) facMatched++
        const recruiter_id = recId(m.recruiter)
        if (recruiter_id) assigned++
        const id = uid()
        rows.push({
          id,
          full_name: m.full_name,
          role: m.role,
          email: m.email,
          phone: m.phone,
          source: 'Import',
          facility_id,
          region: facility_id ? undefined : (m.state || m.city || null),
          recruiter_id,
          current_stage: m.current_stage,
          start_date: m.start_date,
          resume_text: `${m.full_name} — ${ROLE_LABELS[m.role]}.${m.facilityText ? ` Target: ${m.facilityText}.` : ''}${m.city || m.state ? ` ${[m.city, m.state].filter(Boolean).join(', ')}.` : ''}`,
          checklist: {},
          notes: [!facility_id && m.facilityText && `Facility (unmatched): ${m.facilityText}`, `Imported from "${m.sheet}"`].filter(Boolean).join(' · '),
        })
        if (teamMode && m.position) {
          const loc = (m.city || m.state || '').trim()
          candMeta.push({ id, key: norm(m.position) + '|' + norm(loc || m.facilityText || ''), full_name: m.full_name, email: m.email, phone: m.phone, stage: m.current_stage })
        }
      }

      // ---- Openings -> Jobs, and a key->id index for linking ----
      const jobRows: Record<string, unknown>[] = []
      const jobKeyToId = new Map<string, string>()
      if (teamMode) {
        const { data: existingJobs } = await supabase.from('jobs').select('id,title,location')
        const jseen = new Set<string>()
        for (const ej of (existingJobs as { id: string; title: string; location: string | null }[]) ?? []) {
          const k = norm(ej.title) + '|' + norm(ej.location ?? '')
          jseen.add(k); if (!jobKeyToId.has(k)) jobKeyToId.set(k, ej.id)
        }
        if (importJobs) {
          for (const j of teamJobs) {
            const k = norm(j.title) + '|' + norm(j.location || j.facilityText || '')
            if (jseen.has(k)) continue
            jseen.add(k)
            const id = uid()
            jobKeyToId.set(k, id)
            jobRows.push({
              id,
              company_id: DEFAULT_COMPANY_ID,
              title: j.title,
              department: j.department,
              location: j.location,
              employment_type: 'full_time',
              workplace: 'onsite',
              role: j.role,
              facility_id: facMatch(j.facilityText),
              assigned_recruiter_id: recId(j.recruiter),
              status: j.status,
              visibility: 'public',
              openings: j.openings,
              openings_remaining: j.openings_remaining,
              open_date: j.open_date,
              close_date: j.close_date,
              slug: slugify(j.title) + '-' + Math.random().toString(36).slice(2, 6),
            })
          }
        }
      }

      // ---- Insert candidates, then jobs (resilient to a pre-migration DB) ----
      for (let i = 0; i < rows.length; i += 200) {
        const { error: insErr } = await supabase.from('candidates').insert(rows.slice(i, i + 200))
        if (insErr) throw new Error(insErr.message)
      }
      if (jobRows.length) {
        const strip = (r: Record<string, unknown>) => { const c = { ...r }; delete c.openings; delete c.openings_remaining; return c }
        let drop = false
        for (let i = 0; i < jobRows.length; i += 200) {
          const batch = jobRows.slice(i, i + 200).map((r) => (drop ? strip(r) : r))
          let { error: jErr } = await supabase.from('jobs').insert(batch)
          if (jErr && !drop && /openings|schema cache/i.test(jErr.message)) {
            drop = true
            ;({ error: jErr } = await supabase.from('jobs').insert(batch.map(strip)))
          }
          if (jErr) throw new Error(jErr.message)
        }
      }

      // ---- Link each candidate to its opening (applications) ----
      let linked = 0
      if (teamMode && linkOpenings && candMeta.length && jobKeyToId.size) {
        const appRows: Record<string, unknown>[] = []
        for (const c of candMeta) {
          const jid = jobKeyToId.get(c.key)
          if (!jid) continue
          appRows.push({ company_id: DEFAULT_COMPANY_ID, job_id: jid, candidate_id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, source: 'Import', stage: c.stage })
        }
        for (let i = 0; i < appRows.length; i += 200) {
          const { error: aErr } = await supabase.from('applications').insert(appRows.slice(i, i + 200))
          if (aErr) throw new Error(aErr.message)
        }
        linked = appRows.length
      }

      setResult({
        imported: rows.length, skipped: mapped.length - rows.length, facMatched, jobs: jobRows.length,
        linked, assigned, placeholders, unassignedRecruiters: unassignedRec,
      })
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
          Upload a spreadsheet (.xlsx or .csv) — parsed in your browser. Candidates, openings, and
          recruiter assignments are pulled automatically. A Recruitment Team Sheet is detected and
          unpivoted; each row’s candidates, opening, and recruiter are wired together.
        </p>
      </div>

      {!sheets && (
        <label className="card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-line p-10 text-center hover:border-brand-300 hover:bg-brand-50/40">
          {busy ? <Loader2 className="animate-spin text-brand-500" /> : <Upload className="text-brand-500" />}
          <div className="text-sm font-medium text-ink">Click to choose a file, or drop it here</div>
          <div className="text-xs text-muted">.xlsx, .xlsm, or .csv — handled entirely in-browser</div>
          <input type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
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
            Imported <strong>{result.imported}</strong> candidates — <strong>{result.assigned}</strong> assigned to a recruiter,
            {' '}{result.facMatched} matched to a facility
            {result.jobs > 0 && <>, <strong>{result.jobs}</strong> job openings created</>}
            {result.linked > 0 && <>, {result.linked} linked to their opening</>}
            {result.placeholders.length > 0 && <>, {result.placeholders.length} placeholder recruiters created</>}.
            {' '}{result.skipped > 0 && <>Skipped {result.skipped} (duplicates or no name). </>}
            {result.unassignedRecruiters.length > 0 && (
              <div className="mt-1 text-clay-600">
                Unassigned recruiters (create them on the Team screen, then re-import to assign): {result.unassignedRecruiters.join(', ')}
              </div>
            )}
            <div className="mt-1">
              <a href="#/candidates" className="font-semibold underline">View candidates →</a>
              {result.jobs > 0 && <> · <a href="#/jobs" className="font-semibold underline">View jobs →</a></>}
            </div>
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
              <span className="text-muted">{mapped.length} candidates{teamJobs.length > 0 ? ` · ${teamJobs.length} openings` : ''} detected</span>
              <button className="btn-secondary ml-auto py-1" onClick={() => { setSheets(null); setMapping({}); setRecruiterMap({}) }}>Choose a different file</button>
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
                    Reading the {teamSources.length} recruiter tab{teamSources.length !== 1 ? 's' : ''} —
                    candidates are unpivoted with their stage from the Open / Interview / Offer / Hire dates.
                    {teamJobs.length > 0 && <> Each row is also an <strong>opening</strong>: {teamJobs.length} jobs ({totalOpenings} total openings).</>}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} /> Skip duplicate candidates</label>
                {teamJobs.length > 0 && (
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={importJobs} onChange={(e) => setImportJobs(e.target.checked)} /> Create {teamJobs.length} job openings</label>
                )}
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={linkOpenings} onChange={(e) => setLinkOpenings(e.target.checked)} /> Link candidates to their opening</label>
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
                      {FIELDS.map((fl) => <option key={fl.value} value={fl.value}>{fl.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} /> Skip duplicates (name + email)</label>
              </div>
            </div>
          )}

          {teamMode && recruiterNames.length > 0 && (
            <div className="card p-4">
              <div className="mb-1 text-sm font-semibold text-ink">
                Recruiter assignment <span className="font-normal text-muted">· {recCounts.matched} matched · {recCounts.ph} new placeholders · {recCounts.un} unassigned</span>
              </div>
              <p className="mb-3 text-xs text-muted">
                Names from the sheet auto-match existing users (Rob ↔ Robert). Choose a user, create a
                placeholder recruiter (add their email later on the Team screen to give them login access to
                what’s assigned to them), or leave unassigned.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {recruiterNames.map((n) => {
                  const am = autoMatches[n]
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-ink" title={n}>
                        {n}
                        {am && recruiterMap[n] === am.id && (
                          <span className="rounded bg-sage-50 px-1 py-0.5 text-[10px] font-medium text-sage-700">auto {Math.round(am.score * 100)}%</span>
                        )}
                      </span>
                      <select
                        className="w-44 shrink-0 rounded-md border-0 bg-surface py-1 text-xs text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500"
                        value={recruiterMap[n] ?? PLACEHOLDER}
                        onChange={(e) => setRecruiterMap((m) => ({ ...m, [n]: e.target.value }))}
                      >
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                        <option value={PLACEHOLDER}>➕ Create placeholder</option>
                        <option value={UNASSIGNED}>— Unassigned —</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {hasName ? (
            <div className="card overflow-hidden">
              <div className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">Preview (first 25)</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-paper text-left text-xs text-muted">
                    <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Recruiter</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Start</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {mapped.slice(0, 25).map((m, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium text-ink">{m.full_name}</td>
                        <td className="px-3 py-1.5 text-muted">{ROLE_LABELS[m.role]}</td>
                        <td className="px-3 py-1.5 text-muted">{STAGE_LABELS[m.current_stage]}</td>
                        <td className="px-3 py-1.5 text-muted">{m.recruiter ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted">{m.facilityText ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted">{m.position ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted">{m.start_date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <span className="text-sm text-muted">Ready to import <strong>{mapped.length}</strong> candidates{teamJobs.length > 0 && importJobs ? <> + <strong>{teamJobs.length}</strong> openings</> : null}.</span>
                <button className="btn-primary" onClick={runImport} disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Import
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
