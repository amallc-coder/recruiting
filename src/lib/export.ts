// CSV export — gives the team an independent, downloadable backup of any
// dataset at any time (the "redundancy" requirement), on top of the cloud DB.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return ''
  const cols = columns ?? Object.keys(rows[0])
  const header = cols.map(escapeCell).join(',')
  const body = rows.map((row) => cols.map((c) => escapeCell(row[c])).join(',')).join('\n')
  return `${header}\n${body}`
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  const csv = toCsv(rows, columns)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
