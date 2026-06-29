// MatchCard — the recruiter-facing surface of the AI match engine.
//
// Contract: "No black-box scores." The score is always one expand-click away
// from its full rationale + per-item evidence checklist, so a human can see
// exactly why the AI recommended what it did before deciding. The AI never
// acts on the pipeline — Approve/Skip only log a learning signal.
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, AlertTriangle, Check, ThumbsUp } from 'lucide-react'
import { Button, Card, Badge } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner } from '../../components/ui'
import {
  getMatchCard,
  scoreApplication,
  recordFeedback,
  type MatchCardData,
  type ChecklistItem,
  type ChecklistTier,
  type ChecklistStatus,
} from '../../lib/v2/matchCard'

const SCORE_TONE = (score: number): BadgeTone => (score >= 4 ? 'sage' : score === 3 ? 'clay' : 'rust')

const STATUS_TONE: Record<ChecklistStatus, BadgeTone> = {
  met: 'sage',
  partial: 'clay',
  missing: 'rust',
}
const STATUS_LABEL: Record<ChecklistStatus, string> = {
  met: 'Met',
  partial: 'Partial',
  missing: 'Missing',
}

const TIER_ORDER: ChecklistTier[] = ['must_have', 'important', 'nice_to_have']
const TIER_LABEL: Record<ChecklistTier, string> = {
  must_have: 'Must have',
  important: 'Important',
  nice_to_have: 'Nice to have',
}

const REC_TONE: Record<string, BadgeTone> = {
  advance: 'sage',
  hold: 'clay',
  reject: 'rust',
}

export function MatchCard({
  applicationId,
  defaultExpanded = false,
}: {
  applicationId: string
  defaultExpanded?: boolean
}) {
  const [card, setCard] = useState<MatchCardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [feedback, setFeedback] = useState<'approve' | 'skip' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getMatchCard(applicationId)
    setCard(data)
    setLoading(false)
  }, [applicationId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleScore() {
    setScoring(true)
    setError(null)
    const result = await scoreApplication(applicationId)
    if ('error' in result) {
      setError(result.error)
    } else {
      setCard(result)
      setExpanded(true)
      setFeedback(null)
    }
    setScoring(false)
  }

  async function handleFeedback(signal: 'approve' | 'skip') {
    setFeedback(signal)
    await recordFeedback(applicationId, signal)
  }

  if (loading) {
    return (
      <Card className="p-4">
        <Spinner label="Loading match" />
      </Card>
    )
  }

  // Never scored yet — offer to score, keep the explainability promise visible.
  if (!card) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Sparkles className="h-4 w-4 text-sage-600" aria-hidden />
            <span>No AI match yet.</span>
          </div>
          <Button size="sm" onClick={handleScore} loading={scoring} leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
            Score
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-rust-700">{error}</p>}
      </Card>
    )
  }

  const knockoutCount = card.knockouts.length

  return (
    <Card className="overflow-hidden">
      {/* Compact summary — always visible. */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        <Badge tone={SCORE_TONE(card.score)}>{card.score}/5</Badge>
        {card.recommendation && (
          <Badge tone={REC_TONE[card.recommendation] ?? 'neutral'} className="capitalize">
            {card.recommendation}
          </Badge>
        )}
        {knockoutCount > 0 && (
          <Badge tone="rust">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
            {knockoutCount} knockout{knockoutCount > 1 ? 's' : ''}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            rightIcon={expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          >
            {expanded ? 'Hide' : 'Why?'}
          </Button>
        </div>
      </div>

      {/* Expanded — the full, evidence-backed explanation. */}
      {expanded && (
        <div className="space-y-5 border-t border-line px-4 py-4">
          {card.rationale && (
            <section>
              <h4 className="stat-label mb-1">Rationale</h4>
              <p className="text-sm leading-relaxed text-ink">{card.rationale}</p>
            </section>
          )}

          {card.knockouts.length > 0 && (
            <section>
              <h4 className="stat-label mb-1.5 text-rust-700">Knockout flags</h4>
              <ul className="space-y-1.5">
                {card.knockouts.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md bg-rust-50 px-2.5 py-1.5 text-sm text-rust-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{k.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">Flagged for review — never an automatic rejection.</p>
            </section>
          )}

          {card.checklist.length > 0 && (
            <section className="space-y-3">
              <h4 className="stat-label">Requirements</h4>
              {TIER_ORDER.map((tier) => {
                const items = card.checklist.filter((c) => c.tier === tier)
                if (items.length === 0) return null
                return (
                  <div key={tier}>
                    <div className="mb-1 text-xs font-medium text-muted">{TIER_LABEL[tier]}</div>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <ChecklistRow key={i} item={item} />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>
          )}

          {card.parsed && (
            <section className="grid gap-3 sm:grid-cols-2">
              {card.parsed.skills.length > 0 && (
                <div>
                  <h4 className="stat-label mb-1.5">Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {card.parsed.skills.map((s, i) => (
                      <Badge key={i} tone="neutral">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {card.parsed.licenses.length > 0 && (
                <div>
                  <h4 className="stat-label mb-1.5">Licenses</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {card.parsed.licenses.map((l, i) => (
                      <Badge key={i} tone="ink">
                        {l}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {card.parsed.experience && (
                <div className="sm:col-span-2">
                  <h4 className="stat-label mb-1">Experience</h4>
                  <p className="text-sm text-muted">{card.parsed.experience}</p>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Actions — score/re-score + the human-in-the-loop feedback signal. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleScore}
          loading={scoring}
          leftIcon={<Sparkles className="h-3.5 w-3.5" />}
        >
          {scoring ? 'Scoring' : 'Re-score'}
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant={feedback === 'approve' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleFeedback('approve')}
            leftIcon={<ThumbsUp className="h-3.5 w-3.5" />}
          >
            Approve
          </Button>
          <Button
            variant={feedback === 'skip' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleFeedback('skip')}
          >
            Skip
          </Button>
        </div>
        {feedback && (
          <span className="flex w-full items-center gap-1 text-[11px] text-muted">
            <Check className="h-3 w-3 text-sage-600" aria-hidden />
            Feedback recorded.
          </span>
        )}
      </div>

      {error && <p className="px-4 pb-3 text-xs text-rust-700">{error}</p>}
    </Card>
  )
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-line px-2.5 py-1.5">
      <div className="min-w-0">
        <div className="text-sm text-ink">{item.requirement}</div>
        {item.evidence && <div className="mt-0.5 text-xs text-muted">{item.evidence}</div>}
      </div>
      <Badge tone={STATUS_TONE[item.status]} className="shrink-0">
        {STATUS_LABEL[item.status]}
      </Badge>
    </li>
  )
}
