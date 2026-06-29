import { useEffect, useState } from 'react'
import { MapPin, Briefcase } from 'lucide-react'
import { Button, Card, Badge, Input, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listPublicRequisitions,
  applyToRequisition,
  salaryLabel,
  type PublicReq,
} from '../../lib/v2/careers'

/**
 * PUBLIC careers page (v2). Renders OUTSIDE the authenticated app shell —
 * anonymous visitors browse open postings and apply via the public-intake RPC.
 */
export function CareersPage() {
  const [reqs, setReqs] = useState<PublicReq[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<PublicReq | null>(null)

  useEffect(() => {
    let active = true
    listPublicRequisitions().then((data) => {
      if (!active) return
      setReqs(data)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-1 px-4 py-8 sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Careers at American Medical Administrators</h1>
          <p className="text-sm text-muted">
            Join our team supporting skilled nursing and long-term care facilities. Browse open roles below.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {loading ? (
          <Spinner label="Loading open roles…" />
        ) : reqs.length === 0 ? (
          <EmptyState title="No open roles right now" hint="Check back soon — new positions are posted regularly." />
        ) : (
          <div className="space-y-3">
            {reqs.map((r) => (
              <Posting key={r.id} req={r} onApply={() => setApplying(r)} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-4 py-5 font-mono text-[11px] tracking-wide text-muted sm:px-6">
          © 2026 American Medical Administrators — we are an equal opportunity employer.
        </div>
      </footer>

      {applying && <ApplyModal req={applying} onClose={() => setApplying(null)} />}
    </div>
  )
}

function Posting({ req, onApply }: { req: PublicReq; onApply: () => void }) {
  const place = [req.facility?.city, req.facility?.state].filter(Boolean).join(', ')
  const salary = salaryLabel(req)
  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{req.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="sage">{req.role_family}</Badge>
          {req.employment_type && <Badge tone="neutral">{req.employment_type}</Badge>}
          {req.workplace && <Badge tone="clay">{req.workplace}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {(req.facility?.name || place) && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} />
              {[req.facility?.name, place].filter(Boolean).join(' · ')}
            </span>
          )}
          {!req.facility?.name && !place && req.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} />
              {req.location}
            </span>
          )}
          {salary && <span className="font-medium text-ink">{salary}</span>}
        </div>
        {req.description && <p className="line-clamp-2 max-w-xl text-sm text-muted">{req.description}</p>}
      </div>
      <div className="shrink-0">
        <Button leftIcon={<Briefcase size={14} />} onClick={onApply}>
          Apply
        </Button>
      </div>
    </Card>
  )
}

function ApplyModal({ req, onClose }: { req: PublicReq; onClose: () => void }) {
  const { toast } = useToast()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const canSubmit = fullName.trim().length > 0 && email.trim().length > 0

  async function submit() {
    if (!canSubmit) {
      toast({ tone: 'error', title: 'Name and email are required' })
      return
    }
    setSubmitting(true)
    const { error } = await applyToRequisition({
      requisitionId: req.id,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      resume_text: resumeText.trim() || undefined,
      intake: { linkedin: linkedin.trim() },
    })
    setSubmitting(false)
    if (error) {
      toast({ tone: 'error', title: 'Could not submit application', description: error })
      return
    }
    toast({ tone: 'success', title: 'Application received', description: `Thanks for applying to ${req.title}.` })
    setDone(true)
  }

  if (done) {
    return (
      <Modal
        title="Application received"
        onClose={onClose}
        footer={
          <Button onClick={onClose}>Close</Button>
        }
      >
        <p className="text-sm text-ink">
          Thanks, we received your application for <strong>{req.title}</strong>. Our recruiting team will be in touch.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title={`Apply — ${req.title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} disabled={!canSubmit} onClick={submit}>
            Submit application
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
        />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        <Input label="LinkedIn" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="URL (optional)" />
        <div>
          <label className="label">Resume / summary</label>
          <textarea
            className="input min-h-[100px]"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume or a short summary (optional)"
          />
        </div>
        <p className="text-[11px] text-muted">
          By applying you consent to us storing your information for recruiting.
        </p>
      </div>
    </Modal>
  )
}
