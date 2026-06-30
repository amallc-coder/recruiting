import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardCheck, CheckCircle2, Star } from 'lucide-react'
import { Button, Card } from '../../components/primitives'
import { getReferenceForm, submitReference, type ReferenceFormContext } from '../../lib/v2/references'

/**
 * PUBLIC token-gated reference form (#/reference/:token). No auth — the opaque
 * token is the credential, resolved by the reference_context / submit_reference
 * SECURITY DEFINER RPCs. Minimal candidate exposure (name only).
 */
export function PublicReferencePage() {
  const { token } = useParams()
  const [ctx, setCtx] = useState<ReferenceFormContext | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [rating, setRating] = useState<number | null>(null)
  const [rehire, setRehire] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'submitted' | 'declined' | null>(null)

  useEffect(() => {
    if (!token) return
    getReferenceForm(token).then(setCtx)
  }, [token])

  if (!ctx) return <CenterMsg>Loading…</CenterMsg>
  if (!ctx.ok) return <CenterMsg>{ctx.error || 'This reference link is invalid.'}</CenterMsg>
  if (ctx.status && ctx.status !== 'pending')
    return <CenterMsg>Thank you — this reference has already been submitted.</CenterMsg>

  async function send(declined: boolean) {
    if (!token) return
    setSubmitting(true)
    setError(null)
    const { ok, error } = await submitReference(token, answers, rating, rehire, declined)
    setSubmitting(false)
    if (!ok) {
      setError(error || 'Could not submit. Please try again.')
      return
    }
    setDone(declined ? 'declined' : 'submitted')
  }

  if (done) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 size={40} className="text-sage-600" />
          <h2 className="text-xl font-semibold text-ink">
            {done === 'declined' ? 'Thank you' : 'Reference submitted'}
          </h2>
          <p className="max-w-md text-sm text-muted">
            {done === 'declined'
              ? 'We appreciate your time. No further action is needed.'
              : `Thank you for providing a reference for ${ctx!.candidate_name}. Our team appreciates your time.`}
          </p>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <Card className="space-y-5 p-6">
        <p className="text-sm text-muted">
          {ctx.candidate_name} has listed you as a professional reference for a role with {ctx.org_name}. Your candid
          feedback helps us place the right people in care settings. It takes about 3 minutes.
        </p>

        {(ctx.questions ?? []).map((q) => (
          <div key={q.id}>
            <label className="label">{q.prompt}</label>
            <textarea
              className="input min-h-[70px]"
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          </div>
        ))}

        <div className="border-t border-line pt-4">
          <label className="label">Overall rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`rounded p-1 ${rating != null && n <= rating ? 'text-clay-500' : 'text-line hover:text-muted'}`}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                <Star size={26} fill={rating != null && n <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Would you work with or rehire this person?</label>
          <div className="flex gap-2">
            {[
              { v: true, l: 'Yes' },
              { v: false, l: 'No' },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => setRehire(o.v)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  rehire === o.v ? 'border-ink bg-ink text-paper' : 'border-line text-muted hover:border-ink hover:text-ink'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rust-700">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button onClick={() => send(false)} loading={submitting}>
            Submit reference
          </Button>
          <button onClick={() => send(true)} disabled={submitting} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
            I'd prefer not to provide a reference
          </button>
        </div>
      </Card>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-8 sm:px-6">
          <ClipboardCheck size={24} className="text-sage-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Professional reference</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Card className="p-10 text-center text-sm text-muted">{children}</Card>
    </Shell>
  )
}
