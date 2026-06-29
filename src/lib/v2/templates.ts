// Reusable outbound message templates + simple nurture sequences (org-scoped, RLS).
// Powers recruiter outreach/nurture/rejection messaging with merge fields. Actual
// send/scheduling reuses the comms channels (Vapi SMS today); a scheduled-send
// engine with reply tracking is a follow-up needing broader comms infra.
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'

export type TemplateCategory = 'outreach' | 'nurture' | 'screening' | 'rejection' | 'offer' | 'other'
export type TemplateChannel = 'email' | 'sms'

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['outreach', 'nurture', 'screening', 'rejection', 'offer', 'other']
export const TEMPLATE_CHANNELS: TemplateChannel[] = ['email', 'sms']

export interface SequenceStep {
  day_offset: number
  channel: TemplateChannel
  subject?: string | null
  body: string
}

export interface MessageTemplate {
  id: string
  org_id: string
  name: string
  category: TemplateCategory
  channel: TemplateChannel
  subject: string | null
  body: string
  is_sequence: boolean
  steps: SequenceStep[]
}

const SELECT = 'id,org_id,name,category,channel,subject,body,is_sequence,steps'

export async function listTemplates(): Promise<MessageTemplate[]> {
  const rows = await fetchAll<MessageTemplate>('message_templates', SELECT)
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export interface TemplateInput {
  name: string
  category: TemplateCategory
  channel: TemplateChannel
  subject?: string | null
  body: string
  is_sequence: boolean
  steps: SequenceStep[]
}

export async function createTemplate(input: TemplateInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2.from('message_templates').insert({ ...input, org_id, created_by: auth.user?.id ?? null })
  return { error: error?.message ?? null }
}

export async function updateTemplate(id: string, patch: Partial<TemplateInput>): Promise<{ error: string | null }> {
  const { error } = await v2.from('message_templates').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('message_templates').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Merge fields recognized by renderTemplate; surfaced as insert chips in the editor.
export const MERGE_FIELDS = ['{{first_name}}', '{{full_name}}', '{{role}}', '{{facility}}', '{{recruiter}}']

/** Substitute {{field}} tokens with values; unknown tokens are left intact. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}
