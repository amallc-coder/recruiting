// Fair-market-value / suggested-offer data layer. Calls the ai-comp edge
// function, which researches current pay for a requisition's role + facility
// location on the open web (Claude + web search) and returns a structured
// compensation band with sources. Results are cached server-side per
// role/state; a recent cached band returns instantly, `refresh` forces a re-pull.
import { v2 } from './client'
import { demoMode } from '../supabase'

export interface CompSource {
  title: string
  url: string
}
export interface CompBenchmark {
  currency: string
  hourly_low: number | null
  hourly_median: number | null
  hourly_high: number | null
  annual_low: number | null
  annual_median: number | null
  annual_high: number | null
  sources: CompSource[]
  rationale: string | null
  confidence: string | null
  fetched_at: string | null
}

export async function suggestComp(
  requisitionId: string,
  refresh = false,
): Promise<{ benchmark: CompBenchmark | null; error: string | null }> {
  if (demoMode) return { benchmark: null, error: 'Market data is unavailable in local mode.' }
  try {
    const { data, error } = await v2.functions.invoke('ai-comp', {
      body: { requisition_id: requisitionId, refresh },
    })
    if (error) return { benchmark: null, error: error.message }
    if (data && data.ok === false) return { benchmark: null, error: data.error ?? 'Could not get market data.' }
    return { benchmark: (data?.benchmark as CompBenchmark) ?? null, error: null }
  } catch (e) {
    return { benchmark: null, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

/** "$X" or "—". */
export function usd(n: number | null | undefined): string {
  return n == null ? '—' : '$' + Math.round(n).toLocaleString()
}

/** "$low–$high" annual range, or '' when unknown. */
export function annualRange(b: CompBenchmark): string {
  if (b.annual_low == null && b.annual_high == null) return ''
  return `${usd(b.annual_low)}–${usd(b.annual_high)}`
}

/** "$low–$high/hr" hourly range, or '' when unknown. */
export function hourlyRange(b: CompBenchmark): string {
  if (b.hourly_low == null && b.hourly_high == null) return ''
  return `${usd(b.hourly_low)}–${usd(b.hourly_high)}/hr`
}
