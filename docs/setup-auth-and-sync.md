# Logins, invites, super-admin, and SharePoint sync

This covers the pieces that need Supabase (and, for SharePoint, Microsoft Entra)
configured. The app works without these in **local mode**; they light up once
Supabase is connected.

---

## Super-admin (preset)

`schema.sql` includes a `preset_admins` table seeded with
**npatel@amadministrators.com**. Anyone whose email is in that table becomes an
**admin** automatically the first time they sign in — no manual promotion needed.

Add more preset admins:

```sql
insert into public.preset_admins (email) values ('someone@amadministrators.com');
```

The very first user to sign in is also made admin (bootstrap), so even on a brand
new project you're covered.

---

## Per-recruiter logins by email invite

Admins invite teammates from **Team → Invite teammate**: enter an email, name,
role, and (for recruiters) the regions they cover. Supabase emails them a secure
link; they click it and **set their own password**. You never see or handle
passwords.

This is powered by the `invite-user` Edge Function (server-side, admin-gated).

### One-time setup
1. **Disable open sign-ups** so the only way in is an invite:
   Supabase → Authentication → Providers → Email → turn **off**
   "Allow new users to sign up". (This is what makes the role-on-invite safe.)
2. **Set the site URL** the invite link returns to:
   ```bash
   supabase secrets set SITE_URL=https://amallc-coder.github.io/recruiting/
   ```
3. **Deploy the function:**
   ```bash
   supabase functions deploy invite-user
   ```
4. **Email delivery:** Supabase's built-in email is rate-limited and best for
   testing. For production, configure SMTP under Auth → Emails (e.g. your
   Microsoft 365 / SendGrid), and customize the "Invite user" template.

> No CLI? You can also create users manually in Supabase → Authentication →
> Users → Add user, then set role/regions on the Team screen.

---

## Pull from SharePoint (one-click sync, no duplicates, newest wins)

The **Sync SharePoint** button on the Candidates screen (admins) pulls the latest
candidate rows from the team's Excel file via Microsoft Graph and upserts them:

- **No duplicates** — records are keyed by `(source_system, source_key)`; running
  it again updates the same rows instead of creating new ones.
- **Newest wins** — a row is only overwritten when the SharePoint file is *newer*
  than the last sync, so edits aren't clobbered by stale data.

Powered by the `sync-sharepoint` Edge Function.

### Prerequisites (needs IT / Entra admin)
1. **Entra (Azure AD) app registration** with Microsoft Graph **application**
   permission `Files.Read.All`, **admin-consented**. Create a client secret.
2. The worksheet being read must be **tabular** — one header row, then one row
   per candidate. The messy multi-table coverage sheet won't parse reliably;
   point the sync at a clean tab (the existing **LPNs** tab — Name / Email /
   Recruiter / Location / Start Date / Phone / Status — is already close).

### Configure & deploy
```bash
supabase secrets set TENANT_ID=<entra-tenant-id>
supabase secrets set GRAPH_CLIENT_ID=<app-client-id>
supabase secrets set GRAPH_CLIENT_SECRET=<app-client-secret>
supabase secrets set SHARE_URL="<the SharePoint share link to the .xlsx>"
supabase secrets set WORKSHEET_NAME="LPNs"
supabase functions deploy sync-sharepoint
```

### Mapping columns
The function maps sheet headers → fields in a `COLUMN_MAP` near the top of
`supabase/functions/sync-sharepoint/index.ts`, and free-text status → pipeline
stage in `mapStage()`. Adjust those to match your tab's exact headers and status
wording, then redeploy. Recruiters and facilities are matched by name to existing
records (assign regions/recruiters first for best matching).

> Because the source sheets are freeform, treat the first few syncs as a dry run:
> check the added/updated/skipped counts and spot-check a handful of records,
> then refine the mapping.
