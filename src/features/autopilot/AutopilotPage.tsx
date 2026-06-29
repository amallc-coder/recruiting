import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wand2, Play, Lock, Check, ArrowUpRight, ShieldCheck, AlertCircle } from 'lucide-react'
import { Card, Button } from '../../components/primitives'
import { planAutopilot, executeStep, type AutopilotPlan, type PlanStep, type StepResult } from '../../lib/v2/agent/autopilot'
import { TIER_LABELS, type ActionTier } from '../../lib/v2/agent/policy'

const EXAMPLES = [
  'Get the oldest open requisitions moving',
  'Screen the candidates who have never been screened',
  'Tee up next steps for reqs with applicants but no progress',
]

const TIER_STYLE: Record<ActionTier, { ring: string; chip: string; icon: typeof Play }> = {
  auto: { ring: 'border-sage-200', chip: 'bg-sage-50 text-sage-700', icon: Play },
  approval: { ring: 'border-clay-200', chip: 'bg-clay-50 text-clay-600', icon: ShieldCheck },
  prohibited: { ring: 'border-rust-200', chip: 'bg-rust-50 text-rust-600', icon: Lock },
}

interface StepState {
  running: boolean
  result?: StepResult
}

export function AutopilotPage() {
  const [goal, setGoal] = useState('')
  const [planning, setPlanning] = useState(false)
  const [plan, setPlan] = useState<AutopilotPlan | null>(null)
  const [states, setStates] = useState<Record<number, StepState>>({})
  const [runningAll, setRunningAll] = useState(false)

  async function runPlan(g: string) {
    const goalText = g.trim()
    if (!goalText) return
    setGoal(goalText)
    setPlanning(true)
    setPlan(null)
    setStates({})
    const p = await planAutopilot(goalText)
    setPlan(p)
    setPlanning(false)
  }

  async function run(step: PlanStep, idx: number, approved: boolean) {
    setStates((s) => ({ ...s, [idx]: { running: true } }))
    const result = await executeStep(step, approved)
    setStates((s) => ({ ...s, [idx]: { running: false, result } }))
  }

  async function runAllSafe() {
    if (!plan) return
    setRunningAll(true)
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]
      if (step.tier === 'auto' && step.executable && !states[i]?.result?.ok) {
        await run(step, i, false)
      }
    }
    setRunningAll(false)
  }

  const safeCount = plan?.steps.filter((s) => s.tier === 'auto' && s.executable).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <Wand2 size={22} className="text-sage-600" /> Autopilot
        </h1>
        <p className="mt-1 text-sm text-muted">
          Give Autopilot a goal. It proposes a governed plan: it runs safe steps itself, asks before
          anything outward-facing, and never makes high-stakes decisions (offers, rejections, hires)
          — those stay with you. Every proposal and action is audit-logged.
        </p>
      </div>

      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runPlan(goal)
          }}
        >
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Get the 3 oldest open RN requisitions moving this week"
            rows={2}
            className="input resize-none"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => runPlan(ex)}
                  className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted hover:border-ink/30 hover:text-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button type="submit" loading={planning} leftIcon={<Wand2 size={15} />}>
              Plan
            </Button>
          </div>
        </form>
      </Card>

      {planning && <p className="text-sm text-muted">Assessing the goal and building a plan…</p>}

      {plan && !planning && !plan.ok && <Card className="p-5 text-sm text-rust-600">{plan.error}</Card>}

      {plan && plan.ok && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-ink">Assessment</h2>
            <p className="text-sm text-muted">{plan.assessment || plan.summary}</p>
            {safeCount > 0 && (
              <Button className="mt-4" size="sm" variant="secondary" loading={runningAll} onClick={runAllSafe} leftIcon={<Play size={14} />}>
                Run {safeCount} safe step{safeCount === 1 ? '' : 's'}
              </Button>
            )}
          </Card>

          <div className="space-y-3">
            {plan.steps.map((step, idx) => {
              const st = states[idx]
              const style = TIER_STYLE[step.tier]
              const TierIcon = style.icon
              const done = st?.result
              return (
                <div key={idx} className={`card border ${style.ring} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.chip}`}>
                          <TierIcon size={10} /> {TIER_LABELS[step.tier]}
                        </span>
                        <span className="text-sm font-semibold text-ink">{step.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{step.rationale}</p>
                      {step.target_label && (
                        <p className="mt-0.5 text-xs text-muted">
                          Target: <span className="text-ink">{step.target_label}</span>
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted/80">{step.label} — {step.description}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {step.tier === 'auto' && step.executable && (
                        <Button size="sm" variant="secondary" loading={st?.running} disabled={done?.ok} onClick={() => run(step, idx, false)} leftIcon={<Play size={13} />}>
                          {done?.ok ? 'Done' : 'Run'}
                        </Button>
                      )}
                      {step.tier === 'approval' && step.executable && (
                        <Button size="sm" loading={st?.running} disabled={done?.ok} onClick={() => run(step, idx, true)} leftIcon={<Check size={13} />}>
                          {done?.ok ? 'Done' : 'Approve & run'}
                        </Button>
                      )}
                      {(step.tier === 'prohibited' || !step.executable) && (
                        <Link to={step.link} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-brand-50">
                          Open <ArrowUpRight size={13} />
                        </Link>
                      )}
                    </div>
                  </div>

                  {done && (
                    <div className={`mt-3 flex items-center gap-1.5 border-t pt-2 text-xs ${done.ok ? 'border-sage-100 text-sage-700' : 'border-rust-100 text-rust-600'}`}>
                      {done.ok ? <Check size={13} /> : <AlertCircle size={13} />}
                      <span>{done.message}</span>
                      {done.link && (
                        <Link to={done.link} className="underline underline-offset-2">
                          View
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* governance legend */}
          <Card className="p-4 text-xs text-muted">
            <div className="mb-2 font-semibold uppercase tracking-wide text-ink/70">How Autopilot is governed</div>
            <ul className="space-y-1">
              <li><span className="font-medium text-sage-700">Auto</span> — safe, reversible, internal. Run unattended (still logged).</li>
              <li><span className="font-medium text-clay-600">Needs approval</span> — outward-facing or meaningful. Runs only when you click.</li>
              <li><span className="font-medium text-rust-600">Human only</span> — offers, rejections, hires, pay, deletes. Autopilot never does these.</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
