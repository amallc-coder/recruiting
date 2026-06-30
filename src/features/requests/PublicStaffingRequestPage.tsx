import { useEffect, useState } from 'react'
import { FilePlus, CheckCircle2 } from 'lucide-react'
import { Button, Card, Input, Select } from '../../components/primitives'
import { submitPublicStaffingRequest, REQUEST_URGENCIES, type Urgency } from '../../lib/v2/requisitionRequests'
import { listRoleFamilies } from '../../lib/v2/requisitions'
import type { RoleFamily } from '../../lib/v2/types'

/**
 * PUBLIC staffing-request page (v2). Renders OUTSIDE the authenticated app shell —
 * facility managers without an ATS login submit a request to fill from a shared
 * link. Submits via the submit_staffing_request SECURITY DEFINER RPC.
 */
export function PublicStaffingRequestPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [facility, setFacility] = useState('')
  const [title, setTitle] = useState('')
  const [roleFamily, setRoleFamily] = useState('')
  const [headcount, setHeadcount] = useState('1')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [targetStart, setTargetStart] = useState('')
  const [reason, setReason] = useState('')
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    listRoleFamilies().then(setRoleFamilies).catch(() => {})
  }, [])

  async function submit() {
    if (!name.trim() || !title.trim()) {
      setError('Please give your name and what you need filled.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error } = await submitPublicStaffingRequest({
      requester_name: name.trim(),
      requester_email: email.trim() || null,
      facility_name: facility.trim() || null,
      title: title.trim(),
      role_family: roleFamily || null,
      headcount: Math.max(1, parseInt(headcount, 10) || 1),
      urgency,
      target_start: targetStart || null,
      reason: reason.trim() || null,
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
            <FilePlus size={26} className="text-sage-600" /> Request staffing
          </h1>
          <p className="text-sm text-muted">
            Need coverage at your facility? Submit a request and the American Medical Administrators recruiting team will open a
            search. No login required.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        {done ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <CheckCircle2 size={40} className="text-sage-600" />
            <h2 className="text-xl font-semibold text-ink">Request submitted</h2>
            <p className="max-w-md text-sm text-muted">
              Thank you. Our recruiting team has your request and will follow up{email.trim() ? ` at ${email.trim()}` : ''} shortly.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDone(false)
                setTitle('')
                setRoleFamily('')
                setHeadcount('1')
                setUrgency('normal')
                setTargetStart('')
                setReason('')
              }}
            >
              Submit another request
            </Button>
          </Card>
        ) : (
          <Card className="space-y-5 p-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">About you</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@facility.com" />
                <Input label="Facility" value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="Facility name" />
              </div>
            </div>
            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">What you need</h3>
              <div className="mt-3 space-y-4">
                <Input label="Role / position" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Night-shift RN, Med/Surg" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Role family (optional)" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Not sure">
                    {roleFamilies.map((rf) => (
                      <option key={rf.code} value={rf.code}>{rf.label}</option>
                    ))}
                  </Select>
                  <Input label="How many openings" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="How urgent" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
                    {REQUEST_URGENCIES.map((u) => (
                      <option key={u} value={u} className="capitalize">{u}</option>
                    ))}
                  </Select>
                  <Input label="Needed by (optional)" type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">Details (optional)</label>
                  <textarea className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shift, unit, why it's needed — census growth, resignation, leave coverage…" />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-rust-700">{error}</p>}
            <Button onClick={submit} loading={submitting} className="w-full">
              Submit request
            </Button>
          </Card>
        )}
      </main>
    </div>
  )
}
