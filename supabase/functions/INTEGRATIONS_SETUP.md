# Integrations — going live

The integration **framework, UI, and storage** ship with the app. To make the
external connections actually authenticate and move data, deploy the three Edge
Functions below and register OAuth apps with each provider. Until then,
connections still save and are configurable (API-key providers store keys;
OAuth providers show "pending").

> First make sure the updated `supabase/schema.sql` has been run in the SQL
> Editor — that creates the `integrations*` / `webhook_events` tables.

## 1. Deploy the functions

```bash
# from the repo root, logged in: supabase login && supabase link --project-ref pcpkhdfgmjrzvwfkcznn
supabase functions deploy integration-oauth   --no-verify-jwt
supabase functions deploy integration-sync     --no-verify-jwt
supabase functions deploy integration-webhook  --no-verify-jwt
```

`--no-verify-jwt` is required: the OAuth callback and the webhook receiver are
called by external systems (no Supabase JWT). Each function still enforces its
own auth — `integration-oauth` (authorize) and `integration-sync` verify the
caller is an **admin**; the callback and webhook are public by design.

## 2. Set secrets

```bash
supabase secrets set SITE_URL=https://amallc-coder.github.io/recruiting/
# Per provider you enable:
supabase secrets set GOOGLE_CLIENT_ID=...     GOOGLE_CLIENT_SECRET=...
supabase secrets set MICROSOFT_CLIENT_ID=...  MICROSOFT_CLIENT_SECRET=...
supabase secrets set LINKEDIN_CLIENT_ID=...   LINKEDIN_CLIENT_SECRET=...
supabase secrets set INDEED_CLIENT_ID=...     INDEED_CLIENT_SECRET=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically.

## 3. Register OAuth apps (one-time, per provider)

Use this **exact redirect URI** for every provider:

```
https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1/integration-oauth
```

| Provider | Where | Scopes used | Notes |
|---|---|---|---|
| **Google Calendar / Gmail** | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web) | `calendar.events`, `gmail.send`, `openid email` | Enable the Calendar / Gmail APIs. Add the redirect URI. |
| **Microsoft Outlook** | Entra ID → App registrations → new registration | `Calendars.ReadWrite`, `User.Read`, `offline_access` | Add the redirect URI as a **Web** platform. |
| **LinkedIn** | LinkedIn Developers → your app → Auth | `openid profile email` | Job/applicant scopes require LinkedIn partner approval. |
| **Indeed** | Indeed Apply / OAuth partner program | `email offline_access` | Indeed's hiring APIs require employer/partner approval. |

After registering, paste the client ID/secret into the `supabase secrets set`
commands above.

## 4. Webhooks (inbound)

Register this URL with a provider (Zapier, Checkr, etc.), substituting the
provider key shown in the app's integration detail:

```
https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1/integration-webhook/<provider>
```

If you store a **signing secret** on the integration, the receiver verifies the
`X-Webhook-Signature` (HMAC-SHA256 of the body). Events are recorded in
`webhook_events` (`pending → processing → completed/failed`). Handled out of the
box: `candidate.created`, `application.created`, `application.stage_changed`,
`job.created`.

## How it flows

- **Connect (OAuth)** → the app creates a `pending` integration, then redirects
  you to the provider; the callback stores tokens in `integration_credentials`
  (no read policy — never exposed to the browser) and flips the integration to
  `connected`.
- **Test / Sync now** → calls `integration-sync`, which refreshes the token if
  expired and hits the provider's health endpoint, logging the result.
- **API-key providers** (Checkr, BambooHR, ZipRecruiter, Custom REST) store the
  key on connect; Test validates it's present and reachable.

## Security notes

- Credentials live in `integration_credentials`, which has **no SELECT policy** —
  only the service-role Edge Functions can read them.
- For production, encrypt `encrypted_credentials` at rest with `pgsodium` /
  Supabase Vault and decrypt inside the function.
- All integration changes are written to `audit_logs`.
