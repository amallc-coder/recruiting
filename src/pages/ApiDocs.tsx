import { useState } from 'react'
import { Copy, CheckCircle2 } from 'lucide-react'

const BASE = 'https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1'

function Code({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg bg-ink px-4 py-3 text-xs leading-relaxed text-paper">
        <code className={`language-${lang}`}>{code}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="absolute right-2 top-2 rounded-md bg-paper/10 p-1.5 text-paper/80 opacity-0 transition-opacity hover:bg-paper/20 group-hover:opacity-100"
        aria-label="Copy"
      >
        {copied ? <CheckCircle2 size={14} className="text-sage-400" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/api/integrations', 'List all integrations for the company'],
  ['POST', '/api/integrations', 'Create a new integration'],
  ['GET', '/api/integrations/:id', 'Get integration details'],
  ['PATCH', '/api/integrations/:id', 'Update integration configuration'],
  ['DELETE', '/api/integrations/:id', 'Remove / disconnect an integration'],
  ['POST', '/api/integrations/:id/test', 'Test connection to the external platform'],
  ['POST', '/api/integrations/:id/sync', 'Run a manual sync'],
  ['GET', '/api/integrations/:id/logs', 'Return sync and error logs'],
  ['POST', '/api/webhooks/:provider', 'Receive webhook events from an external system'],
  ['POST', '/api/public/candidates', 'Create a candidate (approved external systems)'],
  ['POST', '/api/public/jobs', 'Create or update a job posting'],
  ['POST', '/api/public/applications', 'Create or update an application'],
]

const EVENTS = [
  'candidate.created', 'candidate.updated', 'application.created', 'application.stage_changed',
  'job.created', 'job.updated', 'interview.scheduled', 'offer.accepted', 'offer.rejected',
]

const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-sage-100 text-sage-700', POST: 'bg-clay-100 text-clay-700',
  PATCH: 'bg-brand-100 text-ink', DELETE: 'bg-rust-50 text-rust-500',
}

export function ApiDocs() {
  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <nav className="sticky top-24 hidden h-fit space-y-1 text-sm lg:block">
        {[
          ['auth', 'Authentication'], ['endpoints', 'Endpoints'], ['headers', 'Headers'],
          ['examples', 'Examples'], ['webhooks', 'Webhooks'], ['schemas', 'Payload schemas'],
          ['errors', 'Errors'], ['limits', 'Rate limits'],
        ].map(([id, label]) => (
          <a key={id} href={`#/api-docs#${id}`} className="block rounded-md px-2 py-1 text-muted hover:bg-brand-50 hover:text-ink">{label}</a>
        ))}
      </nav>

      <div className="max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Developer API</h1>
          <p className="mt-1 text-sm text-muted">
            Programmatic access to candidates, jobs, applications, interviews, and offers, plus inbound
            webhooks. All endpoints are served by Supabase Edge Functions and scoped to your company.
          </p>
        </div>

        <Section id="auth" title="Authentication">
          <p className="text-sm text-ink">Send an API key as a Bearer token. Create keys in <strong>Integrations → API & webhooks</strong>. Keys are scoped to one company and never expire until revoked.</p>
          <Code code={`Authorization: Bearer ats_live_xxxxxxxxxxxxxxxx
Content-Type: application/json`} lang="http" />
        </Section>

        <Section id="endpoints" title="Endpoints">
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-line">
                {ENDPOINTS.map(([m, path, desc]) => (
                  <tr key={m + path}>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${METHOD_STYLE[m]}`}>{m}</span></td>
                    <td className="px-3 py-2 font-mono text-xs text-ink">{path}</td>
                    <td className="hidden px-3 py-2 text-xs text-muted sm:table-cell">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="headers" title="Required headers">
          <Code code={`Authorization: Bearer <API_KEY>     # required on all /api routes
Content-Type: application/json      # on POST/PATCH
X-Idempotency-Key: <uuid>           # optional, dedupes retried writes
X-Webhook-Signature: <hmac>         # on inbound /api/webhooks/:provider`} lang="http" />
        </Section>

        <Section id="examples" title="Examples">
          <h3 className="text-sm font-semibold text-ink">Create a candidate</h3>
          <Code code={`curl -X POST ${BASE}/api/public/candidates \\
  -H "Authorization: Bearer $ATS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Jordan",
    "last_name": "Lee",
    "email": "jordan.lee@example.com",
    "phone": "+1-816-555-0142",
    "source": "Indeed",
    "job_id": "JOB_UUID"
  }'`} />
          <h3 className="text-sm font-semibold text-ink">Update an application stage</h3>
          <Code code={`curl -X PATCH ${BASE}/api/public/applications/APP_UUID \\
  -H "Authorization: Bearer $ATS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "stage": "interview" }'`} />
          <h3 className="text-sm font-semibold text-ink">Test an API key</h3>
          <Code code={`curl ${BASE}/api/integrations \\
  -H "Authorization: Bearer $ATS_KEY"
# 200 OK -> key is valid; 401 -> invalid or revoked`} />
          <h3 className="text-sm font-semibold text-ink">Example response</h3>
          <Code code={`{
  "id": "c1a2...",
  "full_name": "Jordan Lee",
  "email": "jordan.lee@example.com",
  "current_stage": "sourced",
  "source": "Indeed",
  "created_at": "2026-06-26T15:42:18Z"
}`} lang="json" />
        </Section>

        <Section id="webhooks" title="Webhooks">
          <p className="text-sm text-ink">Point a provider's webhook at <code>{BASE}/api/webhooks/&lt;provider&gt;</code>. Events are signature-verified, logged, and queued (<code>pending → processing → completed/failed</code>).</p>
          <h3 className="text-sm font-semibold text-ink">Receiving a webhook (payload)</h3>
          <Code code={`POST /api/webhooks/checkr
X-Webhook-Signature: t=1718...,v1=9f86d08...

{
  "event_type": "application.stage_changed",
  "source_platform": "checkr",
  "data": { "application_id": "APP_UUID", "stage": "background" }
}`} lang="http" />
          <h3 className="text-sm font-semibold text-ink">Supported event types</h3>
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((e) => <code key={e} className="rounded bg-paper px-2 py-1 text-xs text-ink ring-1 ring-inset ring-line">{e}</code>)}
          </div>
        </Section>

        <Section id="schemas" title="Payload schemas">
          <h3 className="text-sm font-semibold text-ink">Candidate</h3>
          <Code code={`{
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "phone": "string",
  "resume": "string (text or URL)",
  "source": "string",
  "current_stage": "sourced|interview|offer|accepted|background|cleared|welcome_call|training|active|declined|no_response",
  "tags": ["string"],
  "notes": "string"
}`} lang="json" />
          <h3 className="text-sm font-semibold text-ink">Job</h3>
          <Code code={`{
  "title": "string",
  "department": "string",
  "location": "string",
  "employment_type": "full_time|part_time|contract|per_diem|temporary|internship",
  "compensation": { "min": 0, "max": 0, "unit": "year|hour" },
  "status": "draft|published|paused|closed|archived",
  "description": "string",
  "hiring_manager": "string"
}`} lang="json" />
          <h3 className="text-sm font-semibold text-ink">Application</h3>
          <Code code={`{
  "candidate": "candidate_id",
  "job": "job_id",
  "stage": "string",
  "source": "string",
  "rejection_reason": "string|null",
  "offer_status": "none|pending|accepted|declined"
}`} lang="json" />
        </Section>

        <Section id="errors" title="Error response format">
          <Code code={`{
  "error": {
    "code": "invalid_credentials | rate_limited | validation_error | not_found | duplicate",
    "message": "Human-readable explanation",
    "details": { "field": "email", "reason": "already exists" }
  }
}`} lang="json" />
        </Section>

        <Section id="limits" title="Rate limits">
          <p className="text-sm text-ink">Public API endpoints are limited to <strong>120 requests/minute</strong> per key. Webhook receivers accept bursts and queue events. Exceeding a limit returns <code>429</code> with a <code>Retry-After</code> header.</p>
        </Section>
      </div>
    </div>
  )
}
