import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Plus, Sparkles, Upload, Pencil, Trash2, Copy, Loader2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listJobTemplates,
  createJobTemplate,
  updateJobTemplate,
  deleteJobTemplate,
  generateJobTemplate,
  extractTemplateFile,
  assembleBody,
  STANDARD_BLANKS,
  type JobTemplate,
  type JobTemplateInput,
  type TemplateBlank,
  type TemplateSource,
} from '../../lib/v2/jobTemplates'
import { listRoleFamilies } from '../../lib/v2/requisitions'
import type { RoleFamily } from '../../lib/v2/types'

const SOURCE_TONE: Record<TemplateSource, 'sage' | 'clay' | 'neutral'> = {
  ai: 'sage',
  upload: 'clay',
  manual: 'neutral',
}
const SOURCE_LABEL: Record<TemplateSource, string> = { ai: 'AI-authored', upload: 'Uploaded', manual: 'Manual' }

export function JobTemplatesPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<JobTemplate[] | null>(null)
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([])
  const [edit, setEdit] = useState<JobTemplate | Partial<JobTemplate> | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  function refresh() {
    listJobTemplates().then(setRows)
  }
  useEffect(() => {
    refresh()
    listRoleFamilies().then(setRoleFamilies)
  }, [])

  const rfLabel = useMemo(() => new Map(roleFamilies.map((r) => [r.code, r.label])), [roleFamilies])
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows ?? []) if (r.category?.trim()) set.add(r.category.trim())
    return [...set].sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (cat && (r.category ?? '') !== cat) return false
      if (!q) return true
      return [r.name, r.category, r.intro, r.body, rfLabel.get(r.role_family ?? '')]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    })
  }, [rows, query, cat, rfLabel])

  if (!rows) return <Spinner label="Loading templates…" />

  const aiCount = rows.filter((r) => r.source === 'ai').length
  const uploadCount = rows.filter((r) => r.source === 'upload').length

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setDrafting(true)
    try {
      const { text, fileType } = await extractTemplateFile(file)
      setEdit({
        name: file.name.replace(/\.[^.]+$/, ''),
        body: text,
        source: 'upload',
        file_name: file.name,
        file_type: fileType,
        blanks: STANDARD_BLANKS,
      })
    } catch (err) {
      toast({ tone: 'error', title: 'Could not read file', description: String(err instanceof Error ? err.message : err) })
    } finally {
      setDrafting(false)
    }
  }

  async function remove(t: JobTemplate) {
    if (!confirm(`Delete the template "${t.name}"?`)) return
    setRows((p) => p!.filter((x) => x.id !== t.id))
    await deleteJobTemplate(t.id)
  }

  function copyBody(t: JobTemplate) {
    const text = t.body?.trim() || assembleBody(t)
    navigator.clipboard?.writeText(text)
    toast({ tone: 'success', title: 'Copied', description: 'Template copied to clipboard.' })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <FileText size={22} className="text-sage-600" /> Job description templates
          </h1>
          <p className="mt-1 text-sm text-muted">
            A reusable library of job ads per role. Draft one with AI, upload an existing PDF/XML ad, or write
            your own — then fill the facility-specific blanks when you post.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.xml,.txt,.md,.html" className="hidden" onChange={onFile} />
          <Button variant="secondary" leftIcon={<Upload size={15} />} onClick={() => fileRef.current?.click()} loading={drafting}>
            Upload ad
          </Button>
          <Button variant="secondary" leftIcon={<Sparkles size={15} />} onClick={() => setAiOpen(true)}>
            AI draft
          </Button>
          <Button leftIcon={<Plus size={15} />} onClick={() => setEdit({ source: 'manual', blanks: STANDARD_BLANKS })}>
            New template
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Templates" value={rows.length} hint="in the library" />
        <StatCard label="AI-authored" value={aiCount} tone={aiCount > 0 ? 'good' : 'default'} />
        <StatCard label="Uploaded" value={uploadCount} />
      </div>

      {(categories.length > 0 || rows.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCat('')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${cat === '' ? 'bg-ink text-paper' : 'bg-brand-50 text-muted hover:text-ink'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${cat === c ? 'bg-ink text-paper' : 'bg-brand-50 text-muted hover:text-ink'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="ml-auto w-full sm:w-64">
            <Input placeholder="Search templates…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No templates yet"
          hint="Use “AI draft” to generate a job ad for a role, or upload an existing PDF/XML ad to start your library."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" hint="Try a different search or category." />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <Badge tone={SOURCE_TONE[t.source]}>{SOURCE_LABEL[t.source]}</Badge>
                  {t.category && <Badge tone="neutral">{t.category}</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {[t.role_family ? rfLabel.get(t.role_family) ?? t.role_family : null, t.file_name]
                    .filter(Boolean)
                    .join(' · ') || 'No role family'}
                </p>
                <p className="mt-1.5 line-clamp-2 text-sm text-ink">
                  {(t.intro?.trim() || t.body?.trim() || assembleBody(t)).slice(0, 260)}
                </p>
                {t.blanks?.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    {t.blanks.length} fill-in{t.blanks.length === 1 ? '' : 's'}: {t.blanks.map((b) => b.label).join(', ')}
                  </p>
                )}
              </div>
              <div className="inline-flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" aria-label="Copy" onClick={() => copyBody(t)}>
                  <Copy size={14} />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(t)}>
                  <Pencil size={14} />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(t)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {aiOpen && (
        <AiDraftModal
          roleFamilies={roleFamilies}
          onClose={() => setAiOpen(false)}
          onDrafted={(draft) => {
            setAiOpen(false)
            setEdit(draft)
          }}
        />
      )}

      {edit && (
        <TemplateEditor
          existing={edit}
          roleFamilies={roleFamilies}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function AiDraftModal({
  roleFamilies,
  onClose,
  onDrafted,
}: {
  roleFamilies: RoleFamily[]
  onClose: () => void
  onDrafted: (draft: Partial<JobTemplate>) => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [roleFamily, setRoleFamily] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)

  async function generate() {
    if (!title.trim()) {
      toast({ tone: 'error', title: 'Enter a role title', description: 'e.g. Nursing Home Administrator' })
      return
    }
    setBusy(true)
    const rfLabel = roleFamilies.find((r) => r.code === roleFamily)?.label ?? null
    const gen = await generateJobTemplate({ title: title.trim(), roleFamilyLabel: rfLabel, category: category.trim() || null })
    setBusy(false)
    if (gen.method === 'local') {
      toast({ tone: 'info', title: 'Drafted a starter template', description: 'AI service offline — generated a structured starting point you can edit.' })
    }
    onDrafted({
      name: title.trim(),
      role_family: roleFamily || null,
      category: category.trim() || null,
      intro: gen.intro,
      responsibilities: gen.responsibilities,
      benefits: gen.benefits,
      requirements: gen.requirements,
      blanks: gen.blanks,
      source: 'ai',
    })
  }

  return (
    <Modal
      title="AI draft a job description"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={generate} loading={busy} leftIcon={busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}>
            Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Role / title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Nursing Home Administrator, Practice Manager" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Role family (optional)" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Select…">
            {roleFamilies.map((rf) => (
              <option key={rf.code} value={rf.code}>
                {rf.label}
              </option>
            ))}
          </Select>
          <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Nursing, Physician Practice" />
        </div>
        <p className="text-xs text-muted">
          Generates an intro, responsibilities, requirements, and benefits with editable
          <span className="font-mono"> {'{{blanks}}'} </span>
          for facility-specific details (facility, city, shift, pay range…). You can edit everything before saving.
        </p>
      </div>
    </Modal>
  )
}

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function TemplateEditor({
  existing,
  roleFamilies,
  onClose,
  onSaved,
}: {
  existing: JobTemplate | Partial<JobTemplate>
  roleFamilies: RoleFamily[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = 'id' in existing && !!existing.id
  const [name, setName] = useState(existing.name ?? '')
  const [roleFamily, setRoleFamily] = useState(existing.role_family ?? '')
  const [category, setCategory] = useState(existing.category ?? '')
  const [intro, setIntro] = useState(existing.intro ?? '')
  const [responsibilities, setResponsibilities] = useState((existing.responsibilities ?? []).join('\n'))
  const [requirements, setRequirements] = useState((existing.requirements ?? []).join('\n'))
  const [benefits, setBenefits] = useState((existing.benefits ?? []).join('\n'))
  const [body, setBody] = useState(existing.body ?? '')
  const [blanks, setBlanks] = useState<TemplateBlank[]>(existing.blanks?.length ? existing.blanks : STANDARD_BLANKS)
  const [saving, setSaving] = useState(false)
  const isUpload = existing.source === 'upload'

  async function save() {
    if (!name.trim()) {
      toast({ tone: 'error', title: 'Name is required' })
      return
    }
    setSaving(true)
    const resp = linesToArray(responsibilities)
    const reqs = linesToArray(requirements)
    const bens = linesToArray(benefits)
    // Keep an assembled body for structured templates; preserve raw text for uploads.
    const assembled = isUpload && body.trim() ? body.trim() : assembleBody({ name, intro, responsibilities: resp, requirements: reqs, benefits: bens })
    const input: JobTemplateInput = {
      name: name.trim(),
      role_family: roleFamily || null,
      category: category.trim() || null,
      intro: intro.trim() || null,
      responsibilities: resp,
      requirements: reqs,
      benefits: bens,
      blanks,
      body: assembled || null,
      source: existing.source ?? 'manual',
      file_name: existing.file_name ?? null,
      file_type: existing.file_type ?? null,
    }
    const { error } = isEdit
      ? await updateJobTemplate((existing as JobTemplate).id, input)
      : (await createJobTemplate(input))
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: isEdit ? 'Template updated' : 'Template saved' })
      onSaved()
    }
  }

  function addBlank() {
    setBlanks((b) => [...b, { key: '', label: '' }])
  }
  function updateBlank(i: number, patch: Partial<TemplateBlank>) {
    setBlanks((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }
  function removeBlank(i: number) {
    setBlanks((b) => b.filter((_, idx) => idx !== i))
  }

  return (
    <Modal
      title={isEdit ? 'Edit template' : 'New template'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {isEdit ? 'Save changes' : 'Save template'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nursing Home Administrator" />
          <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Nursing, Physician Practice" />
        </div>
        <Select label="Role family (optional)" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Select…">
          {roleFamilies.map((rf) => (
            <option key={rf.code} value={rf.code}>
              {rf.label}
            </option>
          ))}
        </Select>

        {isUpload ? (
          <div>
            <label className="label">
              Uploaded text <span className="font-normal text-muted">(from {existing.file_name})</span>
            </label>
            <textarea className="input min-h-[220px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted">Clean this up as needed — it becomes the template body.</p>
          </div>
        ) : (
          <>
            <div>
              <label className="label">Intro</label>
              <textarea className="input min-h-[70px]" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="One inviting paragraph. Use {{facility_name}}, {{city}}… for blanks." />
            </div>
            <div>
              <label className="label">Responsibilities <span className="font-normal text-muted">(one per line)</span></label>
              <textarea className="input min-h-[90px]" value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} />
            </div>
            <div>
              <label className="label">Requirements <span className="font-normal text-muted">(one per line)</span></label>
              <textarea className="input min-h-[70px]" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
            </div>
            <div>
              <label className="label">Benefits <span className="font-normal text-muted">(one per line)</span></label>
              <textarea className="input min-h-[70px]" value={benefits} onChange={(e) => setBenefits(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label className="label">Facility-specific blanks</label>
          <p className="mb-2 text-[11px] text-muted">
            Each blank is a <span className="font-mono">{'{{key}}'}</span> token recruiters fill when posting to a facility.
          </p>
          <div className="space-y-2">
            {blanks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label="Token key" className="font-mono" value={b.key} onChange={(e) => updateBlank(i, { key: e.target.value.replace(/[^\w]/g, '_').toLowerCase() })} placeholder="facility_name" />
                <Input aria-label="Label" value={b.label} onChange={(e) => updateBlank(i, { label: e.target.value })} placeholder="Facility name" />
                <Button variant="ghost" size="sm" aria-label="Remove blank" onClick={() => removeBlank(i)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" className="mt-2" leftIcon={<Plus size={13} />} onClick={addBlank}>
            Add blank
          </Button>
        </div>
      </div>
    </Modal>
  )
}
