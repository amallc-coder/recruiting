// Shared OAuth provider configuration for the integration Edge Functions.
// Add a provider by appending one entry — the oauth/sync functions are generic.
export interface ProviderOAuth {
  authUrl: string
  tokenUrl: string
  scope: string
  clientIdEnv: string
  clientSecretEnv: string
  extraAuthParams?: Record<string, string>
  testUrl?: string // GET endpoint that 200s when the access token is valid
}

export const OAUTH: Record<string, ProviderOAuth> = {
  google_calendar: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/calendar.events',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    testUrl: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
  },
  gmail: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    testUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  },
  outlook: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access openid email Calendars.ReadWrite User.Read',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    testUrl: 'https://graph.microsoft.com/v1.0/me',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile email',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    testUrl: 'https://api.linkedin.com/v2/userinfo',
  },
  indeed: {
    authUrl: 'https://secure.indeed.com/oauth/v2/authorize',
    tokenUrl: 'https://apis.indeed.com/oauth/v2/tokens',
    scope: 'email offline_access',
    clientIdEnv: 'INDEED_CLIENT_ID',
    clientSecretEnv: 'INDEED_CLIENT_SECRET',
  },
}

export function providerConfig(provider: string): ProviderOAuth | null {
  return OAUTH[provider] ?? null
}

/** Exchange an auth code (or refresh token) for tokens at the provider. */
export async function exchangeToken(
  cfg: ProviderOAuth,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const clientId = Deno.env.get(cfg.clientIdEnv) ?? ''
  const clientSecret = Deno.env.get(cfg.clientSecretEnv) ?? ''
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params })
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`)
  return data
}

/** Normalize a provider token response into a credential record. */
export function toCredentials(tok: Record<string, unknown>): Record<string, unknown> {
  const expiresIn = Number(tok.expires_in ?? 0)
  return {
    access_token: tok.access_token ?? null,
    refresh_token: tok.refresh_token ?? null,
    token_type: tok.token_type ?? 'Bearer',
    scope: tok.scope ?? null,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  }
}
