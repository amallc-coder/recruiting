import { useEffect, useState } from 'react'
import { Sparkles, Plus, Trash2 } from 'lucide-react'
import { Button, Modal, Select, useToast } from '../../components/primitives'
import {
  submitScorecard,
  generateInterviewKit,
  RECOMMENDATIONS,
  type ScorecardRec,
  type ScorecardCriterion,
} from '../../lib/v2/scorecards'

/**
 * Structured interview scorecard. Rate each criterion 1–5, leave a comment, and
 * choose a hire recommendation. Criteria can be auto-drafted into an interview
 * kit from the role. Submitting writes a scorecard (the pipeline's advance gate
 * checks for one).
 */
export function ScorecardModal({
  applicationId,
  candidateName,
  roleContext,
  onClose,
  onSubmitted,
}: {
  applicationId: string
  candidateName?: string
  roleContext?: { title?: string | null; role_family?: string | null; specialty?: string | null }
  onClose: () => void
  onSubmitted: () => void
}) {
  const { toast } = useToast()
  const [criteria, setCriteria] = useState<ScorecardCriterion[]>([])
  const [recommendation, setRecommendation] = useState<ScorecardRec>('yes')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Seed with a default kit immediately; refine with AI in the background.
    generateInterviewKit(roleContext ?? {}).then(setCriteria)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setRating(i: number, rating: number) {
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, rating } : c)))
  }
  function setComment(i: number, comment: string) {
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, comment } : c)))
  }
  function setName(i: number, criterion: string) {
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, criterion } : c)))
  }
  function add() {
    setCriteria((cs) => [...cs, { criterion: '', rating: null, comment: '' }])
  }
  function remove(i: number) {
    setCriteria((cs) => cs.filter((_, j) => j !== i))
  }

  async function regenerate() {
    setGenerating(true)
    const kit = await generateInterviewKit(roleContext ?? {})
    setGenerating(false)
    setCriteria(kit)
  }

  const rated = criteria.filter((c) => c.rating != null)
  const overall = rated.length ? Math.round(rated.reduce((s, c) => s + (c.rating ?? 0), 0) / rated.length) : 0

  async function submit() {
    if (!rated.length) {
      toast({ tone: 'error', title: 'Rate at least one criterion' })
      return
    }
    setSaving(true)
    const { error } = await submitScorecard(applicationId, { recommendation, overall_rating: overall, criteria })
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Could not submit', description: error })
    else {
      toast({ tone: 'success', title: 'Scorecard submitted' })
      onSubmitted()
    }
  }

  return (
    <Modal
      size="lg"
      title={`Interview scorecard${candidateName ? ` — ${candidateName}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted">Overall {overall || '—'}/5</span>
            <Button size="sm" loading={saving} onClick={submit}>
              Submit scorecard
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="w-48">
            <Select
              label="Recommendation"
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value as ScorecardRec)}
              options={RECOMMENDATIONS}
            />
          </div>
          <Button size="sm" variant="secondary" leftIcon={<Sparkles size={14} />} loading={generating} onClick={regenerate}>
            Generate kit with AI
          </Button>
        </div>

        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={c.criterion}
                  onChange={(e) => setName(i, e.target.value)}
                  placeholder="Criterion"
                />
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(i, n)}
                      aria-label={`Rate ${n}`}
                      className={`h-7 w-7 rounded-md border text-sm font-medium ${
                        c.rating === n ? 'border-ink bg-ink text-paper' : 'border-line text-muted hover:border-ink/40'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => remove(i)} aria-label="Remove criterion" className="rounded p-1 text-muted hover:text-rust-700">
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                className="input mt-2"
                value={c.comment}
                onChange={(e) => setComment(i, e.target.value)}
                placeholder="Comment (optional)"
              />
            </div>
          ))}
          <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} onClick={add}>
            Add criterion
          </Button>
        </div>
      </div>
    </Modal>
  )
}
