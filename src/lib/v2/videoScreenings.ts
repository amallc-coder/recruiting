// Async one-way video screening — candidate records answers to prompts on a
// token-gated page; clips upload to a PRIVATE Supabase Storage bucket (uploads
// authorized by the token-scoped storage RLS); staff review via signed URLs +
// optional AI scoring (ai-video edge function). Org-scoped with RLS.
import { v2 } from './client'
import { currentOrgId } from './org'
import { demoMode } from '../supabase'

const BUCKET = 'video-screenings'

export type VideoStatus = 'pending' | 'completed' | 'reviewed'

export interface VideoQuestion {
  id: string
  prompt: string
  limit_sec: number
}
export interface VideoRecording {
  question_id: string
  path: string
  transcript: string | null
  duration_sec: number | null
}
export interface VideoScreening {
  id: string
  org_id: string
  candidate_id: string
  application_id: string | null
  token: string
  status: VideoStatus
  questions: VideoQuestion[]
  recordings: VideoRecording[] | null
  ai_score: number | null
  ai_summary: string | null
  ai_strengths: string[] | null
  ai_concerns: string[] | null
  ai_recommendation: string | null
  created_at: string
  completed_at: string | null
}

export const DEFAULT_VIDEO_QUESTIONS: VideoQuestion[] = [
  { id: 'intro', prompt: 'Tell us about yourself and your experience in healthcare.', limit_sec: 120 },
  { id: 'why', prompt: 'Why are you interested in this role and setting (SNF/LTC)?', limit_sec: 90 },
  { id: 'situation', prompt: 'Describe a challenging situation with a patient or resident and how you handled it.', limit_sec: 120 },
  { id: 'availability', prompt: 'What shifts and schedule are you available for, and when could you start?', limit_sec: 60 },
]

const SELECT =
  'id,org_id,candidate_id,application_id,token,status,questions,recordings,ai_score,ai_summary,ai_strengths,ai_concerns,ai_recommendation,created_at,completed_at'

export async function listVideoScreenings(candidateId: string): Promise<VideoScreening[]> {
  const { data } = await v2.from('video_screenings').select(SELECT).eq('candidate_id', candidateId).order('created_at', { ascending: false })
  return (data as VideoScreening[] | null) ?? []
}

export async function createVideoScreening(candidateId: string, questions: VideoQuestion[], applicationId?: string | null): Promise<{ token: string | null; error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { token: null, error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { data, error } = await v2
    .from('video_screenings')
    .insert({ org_id, candidate_id: candidateId, application_id: applicationId ?? null, questions, created_by: auth.user?.id ?? null })
    .select('token')
    .single()
  return { token: (data as { token: string } | null)?.token ?? null, error: error?.message ?? null }
}

export async function deleteVideoScreening(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('video_screenings').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export function videoScreeningUrl(token: string): string {
  const base = import.meta.env.BASE_URL
  return `${window.location.origin}${base}#/video/${token}`
}

// ---- public (anon) recording flow ----
export interface VideoContext {
  ok: boolean
  error?: string
  status?: VideoStatus
  candidate_name?: string
  org_name?: string
  questions?: VideoQuestion[]
}

export async function getVideoContext(token: string): Promise<VideoContext> {
  const { data, error } = await v2.rpc('video_screening_context', { p_token: token })
  if (error) return { ok: false, error: error.message }
  return (data as VideoContext) ?? { ok: false, error: 'Not found' }
}

/** Upload one answer clip to the private bucket; returns its storage path. */
export async function uploadRecording(token: string, questionId: string, blob: Blob, stamp: number): Promise<{ path: string | null; error: string | null }> {
  const path = `${token}/${questionId}-${stamp}.webm`
  const { error } = await v2.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'video/webm', upsert: true })
  return { path: error ? null : path, error: error?.message ?? null }
}

export async function submitVideoScreening(token: string, recordings: VideoRecording[]): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await v2.rpc('submit_video_screening', { p_token: token, p_recordings: recordings })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; error?: string }
  return { ok: !!res?.ok, error: res?.error ?? null }
}

/** Staff: a short-lived signed URL to play back a recording. */
export async function signedRecordingUrl(path: string): Promise<string | null> {
  const { data } = await v2.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/** Recruiter-triggered AI scoring from the answer transcripts (ai-video edge fn). */
export async function analyzeVideo(id: string): Promise<{ ok: boolean; error: string | null }> {
  if (demoMode) return { ok: false, error: 'AI scoring is unavailable in local mode.' }
  const { data, error } = await v2.functions.invoke('ai-video', { body: { video_screening_id: id } })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; error?: string }
  return { ok: !!res?.ok, error: res?.error ?? null }
}
