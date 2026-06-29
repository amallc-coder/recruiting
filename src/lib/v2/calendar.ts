// Calendar helpers — generate "Add to calendar" links for an event with no
// third-party credentials: a Google Calendar template URL and an inline .ics
// data URL (works with Apple Calendar, Outlook desktop, etc.). Two-way OAuth
// calendar sync (auto-push to a connected Google/Outlook calendar) is a separate
// follow-up that needs provider credentials.

export interface CalEvent {
  title: string
  /** ISO start timestamp. */
  start: string
  durationMin: number
  location?: string | null
  description?: string | null
}

/** UTC compact form: YYYYMMDDTHHMMSSZ. */
function toCalDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function endOf(e: CalEvent): string {
  return new Date(new Date(e.start).getTime() + Math.max(1, e.durationMin) * 60000).toISOString()
}

/** Google Calendar "add event" URL. */
export function googleCalUrl(e: CalEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toCalDate(e.start)}/${toCalDate(endOf(e))}`,
  })
  if (e.location) params.set('location', e.location)
  if (e.description) params.set('details', e.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function esc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

/** Inline .ics data URL (download-as-calendar). */
export function icsDataUrl(e: CalEvent): string {
  const uid = `${toCalDate(e.start)}-${Math.abs(hashCode(e.title))}@clinilytics`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clinilytics//ATS//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toCalDate(new Date().toISOString())}`,
    `DTSTART:${toCalDate(e.start)}`,
    `DTEND:${toCalDate(endOf(e))}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'))
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h | 0
}
