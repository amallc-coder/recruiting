# Checkr background-check integration

Order background checks from a candidate's profile and have results flow back
automatically. Two edge functions:

- **`checkr-order`** (JWT, admin/recruiter/coordinator) — creates/reuses a Checkr
  candidate from the candidate's name + email and sends a Checkr **invitation**
  for the configured package. Records `applications.checkr_candidate_id`, sets
  `background_sent_date`, and marks `checkr_status = 'pending'`.
- **`checkr-webhook`** (public) — receives Checkr events and updates the matching
  application by its Checkr candidate id: sets `checkr_status` and, on `clear`,
  stamps `background_cleared_date`. Verifies `X-Checkr-Signature` when
  `CHECKR_WEBHOOK_SECRET` is set.

In the app: open a candidate → **Overview → each application shows a Background
badge** with an **Order background check** button (admins/recruiters).

## Dormant until configured

With no secrets set, **Order background check** returns a clear
"Checkr isn't configured yet…" message and changes nothing. To enable:

### 1. Edge Function secrets

```
supabase secrets set \
  CHECKR_API_KEY=...          \   # Checkr secret API key (test or live)
  CHECKR_PACKAGE=...          \   # the package slug to order, e.g. "driver_pro"
  CHECKR_WEBHOOK_SECRET=...   \   # (recommended) verifies webhook signatures
  CHECKR_WORK_STATE=MO            # (optional) work_locations state; US assumed
```

Use a Checkr **test** key first — invitations and reports run in the sandbox.

### 2. Register the webhook in Checkr

Point a Checkr webhook at:

```
https://<your-project-ref>.supabase.co/functions/v1/checkr-webhook
```

Subscribe to the **report** events (at minimum `report.completed`); the function
also records the report id on `report.created`. A `GET` on that URL returns
`{"ok":true}` for verification.

### 3. Order a check

On a candidate's profile, click **Order background check** on an application.
Checkr emails the candidate to complete their info; when the report finishes,
the webhook updates the badge (`clear` / `consider` / …) and, if cleared, fills
`background_cleared_date`.

Secrets stay server-side — never put `CHECKR_API_KEY` in the frontend or in chat.
