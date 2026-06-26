// Integrations framework — a modular catalog of external platforms plus the
// data-access helpers the admin UI uses. New providers are added by appending to
// PROVIDERS; the core connect / test / sync / mapping / log logic never changes.
//
// Security note: live API calls, OAuth flows, and webhook-signature checks run
// in Supabase Edge Functions (service role). The frontend writes credentials but
// never reads them back (there is no SELECT policy on integration_credentials).
// The test/sync helpers below record a log entry; wiring them to a real Edge
// Function is the follow-up that makes a provider actually move data.
import { supabase, demoMode } from './supabase'
import { DEFAULT_COMPANY_ID } from './types'
import { logAudit } from './analytics'

export type IntegrationCategory =
  | 'job_board' | 'hris' | 'payroll' | 'background_check' | 'calendar'
  | 'email' | 'assessment' | 'esignature' | 'onboarding' | 'crm'
  | 'webhook' | 'custom'

export type AuthType =
  | 'api_key' | 'bearer' | 'oauth2' | 'basic' | 'webhook_secret' | 'custom_header' | 'none'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending'
export type SyncDirection = 'inbound' | 'outbound' | 'bidirectional'

export interface Integration {
  id: string
  company_id: string
  name: string
  provider: string
  category: IntegrationCategory
  status: IntegrationStatus
  auth_type: AuthType
  config_json: Record<string, unknown>
  credentials_reference: string | null
  base_url: string | null
  webhook_url: string | null
  sync_direction: SyncDirection
  sync_frequency: string
  last_sync_at: string | null
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface IntegrationLog {
  id: string
  integration_id: string
  event_type: string | null
  status: string | null
  message: string | null
  created_at: string
}

export interface FieldMapping {
  id?: string
  integration_id?: string
  source_field: string
  target_field: string
  transformation_rule: string | null
  is_required: boolean
}

export interface ProviderDef {
  provider: string
  name: string
  category: IntegrationCategory
  description: string
  icon: string
  authType: AuthType
  defaultDirection: SyncDirection
  defaultMappings?: { source: string; target: string }[]
}

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  job_board: 'Job boards',
  hris: 'HRIS',
  payroll: 'Payroll',
  background_check: 'Background checks',
  calendar: 'Calendar',
  email: 'Email',
  assessment: 'Assessments',
  esignature: 'E-signature',
  onboarding: 'Onboarding',
  crm: 'CRM / Sales',
  webhook: 'Webhooks',
  custom: 'Custom',
}

export const AUTH_LABELS: Record<AuthType, string> = {
  api_key: 'API key',
  bearer: 'Bearer token',
  oauth2: 'OAuth 2.0',
  basic: 'Basic auth',
  webhook_secret: 'Webhook signing secret',
  custom_header: 'Custom headers',
  none: 'No auth',
}

export const SYNC_FREQUENCIES = ['manual', '15m', 'hourly', 'daily', 'weekly'] as const
export const TRANSFORM_RULES = ['none', 'lowercase', 'uppercase', 'trim', 'date_iso', 'status_map'] as const

// ATS target fields a mapping can point at (for the field-mapping dropdowns).
export const ATS_TARGET_FIELDS: { group: string; fields: string[] }[] = [
  { group: 'Candidate', fields: ['candidate.first_name', 'candidate.last_name', 'candidate.email', 'candidate.phone', 'candidate.resume', 'candidate.source', 'candidate.stage', 'candidate.tags', 'candidate.notes'] },
  { group: 'Job', fields: ['job.title', 'job.department', 'job.location', 'job.employment_type', 'job.compensation', 'job.status', 'job.description', 'job.hiring_manager'] },
  { group: 'Application', fields: ['application.candidate', 'application.job', 'application.stage', 'application.source', 'application.rejection_reason', 'application.offer_status'] },
  { group: 'Interview', fields: ['interview.candidate', 'interview.job', 'interview.interviewer', 'interview.datetime', 'interview.location', 'interview.status'] },
  { group: 'Offer', fields: ['offer.candidate', 'offer.job', 'offer.compensation', 'offer.start_date', 'offer.status', 'offer.signed_url'] },
]

