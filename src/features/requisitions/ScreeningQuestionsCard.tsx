import { useEffect, useState } from 'react'
import { Sparkles, Plus, Trash2, ListChecks } from 'lucide-react'
import { Button, Card, useToast } from '../../components/primitives'
import {
  getRequisitionQuestions,
  setRequisitionQuestions,
  generateScreeningQuestions,
  qid,
  type ScreeningQuestion,
} from '../../lib/v2/screenings'

/**
 * Per-requisition default screening question set. Recruiters curate the
 * questionnaire once per req; it then seeds every screening created for a
 * candidate tied to that req (see NewScreeningModal). Stored in
 * `requisitions.screening_questions` (jsonb).
 */
export function ScreeningQuestionsCard({
  requisitionId,
  roleFamily,
  title,
}: {
  requisitionId: string
  roleFamily: string
  title: string
}) {
  const { toast } = useToast()
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let live = true
    getRequisitionQuestions(requisitionId).then((q) => {
      if (!live) return
      setQuestions(q)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [requisitionId])

  function patch(id: string, field: 'question' | 'competency', val: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: val } : q)))
    setDirty(true)
  }
  function add() {
    setQuestions((prev) => [...prev, { id: qid(), question: '', competency: '' }])
    setDirty(true)
  }
  function remove(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
    setDirty(true)
  }

  async function generate() {
    setGenerating(true)
    try {
      const generated = await generateScreeningQuestions({
        full_name: '',
        role_family: roleFamily,
        requisition_title: title,
      })
      setQuestions(generated)
      setDirty(true)
      toast({ tone: 'success', title: 'Draft questions generated', description: 'Review and save to set the default.' })
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    setBusy(true)
    const { error } = await setRequisitionQuestions(requisitionId, questions)
    setBusy(false)
    if (error) {
      toast({ tone: 'error', title: 'Save failed', description: error })
      return
    }
    setDirty(false)
    toast({ tone: 'success', title: 'Screening questions saved' })
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-muted" />
          <h2 className="text-sm font-semibold tracking-tight text-ink">Screening questions</h2>
          <span className="text-xs text-muted">default questionnaire for this requisition</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Sparkles size={14} />} loading={generating} onClick={generate}>
            Generate with AI
          </Button>
          {dirty && (
            <Button size="sm" loading={busy} onClick={save}>
              Save
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-3 space-y-2">
          {questions.length === 0 && (
            <p className="text-sm text-muted">
              No default questions yet. Add your own or generate a Claude-drafted set seeded from the role.
            </p>
          )}
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-line p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-medium text-muted tnum">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <textarea
                    className="input min-h-[52px]"
                    value={q.question}
                    onChange={(e) => patch(q.id, 'question', e.target.value)}
                    placeholder="Screening question…"
                  />
                  <input
                    className="input"
                    value={q.competency ?? ''}
                    onChange={(e) => patch(q.id, 'competency', e.target.value)}
                    placeholder="Competency / tag (optional) — e.g. Licensure, Availability"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(q.id)}
                  aria-label="Remove question"
                  className="mt-1.5 rounded p-1 text-muted hover:bg-rust-50 hover:text-rust-700"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} onClick={add}>
            Add question
          </Button>
        </div>
      )}
    </Card>
  )
}
