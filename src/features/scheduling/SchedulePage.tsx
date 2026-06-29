import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, MapPin } from 'lucide-react'
import { scheduleContext, bookSlot, type ScheduleContext, type ScheduleSlotOption } from '../../lib/v2/slots'

// Public, token-gated interview self-scheduling page (#/schedule/:token). No
// auth — the opaque application token is the credential, resolved by the
// schedule_context / book_interview_slot SECURITY DEFINER RPCs.
export function SchedulePage() {
  const { token } = useParams()
  const [ctx, setCtx] = useState<ScheduleContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    if (!token) return
    scheduleContext(token).then((c) => {
      setCtx(c)
      if (c.error) setError(c.error)
      setLoading(false)
    })
  }
  useEffect(load, [token])

  async function pick(slot: ScheduleSlotOption) {
    if (!token) return
    setBookingId(slot.id)
    setError(null)
    const res = await bookSlot(token, slot.id)
    setBookingId(null)
    if (res.error || !res.ok) {
      setError(res.error || 'That time could not be booked. Please try another.')
      load()
      return
    }
    setConfirmedAt(res.scheduled_at ?? slot.starts_at)
    load()
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-brand-600">American Medical Administrators</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Schedule your interview</h1>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !ctx || ctx.error ? (
            <p className="text-sm text-rust-700">{ctx?.error ?? 'This scheduling link is not valid or has expired.'}</p>
          ) : (
            <>
              <p className="text-sm text-ink">
                {ctx.candidate_name ? `Hi ${ctx.candidate_name.split(' ')[0]}, ` : ''}
                pick a time for your{ctx.requisition_title ? ` ${ctx.requisition_title}` : ''} interview
                {ctx.facility ? ` at ${ctx.facility}` : ''}.
              </p>

              {(confirmedAt || ctx.booked) && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-sage-100 bg-sage-50/50 p-3">
                  <CheckCircle2 size={18} className="mt-0.5 text-sage-600" />
                  <div className="text-sm text-ink">
                    <div className="font-medium">You're booked.</div>
                    <div className="text-muted">{fmt(confirmedAt ?? ctx.booked!.starts_at)}</div>
                    <div className="mt-1 text-xs text-muted">Pick another time below to reschedule.</div>
                  </div>
                </div>
              )}

              {error && <p className="mt-3 text-sm text-rust-700">{error}</p>}

              <div className="mt-4 space-y-2">
                {ctx.slots.length === 0 && !ctx.booked && (
                  <p className="text-sm text-muted">No times are available right now — a recruiter will reach out to schedule.</p>
                )}
                {ctx.slots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pick(s)}
                    disabled={!!bookingId}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-60"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-medium text-ink">
                        <CalendarClock size={15} className="text-brand-600" />
                        {fmt(s.starts_at)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span>{s.duration_min} min · {s.type.replace('_', ' ')}</span>
                        {s.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} /> {s.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-brand-600">{bookingId === s.id ? 'Booking…' : 'Select'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted">Powered by Clinilytics · This scheduling link is private to you.</p>
      </div>
    </div>
  )
}
