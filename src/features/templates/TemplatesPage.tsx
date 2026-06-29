import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Mail, MessageSquare, ListOrdered } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  MERGE_FIELDS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CHANNELS,
  type MessageTemplate,
  type SequenceStep,
  type TemplateInput,
  type TemplateCategory,
  type TemplateChannel,
} from '../../lib/v2/templates'

export function TemplatesPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<MessageTemplate | null | undefined>(undefined)

  function load() {
    setLoading(true)
    listTemplates().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }
  useEffect(load, [])

  async function remove(t: MessageTemplate) {
    const { error } = await deleteTemplate(t.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Template removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading templates…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Message templates</h1>
          <p className="mt-1 text-sm text-muted">
            Reusable outreach, nurture, and rejection messages with merge fields — plus multi-step nurture
            sequences.
          </p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => setEdit(null)}>
          New template
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No templates yet" hint="Create reusable messages your team can send to candidates." />
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{t.name}</span>
                    <Badge tone="neutral">{t.category}</Badge>
                    {t.is_sequence ? (
                      <Badge tone="clay">
                        <ListOrdered size={11} className="mr-0.5 inline" /> sequence · {t.steps.length} steps
                      </Badge>
                    ) : (
                      <Badge tone="sage">
                        {t.channel === 'sms' ? <MessageSquare size={11} className="mr-0.5 inline" /> : <Mail size={11} className="mr-0.5 inline" />}
                        {t.channel}
                      </Badge>
                    )}
                  </div>
                  {!t.is_sequence && t.subject && <p className="mt-1 text-xs font-medium text-ink">{t.subject}</p>}
                  <p className="mt-1 line-clamp-2 max-w-2xl whitespace-pre-wrap text-sm text-muted">
                    {t.is_sequence ? t.steps.map((s) => `Day ${s.day_offset}: ${s.body}`).join('  •  ') : t.body}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1">
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(t)}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(t)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {edit !== undefined && (
        <TemplateForm
          existing={edit}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined)
            load()
          }}
        />
      )}
    </div>
  )
}

function TemplateForm({ existing, onClose, onSaved }: { existing: MessageTemplate | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(existing?.name ?? '')
  const [category, setCategory] = useState<TemplateCategory>(existing?.category ?? 'outreach')
  const [channel, setChannel] = useState<TemplateChannel>(existing?.channel ?? 'email')
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [isSequence, setIsSequence] = useState(existing?.is_sequence ?? false)
  const [steps, setSteps] = useState<SequenceStep[]>(existing?.steps ?? [])
  const [saving, setSaving] = useState(false)

  function insertField(f: string) {
    setBody((b) => `${b}${f}`)
  }
  function addStep() {
    setSteps((s) => [...s, { day_offset: s.length === 0 ? 0 : (s[s.length - 1].day_offset || 0) + 3, channel: 'email', subject: '', body: '' }])
  }
  function updateStep(i: number, patch: Partial<SequenceStep>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)))
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!name.trim()) {
      toast({ tone: 'error', title: 'Name is required' })
      return
    }
    if (!isSequence && !body.trim()) {
      toast({ tone: 'error', title: 'Message body is required' })
      return
    }
    if (isSequence && steps.length === 0) {
      toast({ tone: 'error', title: 'Add at least one sequence step' })
      return
    }
    setSaving(true)
    const input: TemplateInput = {
      name: name.trim(),
      category,
      channel,
      subject: subject.trim() || null,
      body: isSequence ? '' : body,
      is_sequence: isSequence,
      steps: isSequence ? steps.map((s) => ({ ...s, body: s.body.trim() })) : [],
    }
    const { error } = existing ? await updateTemplate(existing.id, input) : await createTemplate(input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: existing ? 'Template updated' : 'Template created' })
      onSaved()
    }
  }

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : 'New template'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {existing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. RN initial outreach" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)} options={TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as TemplateChannel)} options={TEMPLATE_CHANNELS.map((c) => ({ value: c, label: c }))} />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isSequence} onChange={(e) => setIsSequence(e.target.checked)} />
          Multi-step nurture sequence
        </label>

        {!isSequence ? (
          <>
            {channel === 'email' && <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />}
            <div>
              <label className="label">Message</label>
              <textarea className="input min-h-[140px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{first_name}}, …" />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {MERGE_FIELDS.map((f) => (
                  <button key={f} type="button" onClick={() => insertField(f)} className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-ink">
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted">Step {i + 1}</span>
                    <label className="text-xs text-muted">
                      Day
                      <input type="number" min={0} value={s.day_offset} onChange={(e) => updateStep(i, { day_offset: Number(e.target.value) })} className="input ml-1 inline-block h-7 w-16 py-0" />
                    </label>
                    <select value={s.channel} onChange={(e) => updateStep(i, { channel: e.target.value as TemplateChannel })} className="input h-7 w-24 py-0 text-xs">
                      {TEMPLATE_CHANNELS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => removeStep(i)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
                <textarea className="input min-h-[64px]" value={s.body} onChange={(e) => updateStep(i, { body: e.target.value })} placeholder={`Day ${s.day_offset} message — Hi {{first_name}}, …`} />
              </div>
            ))}
            <Button size="sm" variant="secondary" leftIcon={<Plus size={13} />} onClick={addStep}>
              Add step
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted">
          Merge fields fill in per candidate when sending. Live send/scheduling reuses your messaging
          channels (SMS today); a scheduled-send engine with reply tracking is on the roadmap.
        </p>
      </div>
    </Modal>
  )
}
