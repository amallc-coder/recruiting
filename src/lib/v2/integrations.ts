import { v2 } from './client'
import { currentOrgId } from './org'
import type { Integration, IntegrationStatus } from './types'

const INTEGRATION_SELECT = '*'

/** All integrations for the marketplace list, ordered by name. */
export async function listIntegrations(): Promise<Integration[]> {
  const { data } = await v2.from('integrations').select(INTEGRATION_SELECT).order('name')
  return (data as Integration[]) ?? []
}

export interface IntegrationInput {
  name: string
  provider: string
  category: string
  auth_type?: string
  sync_direction?: string
  base_url?: string | null
  webhook_url?: string | null
}

/** Create a pending, disabled integration scoped to the caller's org. */
export async function createIntegration(input: IntegrationInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  const { error } = await v2.from('integrations').insert({
    ...input,
    org_id,
    status: 'pending',
    is_enabled: false,
    auth_type: input.auth_type ?? 'api_key',
    sync_direction: input.sync_direction ?? 'inbound',
  })
  return { error: error?.message ?? null }
}

export async function updateIntegration(
  id: string,
  patch: Partial<IntegrationInput>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('integrations').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function setEnabled(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await v2.from('integrations').update({ is_enabled: enabled }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function setStatus(id: string, status: IntegrationStatus): Promise<{ error: string | null }> {
  const { error } = await v2.from('integrations').update({ status }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteIntegration(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('integrations').delete().eq('id', id)
  return { error: error?.message ?? null }
}
