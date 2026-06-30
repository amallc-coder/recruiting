// Job-ad / job-description template library (org-scoped, RLS).
// Three ways to build a template: AI-authored (intro/responsibilities/benefits
// + editable facility blanks), uploaded from a PDF/XML job ad, or written by
// hand. The AI path calls the ai-jobad edge function and falls back to a local
// structured generator so the "AI draft" button always produces something
// usable — even before the edge function is deployed.
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import { demoMode } from '../supabase'

export type TemplateSource = 'ai' | 'upload' | 'manual'

/** A facility-specific fill-in: a {{key}} token in the body with a friendly label. */
export interface TemplateBlank {
  key: string
  label: string
}

export interface JobTemplate {
  id: string
  org_id: string
  name: string
  role_family: string | null
  category: string | null
  intro: string | null
  responsibilities: string[]
  benefits: string[]
  requirements: string[]
  blanks: TemplateBlank[]
  body: string | null
  source: TemplateSource
  file_name: string | null
  file_type: string | null
  created_at: string
}

const SELECT =
  'id,org_id,name,role_family,category,intro,responsibilities,benefits,requirements,blanks,body,source,file_name,file_type,created_at'

export async function listJobTemplates(): Promise<JobTemplate[]> {
  const rows = await fetchAll<JobTemplate>('job_templates', SELECT)
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export interface JobTemplateInput {
  name: string
  role_family?: string | null
  category?: string | null
  intro?: string | null
  responsibilities?: string[]
  benefits?: string[]
  requirements?: string[]
  blanks?: TemplateBlank[]
  body?: string | null
  source?: TemplateSource
  file_name?: string | null
  file_type?: string | null
}

export async function createJobTemplate(input: JobTemplateInput): Promise<{ id: string | null; error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { id: null, error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { data, error } = await v2
    .from('job_templates')
    .insert({ source: 'manual', ...input, org_id, created_by: auth.user?.id ?? null })
    .select('id')
    .single()
  return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null }
}

export async function updateJobTemplate(id: string, patch: Partial<JobTemplateInput>): Promise<{ error: string | null }> {
  const { error } = await v2.from('job_templates').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteJobTemplate(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('job_templates').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ---------------------------------------------------------------------------
// Facility-specific blanks: the {{tokens}} a recruiter fills when adapting a
// template to one facility. Recognized by renderJobTemplate; offered as chips.
// ---------------------------------------------------------------------------
export const STANDARD_BLANKS: TemplateBlank[] = [
  { key: 'facility_name', label: 'Facility name' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'schedule', label: 'Shift / schedule' },
  { key: 'pay_range', label: 'Pay range' },
  { key: 'start_date', label: 'Start date' },
  { key: 'reports_to', label: 'Reports to' },
]

/** Substitute {{key}} tokens with values; unknown tokens are left intact. */
export function renderJobTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k]?.trim() ? vars[k] : `{{${k}}}`))
}

/** Assemble a readable markdown body from the structured sections. */
export function assembleBody(t: {
  name?: string
  intro?: string | null
  responsibilities?: string[]
  benefits?: string[]
  requirements?: string[]
}): string {
  const out: string[] = []
  if (t.name?.trim()) out.push(`# ${t.name.trim()}`)
  if (t.intro?.trim()) out.push(t.intro.trim())
  const section = (title: string, items?: string[]) => {
    const list = (items ?? []).map((s) => s.trim()).filter(Boolean)
    if (!list.length) return
    out.push(`## ${title}`)
    out.push(list.map((s) => `- ${s}`).join('\n'))
  }
  section('Responsibilities', t.responsibilities)
  section('Requirements', t.requirements)
  section('Benefits', t.benefits)
  return out.join('\n\n')
}

export interface GeneratedTemplate {
  intro: string
  responsibilities: string[]
  benefits: string[]
  requirements: string[]
  blanks: TemplateBlank[]
  method: 'ai' | 'local'
}

export interface GenerateInput {
  title: string
  roleFamilyLabel?: string | null
  category?: string | null
}

/**
 * AI-author a structured job description. Tries the ai-jobad edge function;
 * falls back to a local generator (so the button always works, even before the
 * function is deployed or in local/demo mode).
 */
