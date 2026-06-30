import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, Briefcase, MapPin, CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import { Card } from '../../components/primitives'
import { getPortalContext, type PortalContext, type PortalApplication } from '../../lib/v2/portal'

const STAGES = ['applied', 'screen', 'interview', 'offer', 'hired'] as const
const STAGE_LABEL: Record<string, string> = { applied: 'Applied', screen: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired' }

function statusLabel(status: string): { text: string; tone: string } {
  switch (status) {
    case 'hired': return { text: 'Hired', tone: 'bg-sage-500 text-white' }
    case 'rejected': return { text: 'Not moving forward', tone: 'bg-rust-50 text-rust-600' }
    case 'withdrawn': return { text: 'Withdrawn', tone: 'bg-brand-50 text-muted' }
    default: return { text: 'In progress', tone: 'bg-sage-50 text-sage-700' }
  }
}

/**
 * PUBLIC candidate portal (#/portal/:token). Mobile-first, token-gated (the
 * application schedule_token). Shows the candidate their application status +
 * lets them self-schedule and browse more roles. No login.
 */
export function PublicPortalPage() {
  const { token } = useParams()
  const [ctx, setCtx] = useState<PortalContext | null>(null)

  useEffect(() => {
    if (token) getPortalContext(token).then(setCtx)
  }, [token])

  const base = import.meta.env.BASE_URL
  const careersUrl = `${window.location.origin}${base}#/careers`

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 px-4 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white ring-1 ring-line">
            <svg width="22" height="18" viewBox="0 0 24 20" aria-hidden>
              <rect x="3" y="2.5" width="11" height="3.6" rx="1.8" fill="#d2774a" />
              <rect x="3" y="8.2" width="18" height="3.6" rx="1.8" fill="#26221f" />
              <rect x="3" y="13.9" width="14" height="3.6" rx="1.8" fill="#26221f" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">Your applications</h1>
            {ctx?.ok && ctx.candidate_name && <p className="text-xs text-muted">{ctx.candidate_name}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-6">
        {!ctx ? (
          <Card className="p-8 text-center text-sm text-muted">Loading…</Card>
        ) : !ctx.ok ? (
          <Card className="p-8 text-center text-sm text-muted">{ctx.error}</Card>
        ) : (ctx.applications?.length ?? 0) === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">No applications found for this link.</Card>
        ) : (
          <div className="space-y-4">
            {ctx.applications!.map((a) => (
              <AppCard key={a.id} app={a} base={base} />
            ))}
            <a
              href={careersUrl}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink hover:bg-brand-50"
            >
              <Briefcase size={16} /> Browse more open roles <ExternalLink size={13} className="text-muted" />
            </a>
            <p className="px-2 text-center text-xs text-muted">
              Tip: add this page to your home screen for quick access to your status.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function AppCard({ app, base }: { app: PortalApplication; base: string }) {
  const st = statusLabel(app.status)
  const currentIdx = STAGES.indexOf((app.stage ?? 'applied') as (typeof STAGES)[number])
  const stageIdx = app.status === 'hired' ? STAGES.length - 1 : currentIdx < 0 ? 0 : currentIdx
  const scheduleUrl = `${window.location.origin}${base}#/schedule/${app.schedule_token}`
  const active = app.status !== 'rejected' && app.status !== 'withdrawn' && app.status !== 'hired'

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">{app.title || 'Application'}</h2>
          {app.facility && (
            <p className="flex items-center gap-1 text-xs text-muted">
              <MapPin size={12} /> {app.facility}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${st.tone}`}>{st.text}</span>
      </div>

      {/* Stage progress */}
      <ol className="mt-4 flex items-center justify-between">
        {STAGES.map((s, i) => {
          const done = i < stageIdx || app.status === 'hired'
          const current = i === stageIdx && app.status !== 'hired'
          return (
            <li key={s} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : done || current ? 'bg-sage-500' : 'bg-line'}`} />
                {done ? (
                  <CheckCircle2 size={18} className="shrink-0 text-sage-600" />
                ) : (
                  <Circle size={18} className={`shrink-0 ${current ? 'text-sage-600' : 'text-line'}`} fill={current ? '#6e9a6a' : 'none'} />
                )}
                <span className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? 'opacity-0' : i < stageIdx ? 'bg-sage-500' : 'bg-line'}`} />
              </div>
              <span className={`mt-1 text-[10px] ${done || current ? 'font-medium text-ink' : 'text-muted'}`}>{STAGE_LABEL[s]}</span>
            </li>
          )
        })}
      </ol>

      {active && (
        <a
          href={scheduleUrl}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          <CalendarClock size={16} /> Schedule or reschedule
        </a>
      )}
    </Card>
  )
}
