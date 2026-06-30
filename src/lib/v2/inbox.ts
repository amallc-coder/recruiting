// Unified conversation inbox — one thread per candidate, aggregating every
// channel (SMS, email, voice transcripts) that already lands in the
// `communications` table. Read view + log-an-outbound-message + an optional AI
// thread summary (ai-thread edge function). Org-scoped via the communications
// RLS (candidate → org).
import { v2, fetchAll } from './client'
import { demoMode } from '../supabase'
import type { CommChannel, CommDirection } from './candidateProfile'

export interface InboxMessage {
  id: string
  candidate_id: string
  channel: CommChannel
  direction: CommDirection
  subject: string | null
  body: string | null
  transcript: string | null
  sentiment: string | null
  occurred_at: string
  ai_generated: boolean
}

export interface InboxThread {
  candidate_id: string
  candidate_name: string
  email: string | null
  phone: string | null
  last_at: string
  last_snippet: string
  last_direction: CommDirection
  count: number
  channels: CommChannel[]
  inbound_last: boolean
}

interface CandRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
}

const MSG_COLS = 'id,candidate_id,channel,direction,subject,body,transcript,sentiment,occurred_at,ai_generated'

function snippet(m: { body: string | null; transcript: string | null; subject: string | null }): string {
  const s = (m.body || m.transcript || m.subject || '').replace(/\s+/g, ' ').trim()
  return s.length > 90 ? s.slice(0, 90) + '…' : s
}

/** Build the thread list: every candidate with ≥1 communication, newest first. */
export async function listThreads(): Promise<InboxThread[]> {
  const [msgs, cands] = await Promise.all([
    fetchAll<InboxMessage>('communications', MSG_COLS),
    fetchAll<CandRow>('candidates', 'id,full_name,email,phone'),
  ])
  const candById = new Map(cands.map((c) => [c.id, c]))
  const byCand = new Map<string, InboxMessage[]>()
  for (const m of msgs) {
    if (!byCand.has(m.candidate_id)) byCand.set(m.candidate_id, [])
    byCand.get(m.candidate_id)!.push(m)
  }
  const threads: InboxThread[] = []
  for (const [cid, list] of byCand) {
    list.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)) // newest first
    const last = list[0]
    const c = candById.get(cid)
    threads.push({
      candidate_id: cid,
      candidate_name: c?.full_name || 'Unknown candidate',
      email: c?.email ?? null,
      phone: c?.phone ?? null,
      last_at: last.occurred_at,
      last_snippet: snippet(last) || '(no text)',
      last_direction: last.direction,
      count: list.length,
      channels: Array.from(new Set(list.map((m) => m.channel))),
      inbound_last: last.direction === 'inbound',
    })
  }
  return threads.sort((a, b) => (a.last_at < b.last_at ? 1 : -1))
}

/** Full thread for a candidate, oldest → newest for chat display. */
export async function listThreadMessages(candidateId: string): Promise<InboxMessage[]> {
  const { data } = await v2
    .from('communications')
    .select(MSG_COLS)
    .eq('candidate_id', candidateId)
    .order('occurred_at', { ascending: true })
  return (data as InboxMessage[] | null) ?? []
}

/** Record an outbound message (logging/handoff note). Live send for SMS/voice
 *  flows through the screening channel; this captures the message in the thread. */
export async function logMessage(candidateId: string, channel: CommChannel, body: string): Promise<{ error: string | null }> {
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2.from('communications').insert({
    candidate_id: candidateId,
    channel,
    direction: 'outbound',
    body,
    created_by: auth.user?.id ?? null,
  })
  return { error: error?.message ?? null }
}

export interface ThreadSummary {
  summary: string
  next_step: string | null
  sentiment: string | null
}

/** Optional AI summary of a thread (ai-thread edge function). Degrades gracefully. */
export async function summarizeThread(candidateId: string): Promise<{ data: ThreadSummary | null; error: string | null }> {
  if (demoMode) return { data: null, error: 'AI summary is unavailable in local mode.' }
  const { data, error } = await v2.functions.invoke('ai-thread', { body: { candidate_id: candidateId } })
  if (error) return { data: null, error: error.message }
  const res = data as { ok: boolean; error?: string } & ThreadSummary
  if (!res?.ok) return { data: null, error: res?.error ?? 'Summary failed.' }
  return { data: { summary: res.summary, next_step: res.next_step, sentiment: res.sentiment }, error: null }
}