const candidateMappings = [
  { source: 'first_name', target: 'candidate.first_name' },
  { source: 'last_name', target: 'candidate.last_name' },
  { source: 'email', target: 'candidate.email' },
  { source: 'phone', target: 'candidate.phone' },
]

export const PROVIDERS: ProviderDef[] = [
  { provider: 'indeed', name: 'Indeed', category: 'job_board', icon: '🟦', authType: 'oauth2', defaultDirection: 'inbound', description: 'Sync sponsored job postings and pull applicants from Indeed.', defaultMappings: candidateMappings },
  { provider: 'linkedin', name: 'LinkedIn', category: 'job_board', icon: '💼', authType: 'oauth2', defaultDirection: 'inbound', description: 'Post jobs and import applicants from LinkedIn Talent.', defaultMappings: candidateMappings },
  { provider: 'ziprecruiter', name: 'ZipRecruiter', category: 'job_board', icon: '🟩', authType: 'api_key', defaultDirection: 'inbound', description: 'Distribute postings and receive applications from ZipRecruiter.', defaultMappings: candidateMappings },
  { provider: 'google_calendar', name: 'Google Calendar', category: 'calendar', icon: '📅', authType: 'oauth2', defaultDirection: 'outbound', description: 'Create interview events and detect interviewer availability.' },
  { provider: 'outlook', name: 'Microsoft Outlook', category: 'calendar', icon: '📆', authType: 'oauth2', defaultDirection: 'outbound', description: 'Schedule interviews on Outlook / Microsoft 365 calendars.' },
  { provider: 'gmail', name: 'Gmail', category: 'email', icon: '✉️', authType: 'oauth2', defaultDirection: 'bidirectional', description: 'Send candidate emails and track replies via Gmail.' },
  { provider: 'checkr', name: 'Checkr', category: 'background_check', icon: '🛡️', authType: 'api_key', defaultDirection: 'bidirectional', description: 'Order background checks and receive status updates.' },
  { provider: 'docusign', name: 'DocuSign', category: 'esignature', icon: '🖊️', authType: 'oauth2', defaultDirection: 'outbound', description: 'Send offer letters for e-signature and capture signed documents.' },
  { provider: 'adp', name: 'ADP', category: 'payroll', icon: '💳', authType: 'oauth2', defaultDirection: 'outbound', description: 'Push hired-employee data to ADP payroll.' },
  { provider: 'bamboohr', name: 'BambooHR', category: 'hris', icon: '🎋', authType: 'api_key', defaultDirection: 'outbound', description: 'Send new hires to BambooHR HRIS.' },
  { provider: 'workday', name: 'Workday', category: 'hris', icon: '🏢', authType: 'oauth2', defaultDirection: 'bidirectional', description: 'Sync requisitions and hires with Workday.' },
  { provider: 'slack', name: 'Slack', category: 'crm', icon: '💬', authType: 'oauth2', defaultDirection: 'outbound', description: 'Post hiring notifications to Slack channels.' },
  { provider: 'zapier', name: 'Zapier', category: 'webhook', icon: '⚡', authType: 'webhook_secret', defaultDirection: 'bidirectional', description: 'Connect to 6,000+ apps via Zapier webhooks.' },
  { provider: 'custom_rest', name: 'Custom REST API', category: 'custom', icon: '🔌', authType: 'api_key', defaultDirection: 'bidirectional', description: 'Connect any REST API with configurable auth and field mappings.' },
  { provider: 'custom_webhook', name: 'Custom Webhook', category: 'webhook', icon: '🪝', authType: 'webhook_secret', defaultDirection: 'inbound', description: 'Receive events from any system that can POST a webhook.' },
]

export function getProvider(provider: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.provider === provider)
}

/** Display URL where a provider would POST inbound webhooks. */
export function webhookUrlFor(provider: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = demoMode ? `${origin}` : 'https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1'
  return `${base}/webhooks/${provider}`
}

