# Vapi AI screening — setup

Enables the **AI call** / **Text** buttons in the candidate Engage panel. The AI
phones (or texts) the candidate, runs the recruiter-approved screening, and the
transcript returns automatically, gets analyzed by Claude, and feeds matching.

## One-time setup

1. **Sign up at [vapi.ai](https://vapi.ai)** (no credit card; $10 free credits to test).
2. **Buy/provision a phone number** in the Vapi dashboard (this is the caller ID).
3. **Set secrets** in Supabase → Edge Functions → Secrets:
   - `VAPI_API_KEY` — your Vapi **private** API key (required).
   - `VAPI_PHONE_NUMBER_ID` — optional; the id of the number to call from. If
     unset, the first number on the account is used.
   - `VAPI_WEBHOOK_SECRET` — optional; if set, also set the same value as the
     assistant `server.secret` so only Vapi can post transcripts.
   - `ANTHROPIC_API_KEY` — already set; reused to analyze the transcript.
4. **Deploy the functions:**
   ```bash
   supabase functions deploy vapi-call
   supabase functions deploy vapi-webhook --no-verify-jwt   # public: Vapi posts here
   ```
   The call function tells Vapi to post the end-of-call report to
   `<project>/functions/v1/vapi-webhook` automatically — no manual webhook
   registration needed for calls.

## How it flows

1. Recruiter generates → approves a screening (status `approved`).
2. Clicks **AI call** (or **Text**) → `vapi-call` places the Vapi call using the
   approved questions; screening → `sent`, logged as outbound communication.
3. Call ends → Vapi POSTs the transcript to `vapi-webhook` → transcript saved,
   Claude analysis stored (summary / fit score / flags), screening → `analyzed`,
   logged as inbound communication, and `candidates.screening_summary` refreshed
   so the result sharpens job matching.

## Notes
- US phone numbers only (E.164 normalization is automatic for 10/11-digit US numbers).
- Candidate must have a phone on file or the buttons are disabled.
- The voice agent's conversational model defaults to `gpt-4o` (Vapi-managed);
  change it in `vapi-call/index.ts` if you prefer another provider.
- Since the API key was shared in chat during setup, consider rotating it in the
  Vapi dashboard once everything works (good hygiene).
