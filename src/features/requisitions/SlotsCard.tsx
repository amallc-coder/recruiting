import { useEffect, useState } from 'react'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, useToast } from '../../components/primitives'
import {
  listSlots,
  createSlot,
  deleteSlot,
  INTERVIEW_TYPES,
  type InterviewSlot,
  type InterviewType,
} from '../../lib/v2/slots'

/**
 * Interview slots a recruiter publishes for candidate self-scheduling. Open
 * slots appear on the candidate's token-gated /schedule page; the AI agents
 * include that link in their outreach. Booking a slot creates an interview.
 */
export function SlotsCard({ requisitionId, facilityId }: { requisitionId: string; facilityId?: string | null }) {
  const { toast } = useToast()
  const [slots, setSlots] = useState<InterviewSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [duration, setDuration] = useState('30')
  const [location, setLocation] = useState('')
  const [type, setType] = useState<InterviewType>('phone_screen')

  function load() {
    listSlots(requisitionId).then((s) => {
      setSlots(s)
      setLoading(false)
    })
  }
  useEffect(load, [requisitionId])

  async function add() {
    if (!startsAt) {
      toast({ tone: 'error', title: 'Pick a date and time' })
      return
    }
    setBusy(true)
    const { error } = await createSlot({
      requisition_id: requisitionId,
      facility_id: facilityId ?? null,
      starts_at: new Date(startsAt).toISOString(),
      duration_min: Math.max(5, parseInt(duration, 10) || 30),
      location: location.trim() || null,
      type,
    })
    setBusy(false)
    if (error) {
      toast({ tone: 'error', title: 'Could not add slot', description: error })
      return
    }
    setStartsAt('')
    setLocation('')
    toast({ tone: 'success', title: 'Slot added' })
    load()
  }

  async function remove(id: string) {
    const { error } = await deleteSlot(id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else load()
  }

  const open = slots.filter((s) => !s.booked_by_application)
  const booked = slots.filter((s) => s.booked_by_application)

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-muted" />
        <h2 className="text-sm font-semibold tracking-tight text-ink">Interview slots</h2>
        <span className="text-xs text-muted">candidates self-schedule from these</span>
      </div>

      {/* Add slot */}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_0.7fr_1fr_1fr_auto] sm:items-end">
        <Input label="Date & time" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <Input label="Minutes" type="number" min={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
        <Input label="Location / link" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Phone, Zoom, address…" />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as InterviewType)} options={INTERVIEW_TYPES} />
        <Button size="sm" leftIcon={<Plus size={14} />} loading={busy} onClick={add}>
          Add
        </Button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-4 space-y-1.5">
          {slots.length === 0 && <p className="text-sm text-muted">No slots yet. Add a few times candidates can book.</p>}
          {open.map((s) => (
            <SlotRow key={s.id} slot={s} onRemove={() => remove(s.id)} />
          ))}
          {booked.length > 0 && (
            <>
              <div className="pt-2 text-xs uppercase tracking-wide text-muted">Booked</div>
              {booked.map((s) => (
                <SlotRow key={s.id} slot={s} booked onRemove={() => remove(s.id)} />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function SlotRow({ slot, booked, onRemove }: { slot: InterviewSlot; booked?: boolean; onRemove: () => void }) {
  const when = new Date(slot.starts_at).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink tnum">{when}</span>
        <span className="text-xs text-muted">{slot.duration_min}m · {slot.type.replace('_', ' ')}</span>
        {slot.location && <span className="text-xs text-muted">· {slot.location}</span>}
        {booked && <Badge tone="sage">Booked</Badge>}
      </div>
      <button onClick={onRemove} aria-label="Remove slot" className="rounded p-1 text-muted hover:bg-rust-50 hover:text-rust-700">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