export async function listIntegrations(): Promise<Integration[]> {
  const { data } = await supabase.from('integrations').select('*').order('created_at', { ascending: false })
  return (data as Integration[]) ?? []
}

export async function listLogs(integrationId: string): Promise<IntegrationLog[]> {
  const { data } = await supabase.from('integration_logs').select('*').eq('integration_id', integrationId).order('created_at', { ascending: false })
  return (data as IntegrationLog[]) ?? []
}

async function writeLog(integrationId: string, event_type: string, status: string, message: string) {
  await supabase.from('integration_logs').insert({
    integration_id: integrationId, event_type, status, message, created_at: new Date().toISOString(),
  })
}

export interface ConnectInput {
  provider: ProviderDef
  name?: string
  base_url?: string
  auth_type?: AuthType
  sync_direction?: SyncDirection
  sync_frequency?: string
  config?: Record<string, unknown>
  credentials?: Record<string, unknown>
  mappings?: { source: string; target: string }[]
}

export async function connectIntegration(input: ConnectInput): Promise<{ error: string | null; id: string | null }> {
  const p = input.provider
  const authType = input.auth_type ?? p.authType
  // OAuth connections stay 'pending' until the provider redirect completes; in
  // demo mode (no Edge Functions) we mark them connected immediately.
  const pendingOAuth = authType === 'oauth2' && !demoMode
  const row = {
    company_id: DEFAULT_COMPANY_ID,
    name: input.name?.trim() || p.name,
    provider: p.provider,
    category: p.category,
    status: (pendingOAuth ? 'pending' : 'connected') as IntegrationStatus,
    auth_type: authType,
    config_json: input.config ?? {},
    base_url: input.base_url ?? null,
    webhook_url: webhookUrlFor(p.provider),
    sync_direction: input.sync_direction ?? p.defaultDirection,
    sync_frequency: input.sync_frequency ?? 'manual',
    is_enabled: !pendingOAuth,
  }
  const { data, error } = await supabase.from('integrations').insert(row).select('id')
  if (error) return { error: error.message, id: null }
  const id = ((data as { id: string }[]) ?? [])[0]?.id
  if (!id) return { error: 'Could not create integration.', id: null }

  // Store secrets in their own (write-only) table and link them.
  if (input.credentials && Object.keys(input.credentials).length) {
    const { data: cred } = await supabase.from('integration_credentials')
      .insert({ integration_id: id, encrypted_credentials: input.credentials }).select('id')
    const credId = ((cred as { id: string }[]) ?? [])[0]?.id
    if (credId) await supabase.from('integrations').update({ credentials_reference: credId }).eq('id', id)
  }

  // Seed default field mappings.
  const mappings = input.mappings ?? p.defaultMappings ?? []
  if (mappings.length) {
    await supabase.from('integration_field_mappings').insert(
      mappings.map((m) => ({ integration_id: id, source_field: m.source, target_field: m.target, transformation_rule: 'none', is_required: false })),
    )
  }

  await writeLog(id, 'connect', 'success', pendingOAuth ? `Created ${row.name} — awaiting OAuth.` : `Connected ${row.name}.`)
  await logAudit('integration_connected', { provider: p.provider, name: row.name })
  return { error: null, id }
}

// Edge-function helper (real mode only; the demo client has no .functions).
function fns(): { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: { message?: string } | null }> } | null {
  const f = (supabase as unknown as { functions?: unknown }).functions
  return f && typeof (f as { invoke?: unknown }).invoke === 'function'
    ? (f as { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: { message?: string } | null }> })
    : null
}

/** Kick off the OAuth consent redirect for an integration (real mode). */
export async function startOAuth(integrationId: string, provider: string): Promise<{ error: string | null }> {
  const f = fns()
  if (!f) return { error: 'OAuth needs the deployed integration-oauth Edge Function.' }
  const { data, error } = await f.invoke('integration-oauth', { body: { integration_id: integrationId, provider } })
  if (error) return { error: error.message ?? 'Could not start OAuth.' }
  const url = (data as { url?: string; error?: string })?.url
  if (url) { window.location.href = url; return { error: null } }
  return { error: (data as { error?: string })?.error ?? 'No authorization URL returned.' }
}

