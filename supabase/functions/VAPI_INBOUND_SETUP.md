# Inbound AI voice recruiter — setup

A 24/7 phone line candidates can **call**, where an AI assistant screens them and
files the call into the ATS automatically. Outbound AI calling already exists
(`vapi-call` / `vapi-webhook`); this adds the **inbound** direction via
`vapi-inbound-webhook`.

## How it works

1. A candidate dials the org's Vapi phone number.
2. An **inbound assistant** answers (female voice, AI + recording disclosure,
   your screening questions).
3. When the call ends, Vapi POSTs the end-of-call report to
   `vapi-inbound-webhook`, which:
   - identifies the caller by phone (or creates a new candidate),
   - analyzes the transcript with Claude (name, role interest, summary, sentiment),
   - logs the call as an **inbound communication** — so it shows up in the
     **Inbox** and on the candidate profile — and writes an audit entry.

## One-time setup

1. **Deploy the function** (public — no JWT):
   ```
   supabase functions deploy vapi-inbound-webhook --no-verify-jwt
   ```
   Confirm `GET` returns `{"ok":true}`.

2. **Secrets** (Supabase → Edge Functions → Secrets):
   - `ANTHROPIC_API_KEY` — already set (enables transcript analysis; optional).
   - `VAPI_WEBHOOK_SECRET` — optional shared secret; if set, the assistant must
     send a matching `x-vapi-secret` header.

3. **Provision a phone number** in the Vapi dashboard (or attach an existing one).

4. **Create an inbound assistant** in Vapi and attach it to that number:
   - Voice: a female voice (e.g. `Paige`) to match the outbound experience.
   - First message / system prompt: greet, give the **AI + recording disclosure**,
     then ask your standard screening questions one at a time; capture the
     caller's name, the role/shift they want, and availability.
   - **Server URL**: the deployed `vapi-inbound-webhook` URL.
   - (Optional) add an `x-vapi-secret` header equal to `VAPI_WEBHOOK_SECRET`.

5. **Test**: call the number, talk to the assistant, hang up. A candidate +
   an inbound call thread should appear in the **Inbox** within a few seconds.

## Notes

- US numbers are normalized to the last 10 digits for matching, consistent with
  the outbound flow.
- The webhook never exposes other candidates' data; it only writes the caller's
  own record.
- This complements outbound screening + scheduled callbacks — the same candidate
  can be reached either way and everything lands in one timeline.