export async function generateJobTemplate(input: GenerateInput): Promise<GeneratedTemplate> {
  if (!demoMode) {
    try {
      const { data, error } = await v2.functions.invoke('ai-jobad', {
        body: { title: input.title, role_family: input.roleFamilyLabel ?? null, category: input.category ?? null },
      })
      const tpl = (data as { template?: Omit<GeneratedTemplate, 'method'> } | null)?.template
      if (!error && tpl && Array.isArray(tpl.responsibilities) && tpl.responsibilities.length) {
        return {
          intro: tpl.intro ?? '',
          responsibilities: tpl.responsibilities ?? [],
          benefits: tpl.benefits ?? [],
          requirements: tpl.requirements ?? [],
          blanks: tpl.blanks?.length ? tpl.blanks : STANDARD_BLANKS,
          method: 'ai',
        }
      }
    } catch {
      /* fall through to local generator */
    }
  }
  return { ...localTemplate(input), method: 'local' }
}

/** Local heuristic job-ad generator — generic but solid healthcare structure. */
function localTemplate(input: GenerateInput): Omit<GeneratedTemplate, 'method'> {
  const role = input.title.trim() || input.roleFamilyLabel || 'team member'
  const intro =
    `{{facility_name}} in {{city}}, {{state}} is hiring a ${role}. Join a mission-driven ` +
    `healthcare team delivering high-quality, compassionate care to the patients and residents ` +
    `we serve. This is a {{schedule}} position reporting to {{reports_to}}, with a target start of {{start_date}}.`
  const responsibilities = [
    `Deliver day-to-day ${role.toLowerCase()} duties in line with facility policy and applicable regulations.`,
    'Collaborate with the interdisciplinary care team to support positive patient and resident outcomes.',
    'Maintain accurate, timely documentation in the electronic health record.',
    'Uphold compliance, safety, and quality standards at all times.',
    'Communicate clearly and professionally with patients, families, and colleagues.',
  ]
  const requirements = [
    'Active, unrestricted license or certification required for this role (state-specific).',
    'Relevant hands-on experience in a clinical or healthcare setting.',
    'Current BLS/CPR certification (or ability to obtain before start).',
    'Strong interpersonal, organizational, and documentation skills.',
  ]
  const benefits = [
    'Competitive pay: {{pay_range}}.',
    'Medical, dental, and vision insurance.',
    '401(k) with employer match.',
    'Paid time off and paid holidays.',
    'Career growth and continuing-education support.',
  ]
  return { intro, responsibilities, benefits, requirements, blanks: STANDARD_BLANKS }
}

// ---------------------------------------------------------------------------
// Per-file upload: extract text from an uploaded job ad (PDF, XML, or text).
// Heavy parsers (pdfjs) are dynamically imported so they stay out of the main
// bundle — the same approach resumeParse / the xlsx importer use.
// ---------------------------------------------------------------------------
const MAX_CHARS = 40000

export interface ExtractedFile {
  text: string
  fileType: 'pdf' | 'xml' | 'txt'
}

export async function extractTemplateFile(file: File): Promise<ExtractedFile> {
  const name = file.name.toLowerCase()
  let text: string
  let fileType: ExtractedFile['fileType']
  if (name.endsWith('.pdf')) {
    text = await extractPdf(file)
    fileType = 'pdf'
  } else if (name.endsWith('.xml')) {
    text = extractXml(await file.text())
    fileType = 'xml'
  } else if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.html') || file.type.startsWith('text/')) {
    text = await file.text()
    fileType = 'txt'
  } else {
    throw new Error('Unsupported file — upload a PDF, XML, or text job ad.')
  }
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS)
  if (!text) throw new Error('No readable text found in that file.')
  return { text, fileType }
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) pages.push(line)
  }
  await doc.destroy()
  return pages.join('\n\n')
}

/** Flatten an XML job ad to readable text — most feeds (HR-XML/Indeed) wrap copy in elements. */
function extractXml(raw: string): string {
  try {
    const doc = new DOMParser().parseFromString(raw, 'application/xml')
    if (doc.querySelector('parsererror')) return stripTags(raw)
    const text = doc.documentElement?.textContent ?? ''
    // CDATA job bodies often embed HTML; strip any residual tags.
    return stripTags(text)
  } catch {
    return stripTags(raw)
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