export async function updateIntegration(id: string, patch: Partial<Integration>): Promise<void> {
  await supabase.from('integrations').update(patch).eq('id', id)
  await logAudit('integration_updated', { id })
}

export async function disconnectIntegration(i: Integration): Promise<void> {
  await supabase.from('integrations').update({ status: 'disconnected', is_enabled: false }).eq('id', i.id)
  await writeLog(i.id, 'disconnect', 'success', `Disconnected ${i.name}.`)
  await logAudit('integration_disconnected', { provider: i.provider, name: i.name })
}

export async function removeIntegration(i: Integration): Promise<void> {
  await supabase.from('integrations').delete().eq('id', i.id)
  await logAudit('integration_removed', { provider: i.provider, name: i.name })
}

/**
 * Test connection. Without a live Edge Function this validates that the config
 * is complete and records the attempt in the logs (so the UI flow is real even
 * before a provider is wired to actually call out).
 */
export async function testConnection(i: Integration): Promise<{ ok: boolean; message: string }> {
  // Prefer the real server-side test; fall back to local validation if the
  // Edge Function isn't deployed.
  if (!demoMode) {
    const f = fns()
    if (f) {
      const { data, error } = await f.invoke('integration-sync', { body: { integration_id: i.id, action: 'test' } })
      if (!error && data) { const d = data as { ok: boolean; message: string }; return { ok: d.ok, message: d.message } }
    }
  }
  const needsUrl = i.provider === 'custom_rest'
  const hasCreds = !!i.credentials_reference || i.auth_type === 'none' || i.auth_type === 'oauth2'
  let ok = true
  let message = 'Configuration looks valid. (Live call runs once the provider Edge Function is deployed.)'
  if (needsUrl && !i.base_url) { ok = false; message = 'Missing base API URL.' }
  else if (!hasCreds) { ok = false; message = 'Missing credentials for the selected auth type.' }
  await writeLog(i.id, 'test', ok ? 'success' : 'error', message)
  if (!ok) await supabase.from('integrations').update({ status: 'error' }).eq('id', i.id)
  return { ok, message }
}

export async function runSync(i: Integration): Promise<{ ok: boolean; message: string }> {
  if (!demoMode) {
    const f = fns()
    if (f) {
      const { data, error } = await f.invoke('integration-sync', { body: { integration_id: i.id, action: 'sync' } })
      if (!error && data) { const d = data as { ok: boolean; message: string }; await logAudit('integration_synced', { id: i.id }); return { ok: d.ok, message: d.message } }
    }
  }
  const now = new Date().toISOString()
  const message = `Manual sync queued (${i.sync_direction}). Records move once the provider Edge Function is deployed.`
  await supabase.from('integrations').update({ last_sync_at: now }).eq('id', i.id)
  await writeLog(i.id, 'sync', 'success', message)
  await logAudit('integration_synced', { id: i.id })
  return { ok: true, message }
}

export async function listMappings(integrationId: string): Promise<FieldMapping[]> {
  const { data } = await supabase.from('integration_field_mappings').select('*').eq('integration_id', integrationId)
  return (data as FieldMapping[]) ?? []
}

/** Replace all mappings for an integration. */
export async function saveMappings(integrationId: string, mappings: FieldMapping[]): Promise<void> {
  await supabase.from('integration_field_mappings').delete().eq('integration_id', integrationId)
  const clean = mappings.filter((m) => m.source_field.trim() && m.target_field.trim())
  if (clean.length) {
    await supabase.from('integration_field_mappings').insert(
      clean.map((m) => ({
        integration_id: integrationId,
        source_field: m.source_field.trim(),
        target_field: m.target_field,
        transformation_rule: m.transformation_rule || 'none',
        is_required: m.is_required,
      })),
    )
  }
  await logAudit('integration_mappings_updated', { integrationId, count: clean.length })
}
