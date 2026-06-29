import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import type { Integration, IntegrationStatus } from './types'

const INTEGRATION_SELECT = '*'

/** All integrations for the marketplace list, ordered by name. */
export async function listIntegrations(): Promise<Integration[]> {
  // Paginate past the 1000-row cap; re-sort by name in JS.
  const rows = await fetchAll<Integration>('integrations', INTEGRATION_SELECT)
  return rows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
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

// ---- OAuth connect ---------------------------------------------------------
// Providers the integration-oauth Edge Function knows how to authorize (mirrors
// supabase/functions/_shared/providers.ts). Only these get a "Connect" button.
export const OAUTH_PROVIDERS = ['google_calendar', 'gmail', 'outlook', 'linkedin', 'indeed']

export function isOAuthProvider(provider: string): boolean {
  return OAUTH_PROVIDERS.includes(provider)
}

/**
 * Start the OAuth handshake: ask integration-oauth (admin-gated) for the
 * provider consent URL, then send the browser there. The provider redirects
 * back to the function's callback, which stores tokens server-side and bounces
 * to #/integrations?connected=<provider>. Returns an error string instead of
 * redirecting when the handshake can't start (function not deployed, missing
 * client id, not an admin, etc.).
 */
export async function connectOAuth(integrationId: string, provider: string): Promise<{ error: string | null }> {
  try {
    const { data, error } = await v2.functions.invoke('integration-oauth', {
      body: { integration_id: integrationId, provider },
    })
    if (error) return { error: error.message }
    const url = (data as { url?: string; error?: string } | null)?.url
    if (!url) return { error: (data as { error?: string } | null)?.error ?? 'Could not start OAuth.' }
    window.location.href = url
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'OAuth could not be started.' }
  }
}
