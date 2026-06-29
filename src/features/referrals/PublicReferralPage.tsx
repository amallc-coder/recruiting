import { useState } from 'react'
import { Gift, CheckCircle2 } from 'lucide-react'
import { Button, Card, Input } from '../../components/primitives'
import { submitPublicReferral } from '../../lib/v2/referrals'

/**
 * PUBLIC refer-a-friend page (v2). Renders OUTSIDE the authenticated app shell.
 * Anyone with the link can refer a candidate; submits via the submit_referral
 * SECURITY DEFINER RPC. No login, no PII exposure of existing data.
 */
export function PublicReferralPage() {
  const [referrer, setReferrer] = useState('')
  const [referrerEmail, setReferrerEmail] = useState('')
  const [referrerPhone, setReferrerPhone] = useState('')
  const [candidate, setCandidate] = useState('')
  const [candEmail, setCandEmail] = useState('')
  const [candPhone, setCandPhone] = useState('')
  const [role, setRole] = useState('')
  const [relationship, setRelationship] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!referrer.trim() || !candidate.trim()) {
      setError('Please give your name and the name of who you are referring.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error } = await submitPublicReferral({
      referrer_name: referrer.trim(),
      referrer_email: referrerEmail.trim() || null,
      referrer_phone: referrerPhone.trim() || null,
      candidate_name: candidate.trim(),
      candidate_email: candEmail.trim() || null,
      candidate_phone: candPhone.trim() || null,
      role_interest: role.trim() || null,
      relationship: relationship.trim() || null,
      note: note.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-4 py-8 sm:px-6">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-ink">
            <Gift size={26} className="text-sage-600" /> Refer a colleague
          </h1>
          <p className="text-sm text-muted">
            Know a great nurse, aide, or clinician? Refer them to American Medical Administrators. If they're hired, you may be
            eligible for a referral reward.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        {done ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <CheckCircle2 size={40} className="text-sage-600" />
            <h2 className="text-xl font-semibold text-ink">Thank you for your referral!</h2>
            <p className="max-w-md text-sm text-muted">
              Our recruiting team will reach out to {candidate || 'your referral'} soon. We'll keep you posted on their progress.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDone(false)
                setCandidate('')
                setCandEmail('')
                setCandPhone('')
                setRole('')
                setRelationship('')
                setNote('')
              }}
            >
              Refer someone else
            </Button>
          </Card>
        ) : (
          <Card className="space-y-5 p-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">About you</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input label="Your name" value={referrer} onChange={(e) => setReferrer(e.target.value)} />
                <Input label="Your email" value={referrerEmail} onChange={(e) => setReferrerEmail(e.target.value)} />
                <Input label="Your phone" value={referrerPhone} onChange={(e) => setReferrerPhone(e.target.value)} />
                <Input
                  label="Relationship to them"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="Former coworker, friend…"
                />
              </div>
            </div>
            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Who you're referring</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input label="Their name" value={candidate} onChange={(e) => setCandidate(e.target.value)} />
                <Input label="Role they'd be great for" value={role} onChange={(e) => setRole(e.target.value)} placeholder="RN, CNA, LPN…" />
                <Input label="Their email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} />
                <Input label="Their phone" value={candPhone} onChange={(e) => setCandPhone(e.target.value)} />
              </div>
              <div className="mt-4">
                <label className="label">Why they'd be a great fit (optional)</label>
                <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-rust-700">{error}</p>}
            <Button onClick={submit} loading={submitting} className="w-full">
              Submit referral
            </Button>
            <p className="text-center text-xs text-muted">
              By submitting, you confirm the person consents to being contacted about opportunities.
            </p>
          </Card>
        )}
      </main>
    </div>
  )
}
