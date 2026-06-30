import { useEffect, useState } from 'react'
import { Video, Plus, Link2, Trash2, Sparkles, Play, Star } from 'lucide-react'
import { Button, Card, Input, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listVideoScreenings,
  createVideoScreening,
  deleteVideoScreening,
  analyzeVideo,
  signedRecordingUrl,
  videoScreeningUrl,
  DEFAULT_VIDEO_QUESTIONS,
  type VideoScreening,
  type VideoQuestion,
  type VideoStatus,
} from '../../lib/v2/videoScreenings'

const STATUS_TONE: Record<VideoStatus, string> = {
  pending: 'bg-clay-50 text-clay-600',
  completed: 'bg-sage-100 text-sage-700',
  reviewed: 'bg-sage-500 text-white',
}

export function VideoScreeningsTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<VideoScreening[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)

  function refresh() {
    listVideoScreenings(candidateId).then(setRows)
  }
  useEffect(refresh, [candidateId])

  async function analyze(v: VideoScreening) {
    setAnalyzing(v.id)
    const { ok, error } = await analyzeVideo(v.id)
    setAnalyzing(null)
    if (!ok) toast({ tone: 'error', title: 'Scoring failed', description: error ?? undefined })
    else refresh()
  }
  async function remove(v: VideoScreening) {
    if (!confirm('Delete this video screening?')) return
    setRows((p) => p!.filter((x) => x.id !== v.id))
    await deleteVideoScreening(v.id)
  }
  async function copy(token: string) {
    await navigator.clipboard?.writeText(videoScreeningUrl(token))
    toast({ tone: 'success', title: 'Recording link copied', description: 'Send it to the candidate.' })
  }

  if (!rows) return <Spinner label="Loading video screenings…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <Video size={16} className="text-sage-600" /> Video screenings
        </h3>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} className="mr-1.5" /> Request video
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No video screenings" hint="Send the candidate a private link to record short video answers on their own time." />
      ) : (
        <div className="space-y-3">
          {rows.map((v) => (
            <Card key={v.id} className="p-4">
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[v.status]}`}>{v.status}</span>
                <div className="flex items-center gap-2">
                  {v.status === 'pending' && (
                    <button onClick={() => copy(v.token)} className="text-muted hover:text-ink" title="Copy recording link"><Link2 size={15} /></button>
                  )}
                  <button onClick={() => remove(v)} className="text-muted hover:text-rust-500" title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>

              {v.status !== 'pending' && (v.recordings?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  {v.ai_summary ? (
                    <div className="rounded-lg bg-brand-50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted">AI assessment</div>
                        {v.ai_score != null && (
                          <span className="flex items-center gap-1 text-sm font-semibold text-ink"><Star size={14} className="text-clay-500" fill="currentColor" /> {v.ai_score}/100</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-ink">{v.ai_summary}</p>
                      {v.ai_strengths && v.ai_strengths.length > 0 && (
                        <p className="mt-1 text-xs text-sage-700">+ {v.ai_strengths.join('; ')}</p>
                      )}
                      {v.ai_concerns && v.ai_concerns.length > 0 && (
                        <p className="mt-1 text-xs text-rust-600">! {v.ai_concerns.join('; ')}</p>
                      )}
                    </div>
                  ) : (
                    <Button variant="secondary" onClick={() => analyze(v)} loading={analyzing === v.id}>
                      <Sparkles size={15} className="mr-1.5" /> Score with AI
                    </Button>
                  )}

                  <div className="space-y-2">
                    {v.recordings!.map((r, i) => (
                      <RecordingRow key={i} index={i} questions={v.questions} questionId={r.question_id} path={r.path} transcript={r.transcript} />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {adding && <RequestVideoModal candidateId={candidateId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
    </div>
  )
}

function RecordingRow({ index, questions, questionId, path, transcript }: { index: number; questions: VideoQuestion[]; questionId: string; path: string; transcript: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const prompt = questions.find((q) => q.id === questionId)?.prompt ?? `Answer ${index + 1}`

  async function load() {
    setLoading(true)
    const u = await signedRecordingUrl(path)
    setLoading(false)
    setUrl(u)
  }

  return (
    <div className="rounded-lg border border-line p-2">
      <div className="text-xs font-medium text-muted">{prompt}</div>
      {url ? (
        <video src={url} controls className="mt-1.5 aspect-video w-full rounded bg-ink" />
      ) : (
        <button onClick={load} disabled={loading} className="mt-1.5 flex items-center gap-1.5 text-sm text-sage-700 hover:underline">
          <Play size={14} /> {loading ? 'Loading…' : 'Play answer'}
        </button>
      )}
      {transcript && <p className="mt-1.5 text-xs text-muted">"{transcript}"</p>}
    </div>
  )
}

function RequestVideoModal({ candidateId, onClose, onSaved }: { candidateId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [questions, setQuestions] = useState<VideoQuestion[]>(DEFAULT_VIDEO_QUESTIONS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  function update(i: number, prompt: string) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, prompt } : q)))
  }
  function add() {
    setQuestions((qs) => [...qs, { id: `q${qs.length + 1}-${Date.now()}`, prompt: '', limit_sec: 90 }])
  }
  function remove(i: number) {
    setQuestions((qs) => qs.filter((_, j) => j !== i))
  }

  async function save() {
    const cleaned = questions.filter((q) => q.prompt.trim()).map((q) => ({ ...q, prompt: q.prompt.trim() }))
    if (cleaned.length === 0) {
      setError('Add at least one question.')
      return
    }
    setSaving(true)
    setError(null)
    const { token, error } = await createVideoScreening(candidateId, cleaned)
    setSaving(false)
    if (error || !token) {
      setError(error || 'Could not create the video screening.')
      return
    }
    setLink(videoScreeningUrl(token))
  }

  return (
    <Modal
      title="Request a video screening"
      onClose={onClose}
      footer={
        link ? (
          <Button onClick={onSaved}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>Create link</Button>
          </>
        )
      }
    >
      {link ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">Send this private link to the candidate:</p>
          <div className="flex items-center gap-2">
            <input readOnly value={link} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(link); toast({ tone: 'success', title: 'Copied' }) }}>Copy</Button>
          </div>
          <p className="text-xs text-muted">They record on their own time; answers appear here when complete.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">Edit the prompts the candidate will answer on video.</p>
          {questions.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2">
              <span className="mt-2 text-xs font-semibold text-muted">{i + 1}.</span>
              <Input value={q.prompt} onChange={(e) => update(i, e.target.value)} placeholder="Question prompt" />
              <button onClick={() => remove(i)} className="mt-2 text-muted hover:text-rust-500"><Trash2 size={15} /></button>
            </div>
          ))}
          <button onClick={add} className="text-sm text-sage-700 hover:underline">+ Add question</button>
          {error && <p className="text-sm text-rust-700">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
