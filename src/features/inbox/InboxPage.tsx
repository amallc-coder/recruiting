import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Phone, Mail, MessageSquare, Send, Sparkles, ArrowUpRight, Search } from 'lucide-react'
import { Button, Card, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listThreads,
  listThreadMessages,
  logMessage,
  summarizeThread,
  type InboxThread,
  type InboxMessage,
  type ThreadSummary,
} from '../../lib/v2/inbox'
import type { CommChannel } from '../../lib/v2/candidateProfile'

const CHANNEL_ICON = { sms: MessageSquare, email: Mail, call: Phone } as const

function fmt(ts: string): string {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    listThreads().then((t) => {
      setThreads(t)
      setActiveId((cur) => cur ?? t[0]?.candidate_id ?? null)
    })
  }, [])

  const filtered = useMemo(() => {
    if (!threads) return []
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter((t) => t.candidate_name.toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q))
  }, [threads, query])

  const active = threads?.find((t) => t.candidate_id === activeId) ?? null

  if (!threads) return <Spinner label="Loading inbox…" />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <Inbox size={22} className="text-sage-600" /> Inbox
        </h1>
        <p className="mt-1 text-sm text-muted">Every conversation with a candidate — SMS, email, and AI voice transcripts — in one thread.</p>
      </div>

      {threads.length === 0 ? (
        <EmptyState title="No conversations yet" hint="Messages and AI screening transcripts will appear here as candidates are contacted." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Thread list */}
          <Card className="flex max-h-[70vh] flex-col overflow-hidden p-0">
            <div className="border-b border-line p-2">
              <div className="flex items-center gap-2 rounded-lg bg-paper px-2 py-1.5">
                <Search size={15} className="text-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" className="w-full bg-transparent text-sm outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.map((t) => {
                const Icon = CHANNEL_ICON[t.channels[0] as keyof typeof CHANNEL_ICON] ?? MessageSquare
                return (
                  <button
                    key={t.candidate_id}
                    onClick={() => setActiveId(t.candidate_id)}
                    className={`flex w-full items-start gap-2 border-b border-line/60 px-3 py-2.5 text-left hover:bg-brand-50 ${activeId === t.candidate_id ? 'bg-brand-50' : ''}`}
                  >
                    <Icon size={15} className="mt-0.5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{t.candidate_name}</span>
                        <span className="shrink-0 text-[11px] text-muted">{fmt(t.last_at)}</span>
                      </div>
                      <div className="flex items-center gap-1 truncate text-xs text-muted">
                        {t.inbound_last ? '' : <span className="text-sage-600">You: </span>}
                        {t.last_snippet}
                      </div>
                    </div>
                    {t.inbound_last && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-clay-500" title="Last message inbound" />}
                  </button>
                )
              })}
              {filtered.length === 0 && <div className="p-4 text-center text-sm text-muted">No matches</div>}
            </div>
          </Card>

          {/* Thread view */}
          {active ? <ThreadView key={active.candidate_id} thread={active} /> : <Card className="p-10 text-center text-sm text-muted">Select a conversation</Card>}
        </div>
      )}
    </div>
  )
}

function ThreadView({ thread }: { thread: InboxThread }) {
  const { toast } = useToast()
  const [msgs, setMsgs] = useState<InboxMessage[] | null>(null)
  const [channel, setChannel] = useState<CommChannel>('sms')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState<ThreadSummary | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  function refresh() {
    listThreadMessages(thread.candidate_id).then(setMsgs)
  }
  useEffect(refresh, [thread.candidate_id])

  async function send() {
    if (!draft.trim()) return
    setSending(true)
    const { error } = await logMessage(thread.candidate_id, channel, draft.trim())
    setSending(false)
    if (error) {
      toast({ tone: 'error', title: 'Could not log message', description: error })
      return
    }
    setDraft('')
    refresh()
  }

  async function summarize() {
    setSummarizing(true)
    const { data, error } = await summarizeThread(thread.candidate_id)
    setSummarizing(false)
    if (error) toast({ tone: 'error', title: 'Summary unavailable', description: error })
    else setSummary(data)
  }

  return (
    <Card className="flex max-h-[70vh] flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <Link to={`/candidates/${thread.candidate_id}`} className="flex items-center gap-1 text-sm font-semibold text-ink hover:underline">
            {thread.candidate_name} <ArrowUpRight size={13} className="text-muted" />
          </Link>
          <div className="truncate text-xs text-muted">{[thread.email, thread.phone].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        <Button variant="secondary" onClick={summarize} loading={summarizing}>
          <Sparkles size={14} className="mr-1.5" /> Summarize
        </Button>
      </div>

      {summary && (
        <div className="border-b border-line bg-brand-50 px-4 py-2.5 text-sm">
          <p className="text-ink">{summary.summary}</p>
          {summary.next_step && <p className="mt-1 text-xs text-muted"><span className="font-medium">Next:</span> {summary.next_step}</p>}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {!msgs ? (
          <Spinner label="Loading…" />
        ) : (
          msgs.map((m) => {
            const out = m.direction === 'outbound'
            const Icon = CHANNEL_ICON[m.channel] ?? MessageSquare
            return (
              <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-ink text-paper' : 'bg-paper text-ink ring-1 ring-line'}`}>
                  <div className={`mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide ${out ? 'text-paper/70' : 'text-muted'}`}>
                    <Icon size={10} /> {m.channel}
                    {m.ai_generated ? ' · AI' : ''}
                    <span className="ml-1">{fmt(m.occurred_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{m.body || m.transcript || m.subject || '(no text)'}</div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value as CommChannel)} className="input w-24 shrink-0">
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="call">Call note</option>
          </select>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Log a message to this candidate…"
            className="input min-h-[40px] flex-1 resize-none"
            rows={1}
          />
          <Button onClick={send} loading={sending} disabled={!draft.trim()}>
            <Send size={15} />
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted">Records the message in the thread. Live SMS/voice sends run through AI screening on the candidate's profile.</p>
      </div>
    </Card>
  )
}
