# SharePoint résumé sync (`sync-sharepoint` edge function)

Pulls candidates (including **résumé text**) from a SharePoint Excel workbook via
Microsoft Graph and writes them into the v2 `candidates` table:

- **Enrich** — a row whose **email** matches an existing candidate updates that
  record (`resume_text` / `notes` / `phone`). No duplicates; `resume_text` is the
  field the AI Match engine reads.
- **Create** — a row with a new email is upserted as a new candidate, keyed on
  `(source_system='sharepoint', source_key)`, newest-wins via `source_modified`.

Trigger it from **Import → "Pull from SharePoint" → Sync now** (admins only).

## It's dormant until configured

With no secrets set, the function returns a clear message
("SharePoint sync isn't configured yet…") and changes nothing. To enable it:

### 1. Entra (Azure AD) app registration
- Register an app in Entra ID.
- Add the **Microsoft Graph application permission `Files.Read.All`** and grant
  **admin consent**.
- Create a **client secret**.

### 2. Prepare a tabular worksheet
One header row, then one row per candidate. Recognized headers (case-insensitive):

| Header(s) | Maps to |
|---|---|
| `name`, `full name`, `candidate` | full name |
| `email`, `email address` | email (used to match/enrich) |
| `phone`, `phone number`, `mobile` | phone |
| `resume`, `résumé`, `resume text`, `cv`, `summary`, `experience`, `work history` | **resume_text** |
| `notes`, `comments` | notes |
| `source`, `tags` | source / tags |

Include a résumé/summary/experience column — that's the whole point.

### 3. Set the Edge Function secrets

```
supabase secrets set \
  TENANT_ID=...            \
  GRAPH_CLIENT_ID=...      \
  GRAPH_CLIENT_SECRET=...  \
  SHARE_URL='<share link to the .xlsx>' \
  WORKSHEET_NAME='Candidates'
```

(The Anthropic/Supabase service keys are auto-provided.) Once set, **Sync now**
reads the worksheet and reports `enriched · added · skipped`. Secrets stay
server-side — never put `GRAPH_CLIENT_SECRET` in the frontend or in chat.
