// US geography repository: full state/territory list (always loaded) plus the
// complete ~30k US city dataset, lazy-loaded from /public/data on first use so
// it never bloats the initial bundle. Used by every location field (facilities,
// requisitions, job postings) for typeahead + validation.

export interface UsState {
  code: string
  name: string
  kind: 'state' | 'federal_district' | 'territory'
}

// 50 states + DC + the five inhabited US territories. `code` matches the
// STATE_CODE in the city dataset where present.
export const US_STATES: UsState[] = [
  { code: 'AL', name: 'Alabama', kind: 'state' },
  { code: 'AK', name: 'Alaska', kind: 'state' },
  { code: 'AZ', name: 'Arizona', kind: 'state' },
  { code: 'AR', name: 'Arkansas', kind: 'state' },
  { code: 'CA', name: 'California', kind: 'state' },
  { code: 'CO', name: 'Colorado', kind: 'state' },
  { code: 'CT', name: 'Connecticut', kind: 'state' },
  { code: 'DE', name: 'Delaware', kind: 'state' },
  { code: 'FL', name: 'Florida', kind: 'state' },
  { code: 'GA', name: 'Georgia', kind: 'state' },
  { code: 'HI', name: 'Hawaii', kind: 'state' },
  { code: 'ID', name: 'Idaho', kind: 'state' },
  { code: 'IL', name: 'Illinois', kind: 'state' },
  { code: 'IN', name: 'Indiana', kind: 'state' },
  { code: 'IA', name: 'Iowa', kind: 'state' },
  { code: 'KS', name: 'Kansas', kind: 'state' },
  { code: 'KY', name: 'Kentucky', kind: 'state' },
  { code: 'LA', name: 'Louisiana', kind: 'state' },
  { code: 'ME', name: 'Maine', kind: 'state' },
  { code: 'MD', name: 'Maryland', kind: 'state' },
  { code: 'MA', name: 'Massachusetts', kind: 'state' },
  { code: 'MI', name: 'Michigan', kind: 'state' },
  { code: 'MN', name: 'Minnesota', kind: 'state' },
  { code: 'MS', name: 'Mississippi', kind: 'state' },
  { code: 'MO', name: 'Missouri', kind: 'state' },
  { code: 'MT', name: 'Montana', kind: 'state' },
  { code: 'NE', name: 'Nebraska', kind: 'state' },
  { code: 'NV', name: 'Nevada', kind: 'state' },
  { code: 'NH', name: 'New Hampshire', kind: 'state' },
  { code: 'NJ', name: 'New Jersey', kind: 'state' },
  { code: 'NM', name: 'New Mexico', kind: 'state' },
  { code: 'NY', name: 'New York', kind: 'state' },
  { code: 'NC', name: 'North Carolina', kind: 'state' },
  { code: 'ND', name: 'North Dakota', kind: 'state' },
  { code: 'OH', name: 'Ohio', kind: 'state' },
  { code: 'OK', name: 'Oklahoma', kind: 'state' },
  { code: 'OR', name: 'Oregon', kind: 'state' },
  { code: 'PA', name: 'Pennsylvania', kind: 'state' },
  { code: 'RI', name: 'Rhode Island', kind: 'state' },
  { code: 'SC', name: 'South Carolina', kind: 'state' },
  { code: 'SD', name: 'South Dakota', kind: 'state' },
  { code: 'TN', name: 'Tennessee', kind: 'state' },
  { code: 'TX', name: 'Texas', kind: 'state' },
  { code: 'UT', name: 'Utah', kind: 'state' },
  { code: 'VT', name: 'Vermont', kind: 'state' },
  { code: 'VA', name: 'Virginia', kind: 'state' },
  { code: 'WA', name: 'Washington', kind: 'state' },
  { code: 'WV', name: 'West Virginia', kind: 'state' },
  { code: 'WI', name: 'Wisconsin', kind: 'state' },
  { code: 'WY', name: 'Wyoming', kind: 'state' },
  { code: 'DC', name: 'District of Columbia', kind: 'federal_district' },
  { code: 'PR', name: 'Puerto Rico', kind: 'territory' },
  { code: 'GU', name: 'Guam', kind: 'territory' },
  { code: 'VI', name: 'U.S. Virgin Islands', kind: 'territory' },
  { code: 'AS', name: 'American Samoa', kind: 'territory' },
  { code: 'MP', name: 'Northern Mariana Islands', kind: 'territory' },
]

const STATE_BY_CODE = new Map(US_STATES.map((s) => [s.code, s]))
const STATE_BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s]))

export function stateName(code: string | null | undefined): string {
  if (!code) return ''
  return STATE_BY_CODE.get(code.toUpperCase())?.name ?? code
}

export function stateCode(nameOrCode: string | null | undefined): string | null {
  if (!nameOrCode) return null
  const v = nameOrCode.trim()
  if (STATE_BY_CODE.has(v.toUpperCase())) return v.toUpperCase()
  return STATE_BY_NAME.get(v.toLowerCase())?.code ?? null
}

// ---- Cities (lazy-loaded) ---------------------------------------------------

type CityMap = Record<string, string[]>
let _cities: CityMap | null = null
let _loading: Promise<CityMap> | null = null

/** Loads the full US city dataset once (cached). Safe to call repeatedly. */
export async function loadCities(): Promise<CityMap> {
  if (_cities) return _cities
  if (_loading) return _loading
  const url = `${import.meta.env.BASE_URL}data/us_cities.json`
  _loading = fetch(url)
    .then((r) => (r.ok ? r.json() : {}))
    .then((data: CityMap) => {
      _cities = data
      return data
    })
    .catch(() => {
      _cities = {}
      return {}
    })
  return _loading
}

/** Cities for a given state code (empty until loadCities resolves). */
export function citiesForState(code: string | null | undefined): string[] {
  if (!_cities || !code) return []
  return _cities[code.toUpperCase()] ?? []
}

/**
 * Typeahead search. If `stateCode` is given, scopes to that state; otherwise
 * searches every state and returns "City, ST" labels. Prefix matches first.
 */
export function searchCities(
  query: string,
  scopeState?: string | null,
  limit = 12,
): { city: string; state: string; label: string }[] {
  if (!_cities) return []
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: { city: string; state: string; label: string; rank: number }[] = []
  const states = scopeState ? [scopeState.toUpperCase()] : Object.keys(_cities)
  for (const st of states) {
    const list = _cities[st]
    if (!list) continue
    for (const city of list) {
      const lc = city.toLowerCase()
      const idx = lc.indexOf(q)
      if (idx === -1) continue
      out.push({ city, state: st, label: scopeState ? city : `${city}, ${st}`, rank: idx === 0 ? 0 : 1 })
      if (out.length > 400) break
    }
  }
  out.sort((a, b) => a.rank - b.rank || a.city.localeCompare(b.city))
  return out.slice(0, limit)
}
