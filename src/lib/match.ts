// Candidate <-> position matching.
//
// Two tiers, transparently selected:
//   * Heuristic (this file): keyword/role/territory overlap — runs in the
//     browser, works in local mode and offline, no API key.
//   * AI (Claude via the `ai-match` Edge Function): richer reasoning over the
//     position verbiage and résumé text. Used automatically when Supabase is
//     connected and the function is deployed; falls back to the heuristic on
//     any error so the feature never breaks.

import { supabase, demoMode } from './supabase'
import { ROLE_LABELS, type Candidate, type ClinicalRole } from './types'

export interface MatchInput {
  role: ClinicalRole
  description: string // position verbiage / requirements
  region?: string | null
}

export interface MatchResult {
  candidateId: string
  score: number // 0–100
  summary: string
  strengths: string[]
  gaps: string[]
  method: 'ai' | 'heuristic'
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'a', 'an', 'to', 'of', 'in', 'on', 'or', 'at',
  'is', 'are', 'be', 'as', 'by', 'we', 'our', 'you', 'your', 'will', 'must',
  'have', 'has', 'this', 'that', 'they', 'their', 'who', 'can', 'all', 'per',
  'from', 'work', 'role', 'position', 'job', 'candidate', 'experience', 'years',
])

// The full text we reason over for a candidate: their résumé PLUS the rolling
// screening/communication context. This is what makes "everything communicated
// back and forth" feed into matching.
export function candidateMatchText(c: Pick<Candidate, 'resume_text' | 'screening_summary'>): string {
  return [c.resume_text ?? '', c.screening_summary ?? '']
    .filter((s) => s && s.trim())
    .join('\n\n')
    .trim()
}

function tokens(text: string): Set<string> {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )
}

// Transparent, explainable scoring so recruiters trust the ranking.
export function heuristicMatch(position: MatchInput, candidate: Candidate): MatchResult {
  let score = 0
  const strengths: string[] = []
  const gaps: string[] = []

  // Role fit (0–45) — the single biggest factor for clinical staffing.
  if (candidate.role === position.role) {
    score += 45
    strengths.push(`Role match: ${ROLE_LABELS[candidate.role]}`)
  } else {
    gaps.push(`Different role (${ROLE_LABELS[candidate.role]} vs ${ROLE_LABELS[position.role]})`)
  }

  // Territory fit (0–15).
  if (position.region && candidate.region && position.region === candidate.region) {
    score += 15
    strengths.push(`In territory: ${candidate.region}`)
  } else if (position.region && candidate.region) {
    gaps.push(`Outside region (${candidate.region})`)
  }

  // Keyword overlap between résumé and position verbiage (0–35).
  const posTokens = tokens(position.description)
  const resTokens = tokens(candidateMatchText(candidate))
  if (posTokens.size > 0 && resTokens.size > 0) {
    const overlap = [...posTokens].filter((t) => resTokens.has(t))
    const ratio = overlap.length / posTokens.size
    score += Math.round(ratio * 35)
    if (overlap.length) strengths.push(`Matches: ${overlap.slice(0, 6).join(', ')}`)
    const missing = [...posTokens].filter((t) => !resTokens.has(t))
    if (missing.length) gaps.push(`Not in résumé: ${missing.slice(0, 6).join(', ')}`)
  } else if (!candidate.resume_text && !candidate.screening_summary) {
    gaps.push('No résumé text to compare')
  }

  // Quality signal (0–5).
  if (candidate.rating) score += Math.min(5, candidate.rating)

  score = Math.max(0, Math.min(100, score))
  const summary =
    candidate.role === position.role
      ? `${score >= 70 ? 'Strong' : score >= 45 ? 'Possible' : 'Weak'} fit for this ${ROLE_LABELS[position.role]} need.`
      : `Role mismatch — review before considering.`

  return { candidateId: candidate.id, score, summary, strengths, gaps, method: 'heuristic' }
}

// Rank a candidate pool against a position. Uses Claude when available,
// otherwise the heuristic. Always returns sorted best-first.
export async function rankCandidates(
  position: MatchInput,
  candidates: Candidate[],
): Promise<MatchResult[]> {
  if (!demoMode) {
    try {
      const { data, error } = await supabase.functions.invoke('ai-match', {
        body: {
          position,
          candidates: candidates.map((c) => ({
            id: c.id,
            role: c.role,
            region: c.region,
            resume_text: candidateMatchText(c),
            rating: c.rating,
          })),
        },
      })
      if (!error && data?.results?.length) {
        const byId = new Map<string, MatchResult>(
          data.results.map((r: MatchResult) => [r.candidateId, { ...r, method: 'ai' as const }]),
        )
        // Fill any candidate the model skipped with the heuristic.
        const merged = candidates.map(
          (c) => byId.get(c.id) ?? heuristicMatch(position, c),
        )
        return merged.sort((a, b) => b.score - a.score)
      }
    } catch {
      /* fall through to heuristic */
    }
  }
  return candidates.map((c) => heuristicMatch(position, c)).sort((a, b) => b.score - a.score)
}
