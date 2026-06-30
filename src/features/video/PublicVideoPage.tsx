import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Video, Circle, Square, RotateCcw, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button, Card } from '../../components/primitives'
import {
  getVideoContext,
  uploadRecording,
  submitVideoScreening,
  type VideoContext,
  type VideoQuestion,
  type VideoRecording,
} from '../../lib/v2/videoScreenings'

type Phase = 'idle' | 'live' | 'recording' | 'recorded' | 'uploading'

function pickMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  for (const c of candidates) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  return 'video/webm'
}

/**
 * PUBLIC one-way video screening recorder (#/video/:token). No login — the token
 * authorizes per-clip uploads via the token-scoped storage policy. Records each
 * answer with MediaRecorder, captures a best-effort transcript (SpeechRecognition
 * where available), uploads each clip, then submits.
 */
export function PublicVideoPage() {
  const { token } = useParams()
  const [ctx, setCtx] = useState<VideoContext | null>(null)
  const [started, setStarted] = useState(false)
  const [qIndex, setQIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [recordings, setRecordings] = useState<VideoRecording[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)
  const startedAtRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef<string>('')

  useEffect(() => {
    if (token) getVideoContext(token).then(setCtx)
    return () => stopStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => {})
      }
      setPhase('live')
    } catch {
      setError('We need camera and microphone access to record. Please allow it and try again.')
    }
  }

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    blobRef.current = null
    transcriptRef.current = ''
    const mime = pickMime()
    const rec = new MediaRecorder(stream, { mimeType: mime })
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      blobRef.current = new Blob(chunksRef.current, { type: mime })
      durationRef.current = Math.round((Date.now() - startedAtRef.current) / 1000)
      if (videoRef.current) {
        videoRef.current.srcObject = null
        videoRef.current.muted = false
        videoRef.current.src = URL.createObjectURL(blobRef.current)
        videoRef.current.controls = true
      }
      setPhase('recorded')
    }
    recorderRef.current = rec
    startedAtRef.current = Date.now()
    rec.start()
    startSpeech()
    setPhase('recording')
  }

  function stopRecording() {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    stopSpeech()
  }

  function startSpeech() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    try {
      const r = new SR()
      r.continuous = true
      r.interimResults = true
      r.lang = 'en-US'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        let finalText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' '
        }
        if (finalText) transcriptRef.current = (transcriptRef.current + ' ' + finalText).trim()
      }
      r.onerror = () => {}
      recognitionRef.current = r
      r.start()
    } catch {
      /* best-effort */
    }
  }
  function stopSpeech() {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* noop */
    }
    recognitionRef.current = null
  }

  function reRecord() {
    if (videoRef.current) {
      videoRef.current.src = ''
      videoRef.current.controls = false
      videoRef.current.srcObject = streamRef.current
      videoRef.current.muted = true
      videoRef.current.play().catch(() => {})
    }
    blobRef.current = null
    setPhase('live')
  }

  async function useAndContinue() {
    if (!token || !blobRef.current || !ctx?.questions) return
    const q = ctx.questions[qIndex]
    setPhase('uploading')
    setError(null)
    const { path, error } = await uploadRecording(token, q.id, blobRef.current, Date.now())
    if (error || !path) {
      setError(error || 'Upload failed. Please try again.')
      setPhase('recorded')
      return
    }
    const next = [...recordings, { question_id: q.id, path, transcript: transcriptRef.current || null, duration_sec: durationRef.current }]
    setRecordings(next)

    const isLast = qIndex >= ctx.questions.length - 1
    if (isLast) {
      const res = await submitVideoScreening(token, next)
      if (!res.ok) {
        setError(res.error || 'Could not submit. Please try again.')
        setPhase('recorded')
        return
      }
      stopStream()
      setDone(true)
      return
    }
    // advance to next question, back to live preview
    setQIndex((i) => i + 1)
    reRecordToLive()
  }

  function reRecordToLive() {
    if (videoRef.current) {
      videoRef.current.src = ''
      videoRef.current.controls = false
      videoRef.current.srcObject = streamRef.current
      videoRef.current.muted = true
      videoRef.current.play().catch(() => {})
    }
    blobRef.current = null
    setPhase('live')
  }

  // ---- render ----
  if (!ctx) return <Shell><Msg>Loading…</Msg></Shell>
  if (!ctx.ok) return <Shell><Msg>{ctx.error}</Msg></Shell>
  if (ctx.status && ctx.status !== 'pending' && !done) return <Shell><Msg>Thanks — this video screening has already been submitted.</Msg></Shell>
  if (done)
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 size={40} className="text-sage-600" />
          <h2 className="text-xl font-semibold text-ink">All done — thank you!</h2>
          <p className="max-w-md text-sm text-muted">Your video answers were submitted to {ctx.org_name}. Our team will review them shortly.</p>
        </Card>
      </Shell>
    )

  const questions = ctx.questions ?? []
  const q: VideoQuestion | undefined = questions[qIndex]

  return (
    <Shell>
      {!started ? (
        <Card className="space-y-4 p-6">
          <p className="text-sm text-muted">
            Hi {ctx.candidate_name?.split(' ')[0] || 'there'} — {ctx.org_name} would like you to answer {questions.length} short questions on
            video. You can re-record each answer before moving on. You'll need to allow camera and microphone access.
          </p>
          <ol className="space-y-1 text-sm text-ink">
            {questions.map((qq, i) => (
              <li key={qq.id} className="flex gap-2">
                <span className="font-semibold text-muted">{i + 1}.</span> {qq.prompt}
              </li>
            ))}
          </ol>
          <Button onClick={() => { setStarted(true); startCamera() }} className="w-full">
            <Video size={16} className="mr-1.5" /> Start
          </Button>
          {error && <p className="text-sm text-rust-700">{error}</p>}
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Question {qIndex + 1} of {questions.length}</span>
            {q && <span className="text-xs text-muted">Up to {Math.round(q.limit_sec / 60) || 1} min</span>}
          </div>
          {q && <p className="text-base font-medium text-ink">{q.prompt}</p>}

          <div className="overflow-hidden rounded-xl bg-ink">
            <video ref={videoRef} playsInline className="aspect-video w-full bg-ink" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {phase === 'idle' && <Button onClick={startCamera}>Enable camera</Button>}
            {phase === 'live' && (
              <Button onClick={startRecording}>
                <Circle size={14} className="mr-1.5 fill-rust-500 text-rust-500" /> Record
              </Button>
            )}
            {phase === 'recording' && (
              <Button variant="secondary" onClick={stopRecording}>
                <Square size={14} className="mr-1.5 fill-rust-500 text-rust-500" /> Stop
              </Button>
            )}
            {phase === 'recorded' && (
              <>
                <Button variant="secondary" onClick={reRecord}>
                  <RotateCcw size={14} className="mr-1.5" /> Re-record
                </Button>
                <Button onClick={useAndContinue}>
                  {qIndex >= questions.length - 1 ? 'Submit' : 'Use & next'} <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </>
            )}
            {phase === 'uploading' && <Button loading disabled>Uploading…</Button>}
          </div>

          {error && <p className="text-center text-sm text-rust-700">{error}</p>}
          <p className="text-center text-[11px] text-muted">Your answers are recorded for hiring review only.</p>
        </Card>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-6 sm:px-6">
          <Video size={22} className="text-sage-600" />
          <h1 className="text-xl font-semibold tracking-tight text-ink">Video screening</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}

function Msg({ children }: { children: React.ReactNode }) {
  return <Card className="p-10 text-center text-sm text-muted">{children}</Card>
}
