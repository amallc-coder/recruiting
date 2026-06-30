import { useEffect, useState } from 'react'
import { ClipboardCheck, Plus, Link2, Trash2, Sparkles, Star, AlertTriangle } from 'lucide-react'
import { Button, Card, Input, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listReferenceRequests,
  createReferenceRequest,
  deleteReferenceRequest,
  analyzeReference,
  referenceUrl,
  type ReferenceRequest,
  type ReferenceStatus,
} from '../../lib/v2/references'

const STATUS_TONE: Record<ReferenceStatus, string> = {
  pending: 'bg-clay-50 text-clay-600',
  completed: 'bg-sage-100 text-sage-700',
  declined: 'bg-rust-50 text-rust-500',
}
const FLAG_TONE = { info: 'text-muted', concern: 'text-clay-600', red: 'text-rust-600' } as const

export function ReferencesTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ReferenceRequest[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)

  function refresh() {
    listReferenceRequests(candidateId).then(setRows)
  }
  useEffect(refresh, [candidateId])

  async function copy(token: string) {
    const url = referenceUrl(token)
    await navigator.clipboard?.writeText(url)
    toast({ tone: 'success', title: 'Reference link copied', description: 'Send it to the referee.' })
  }

  async function analyze(r: ReferenceRequest) {
    setAnalyzing(r.id)
    const { ok, error } = await analyzeReference(r.id)
    setAnalyzing(null)
    if (!ok) toast({ tone: 'error', title: 'Analysis failed', description: error ?? undefined })
    else refresh()
  }

  async function remove(r: ReferenceRequest) {
    if (!confirm(`Delete the reference request for ${r.referee_name}?`)) return
    setRows((p) => p!.filter((x) => x.id !== r.id))
    await deleteReferenceRequest(r.id)
  }

  if (!rows) return <Spinner label="Loading references…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <ClipboardCheck size={16} className="text-sage-600" /> Reference checks
        </h3>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} className="mr-1.5" /> Request reference
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No references requested" hint="Request a reference and send the referee a private link to fill out." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-ink">
                    {r.referee_name}
                    {r.referee_title ? <span className="font-normal text-muted"> · {r.referee_title}</span> : null}
                  </div>
                  <div className="text-xs text-muted">
                    {r.relationship || 'Reference'}
                    {r.referee_email ? ` · ${r.referee_email}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[r.status]}`}>{r.status}</span>
                  {r.status === 'pending' && (
                    <button onClick={() => copy(r.token)} className="text-muted hover:text-ink" title="Copy reference link">
                      <Link2 size={15} />
                    </button>
                  )}
                  <button onClick={() => remove(r)} className="text-muted hover:text-rust-500" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {r.status === 'completed' && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {r.rating != null && (
                      <span className="flex items-center gap-1 text-ink">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={14} className={n <= r.rating! ? 'text-clay-500' : 'text-line'} fill={n <= r.rating! ? 'currentColor' : 'none'} />
                        ))}
                      </span>
                    )}
                    {r.would_rehire != null && (
                      <span className={r.would_rehire ? 'text-sage-700' : 'text-rust-600'}>
                        {r.would_rehire ? 'Would rehire' : 'Would not rehire'}
                      </span>
                    )}
                  </div>

                  {/* AI summary + flags */}
                  {r.ai_summary ? (
                    <div className="rounded-lg bg-brand-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">AI summary</div>
                      <p className="mt-1 text-sm text-ink">{r.ai_summary}</p>
                      {r.ai_flags && r.ai_flags.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {r.ai_flags.map((f, i) => (
                            <li key={i} className={`flex items-start gap-1.5 text-xs ${FLAG_TONE[f.severity]}`}>
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {f.note}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Button variant="secondary" onClick={() => analyze(r)} loading={analyzing === r.id}>
                      <Sparkles size={15} className="mr-1.5" /> Summarize with AI
                    </Button>
                  )}

                  {/* Raw responses */}
                  {r.responses && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">View full responses</summary>
                      <div className="mt-2 space-y-2">
                        {r.questions.map((q) => (
                          <div key={q.id}>
                            <div className="text-xs font-medium text-muted">{q.prompt}</div>
                            <div className="text-ink">{r.responses?.[q.id] || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {adding && <AddReferenceModal candidateId={candidateId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
    </div>
  )
}

function AddReferenceModal({ candidateId, onClose, onSaved }: { candidateId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [relationship, setRelationship] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setError('Referee name is required.')
      return
    }
    setSaving(true)
    setError(null)
    const { token, error } = await createReferenceRequest({
      candidate_id: candidateId,
      referee_name: name.trim(),
      referee_email: email.trim() || null,
      referee_phone: phone.trim() || null,
      referee_title: title.trim() || null,
      relationship: relationship.trim() || null,
    })
    setSaving(false)
    if (error || !token) {
      setError(error || 'Could not create the reference request.')
      return
    }
    setLink(referenceUrl(token))
  }

  return (
    <Modal
      title="Request a reference"
      onClose={onClose}
      footer={
        link ? (
          <Button onClick={onSaved}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Create link
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">Share this private link with the referee:</p>
          <div className="flex items-center gap-2">
            <input readOnly value={link} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(link)
                toast({ tone: 'success', title: 'Copied' })
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted">The referee fills it out with no login. You'll see their answers here when complete.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Referee name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Their title / role" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DON, Charge Nurse…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Input label="Relationship to candidate" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Direct supervisor, colleague…" />
          {error && <p className="text-sm text-rust-700">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
