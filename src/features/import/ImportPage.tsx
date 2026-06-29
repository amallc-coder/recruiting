import { useMemo, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Button, Card, Select, Input, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  parseFile,
  guessMapping,
  importCandidates,
  type ParsedRow,
  type FieldMap,
  type ImportResult,
} from '../../lib/v2/import'

const PREVIEW_ROWS = 8

interface TargetField {
  key: keyof FieldMap
  label: string
  required?: boolean
}

const TARGET_FIELDS: TargetField[] = [
  { key: 'full_name', label: 'Full name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'source', label: 'Source' },
  { key: 'tags', label: 'Tags' },
  { key: 'resume_text', label: 'Résumé / experience' },
  { key: 'notes', label: 'Notes' },
]

export function ImportPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [map, setMap] = useState<FieldMap>({ full_name: '' })
  const [sourceLabel, setSourceLabel] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const hasFile = headers.length > 0

  const headerOptions = useMemo(
    () => headers.map((h) => ({ value: h, label: h })),
    [headers],
  )

  const previewRows = useMemo(() => rows.slice(0, PREVIEW_ROWS), [rows])

  async function onPickFile(file: File) {
    setParsing(true)
    setResult(null)
    try {
      const parsed = await parseFile(file)
      if (!parsed.headers.length || !parsed.rows.length) {
        toast({ tone: 'error', title: 'Nothing to import', description: 'No header row and data rows were found in that file.' })
        return
      }
      setFileName(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMap(guessMapping(parsed.headers))
      setSourceLabel(file.name)
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Could not read file',
        description: err instanceof Error ? err.message : 'Make sure it is a .xlsx, .xls, or .csv file.',
      })
    } finally {
      setParsing(false)
    }
  }

  function reset() {
    setFileName('')
    setHeaders([])
    setRows([])
    setMap({ full_name: '' })
    setSourceLabel('')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function runImport() {
    if (!map.full_name && !map.email) {
      toast({
        tone: 'error',
        title: 'Map a column first',
        description: 'Map Email (to enrich existing candidates) and/or Full name (to create new ones).',
      })
      return
    }
    setImporting(true)
    setResult(null)
    try {
      const res = await importCandidates(rows, map, sourceLabel || fileName)
      if (res.error) {
        toast({ tone: 'error', title: 'Import failed', description: res.error })
      } else {
        setResult(res)
        toast({
          tone: 'success',
          title: 'Import complete',
          description: `${res.updated} updated, ${res.created} created, ${res.skipped} skipped.`,
        })
      }
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Import failed',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Import candidates</h1>
        <p className="mt-1 text-sm text-muted">
          Upload an .xlsx, .xls, or .csv file — parsed in your browser. Map the columns, preview, and
          import. Rows whose <strong>email matches an existing candidate</strong> update that record
          (e.g. add résumé text) — so this is also how you backfill résumés onto the current talent
          pool. Rows with a new email create a new candidate.
        </p>
      </div>

      {/* Step 1 — file upload */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <FileSpreadsheet size={18} className="shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink">{hasFile ? fileName : 'Choose a spreadsheet'}</div>
            <div className="text-xs text-muted">
              {hasFile ? `${rows.length} data row${rows.length === 1 ? '' : 's'} · ${headers.length} columns` : '.xlsx, .xls, or .csv — handled entirely in-browser'}
            </div>
          </div>
          <label className="inline-flex">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPickFile(f)
              }}
            />
            <span className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-paper transition-colors hover:bg-brand-500">
              <Upload size={15} />
              {hasFile ? 'Choose another' : 'Choose file'}
            </span>
          </label>
          {hasFile && (
            <Button variant="secondary" onClick={reset}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {parsing && <Spinner label="Parsing file…" />}

      {result && (
        <Card className="flex items-start gap-3 p-5">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-sage-600" />
          <div className="text-sm">
            <div className="font-medium text-ink">Import complete</div>
            <div className="mt-0.5 text-muted">
              <strong className="text-ink">{result.updated}</strong> existing candidate{result.updated === 1 ? '' : 's'} enriched
              {' · '}
              <strong className="text-ink">{result.created}</strong> new created
              {result.skipped > 0 && (
                <>
                  {' · '}
                  <strong className="text-ink">{result.skipped}</strong> skipped
                </>
              )}
              .
            </div>
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={reset}>
                Import another file
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Steps 2 & 3 — mapping + preview */}
      {hasFile && !parsing && !result && (
        <>
          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold tracking-tight text-ink">Map columns</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TARGET_FIELDS.map((field) => (
                <Select
                  key={field.key}
                  label={field.required ? `${field.label} *` : field.label}
                  value={map[field.key] ?? ''}
                  onChange={(e) =>
                    setMap((m) => ({ ...m, [field.key]: e.target.value || undefined }))
                  }
                  options={headerOptions}
                  placeholder={field.required ? 'Select a column' : '— none —'}
                />
              ))}
              <Input
                label="Source label"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="e.g. Indeed export"
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">
                Preview (first {Math.min(PREVIEW_ROWS, rows.length)} of {rows.length})
              </div>
            </div>
            {map.full_name || map.email ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-5 py-2 font-medium">Full name</th>
                      <th className="px-5 py-2 font-medium">Email</th>
                      <th className="px-5 py-2 font-medium">Phone</th>
                      <th className="px-5 py-2 font-medium">Source</th>
                      <th className="px-5 py-2 font-medium">Tags</th>
                      <th className="px-5 py-2 font-medium">Résumé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const cell = (key?: string) => (key ? (row[key] ?? '').trim() : '')
                      const resume = cell(map.resume_text)
                      return (
                        <tr key={i} className="border-b border-line/60">
                          <td className="px-5 py-2 font-medium text-ink">{cell(map.full_name) || '—'}</td>
                          <td className="px-5 py-2 text-muted">{cell(map.email) || '—'}</td>
                          <td className="px-5 py-2 text-muted">{cell(map.phone) || '—'}</td>
                          <td className="px-5 py-2 text-muted">{cell(map.source) || sourceLabel || '—'}</td>
                          <td className="px-5 py-2 text-muted">{cell(map.tags) || '—'}</td>
                          <td className="max-w-[16rem] truncate px-5 py-2 text-muted" title={resume}>
                            {resume || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Map Email or Full name" hint="Map Email to enrich existing candidates, and/or Full name to create new ones." />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
              <span className="text-sm text-muted">
                Ready to import <strong className="text-ink">{rows.length}</strong> row{rows.length === 1 ? '' : 's'}.
              </span>
              <Button
                leftIcon={<Upload size={15} />}
                loading={importing}
                disabled={!map.full_name && !map.email}
                onClick={runImport}
              >
                Import {rows.length} row{rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
