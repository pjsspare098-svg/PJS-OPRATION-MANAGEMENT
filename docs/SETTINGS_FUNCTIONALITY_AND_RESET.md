# PJS OMS Settings — Functional Controls & Personal Workspace Reset

Target: **independent PJS Operations** in Supabase `tbkytdktututiyeoqkwa`
and Vercel. **Do not use against the original PJS Delivery Control project.**

## What is functional in Settings

- **Office Worker:** live DataDoc, Outlook, and carrier worker heartbeat/state and job counts; local startup guide
- **Automation:** real job counters and links to queue history/dispatch/email pages. Website buttons cannot start Python directly
- **Users & Roles:** established TeamWorkspace admin/operator/viewer and invitations
- **Dispatch Rules:** signed-in user's E-Way threshold, re-track and reminder values saved in Supabase
- **PDF / OCR:** browser-only PDF text preview for the first three pages of a sample. Scanned-image OCR remains in existing workflow
- **Camera:** adjustable **per-batch** image selection limit 1–25 saved locally and enforced in Done Pick List selection
- **Notifications:** signed-in user's actual in-app notifications, unread count, mark all read
- **Backup & Recovery:** export process register CSV, historical import, and guarded Delete All My Personal Processes action
- **Security:** signed-in access/RLS and live workflow audit navigation
- **Appearance:** persisted compact/comfortable density, dark/light theme and initial page selection on this browser

Further work explicitly **not complete**: remote-start/stop of Windows workers from an ordinary browser, automatic SMS/WhatsApp, managed database backup restoration, full PDF OCR vendor mapping studio, automatic recovery policies, and upload compression. Keep their Settings tiles marked **PLANNED**; do not simulate controls.

## Protected Delete All My Personal Processes

1. Authenticated owner opens **Settings → Backup & Recovery → Delete all my processes**.
2. A Supabase Edge Function with valid JWT checks the independent OMS project and prepares a **server-side preview** (personal and Trash process count, document/photo counts, waiting/running jobs).
3. Browser operator must type exactly **DELETE ALL MY PROCESSES**, check an acknowledgement, and approve a second native confirmation.
4. If any external office/cloud jobs are already **running**, deletion is refused until the operator verifies completion. Queued jobs are cancelled as part of an authorized reset.
5. Database RPC marks only `user_id = authorized user AND team_id IS NULL` processes as pending reset. Worker job claimers skip trashed rows.
6. Edge function removes associated private PDF/photos through Supabase Storage API; SQL finalize deletes personal process rows, related queue/jobs, process events, linked album rows and process-specific agent tasks.
7. If Storage fails, no database finalization occurs. Process records are held in pending Trash for retry; the next preview shows pending cleanup.
8. A counts-only `oms_workspace_reset_sessions` record survives for an audit of the reset. The main Supabase Auth user, team/shared data and preferences remain.

**No deletion was executed when this feature was developed/deployed.**

### Important limitations

- Supabase-managed database backups, point-in-time recovery, retention snapshots,
  local downloaded exports and records already submitted to external DataDoc/carriers
  **cannot be erased by this website button**. They must be handled by the
  corresponding service/provider under its retention and security controls.
- This reset is intentionally limited to the signed-in user's personal records.
  Team-shared records belonging to other users are not changed.
- Only files referenced by database ownership metadata in the private buckets
  are enumerated. If orphaned storage objects exist, an administrator may need
  to audit them separately.
- High impact: do not use to recover from a missing field or a failed DataDoc job.
  Obtain exports and ask the owner to verify the exact deletion scope first.

## Connected deployment

- `supabase/migrations/023_personal_workspace_reset.sql` adds a restricted two-phase cleanup.
- `supabase/functions/oms-personal-workspace-reset/index.ts` is JWT-verified
  and restricted to the production PJS Operations origin. It uses a service-role
  credential only on the server and never embeds keys into Vite/browser JS.
- Database reset functions grant execute only to service_role, not authenticated/anon.
- `tests/settingsFunctionality.test.mjs` covers the owner guard and UI controls.
- Before declaring deletion fully acceptance-tested, run a separate isolated
  demo-user dry run, verify source bucket object removal, check queued-job
  cancellation, and confirm that team records remain untouched.
