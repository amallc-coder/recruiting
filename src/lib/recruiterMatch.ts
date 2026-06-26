// Fuzzy matching of spreadsheet recruiter names to existing user profiles.
// Handles nicknames (Rob -> Robert), prefixes, and surname matches, so the
// importer can auto-assign candidates to the right recruiter.
import type { Profile } from './types'

const NICKNAMES: Record<string, string[]> = {
  rob: ['robert', 'robbie', 'bob', 'bobby'], bob: ['robert', 'rob'],
  mike: ['michael'], mick: ['michael'], matt: ['matthew'], chris: ['christopher', 'christina', 'christine'],
  alex: ['alexander', 'alexandra', 'alexandria'], abby: ['abigail'], beth: ['elizabeth'], liz: ['elizabeth'],
  bill: ['william'], will: ['william'], jim: ['james'], jimmy: ['james'], joe: ['joseph'], joey: ['joseph'],
  tony: ['anthony'], dave: ['david'], dan: ['daniel'], danny: ['daniel'], tom: ['thomas'], tommy: ['thomas'],
  nick: ['nicholas'], sam: ['samuel', 'samantha'], kate: ['katherine', 'kathryn', 'katie'], katie: ['katherine', 'kathryn'],
  jen: ['jennifer'], jenny: ['jennifer'], deb: ['deborah', 'debra'], debbie: ['deborah', 'debra'],
  cathy: ['catherine'], steve: ['steven', 'stephen'], greg: ['gregory'], gabe: ['gabriel'], andy: ['andrew'],
  ben: ['benjamin'], ed: ['edward'], eddie: ['edward'], fred: ['frederick'], hank: ['henry'], jack: ['john', 'jackson'],
  johnny: ['john'], ken: ['kenneth'], larry: ['lawrence'], pat: ['patrick', 'patricia'], rick: ['richard'],
  rich: ['richard'], dick: ['richard'], ron: ['ronald'], tina: ['christina'], vicky: ['victoria'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => norm(s).split(' ').filter(Boolean)

function nicknameMatch(a: string, b: string): boolean {
  if (a === b) return true
  if ((NICKNAMES[a] ?? []).includes(b)) return true
  if ((NICKNAMES[b] ?? []).includes(a)) return true
  // shared full-name target (rob & bob both -> robert)
  const ta = new Set([a, ...(NICKNAMES[a] ?? [])])
  return (NICKNAMES[b] ?? []).some((x) => ta.has(x))
}

function firstNameMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true
  return nicknameMatch(a, b)
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
const ratio = (a: string, b: string) => (a || b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 1)

/** 0..1 similarity between two person names. */
export function nameSimilarity(an: string, bn: string): number {
  const a = tokens(an), b = tokens(bn)
  if (!a.length || !b.length) return 0
  if (a.join(' ') === b.join(' ')) return 1
  // Both have surnames.
  if (a.length >= 2 && b.length >= 2) {
    const surA = a[a.length - 1], surB = b[b.length - 1]
    if (surA === surB) return firstNameMatch(a[0], b[0]) ? 0.97 : 0.78
    if (ratio(surA, surB) > 0.85 && firstNameMatch(a[0], b[0])) return 0.9
  }
  // One side is a single token (e.g. a tab named "Rob" or just a first name).
  if (a.length === 1 || b.length === 1) {
    const one = (a.length === 1 ? a : b)[0]
    const other = a.length === 1 ? b : a
    if (other.some((t) => firstNameMatch(one, t))) return 0.95
  }
  return ratio(a.join(' '), b.join(' '))
}

export interface RecruiterMatch { id: string; name: string; score: number }

/** Best profile match for a name, at or above `threshold` (default 0.9). */
export function matchRecruiter(name: string, profiles: Profile[], threshold = 0.9): RecruiterMatch | null {
  let best: RecruiterMatch | null = null
  for (const p of profiles) {
    const full = p.full_name || p.email || ''
    if (!full) continue
    const score = nameSimilarity(name, full)
    if (score >= threshold && (!best || score > best.score)) best = { id: p.id, name: full, score }
  }
  return best
}
