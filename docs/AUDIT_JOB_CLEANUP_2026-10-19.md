# Audit & Reports safe cleanup controls (19 October 2026)

Purpose: remove clutter from the visible Audit & Reports screen without losing
audit evidence or automatically retrying running external actions.

## UI

- **Process No. filter** affects the audit event and job lists. Empty = all processes.
- **Clear displayed audit history** (empty filter) or **Clear process audit view** (exact Process No.) archives OLD events and FINISHED jobs from this user's current display. This is **not permanent deletion**. The underlying OMS jobs and events are immutable for these actions.
- **Restore history** removes a corresponding personal archive cutoff, revealing old events/jobs again (subject to the existing 150/160-record API result limits).
- **Move process to trash** requires an exact Process No. for an existing personal process owned by the authenticated user, with no queued/running jobs. It uses the existing protected oms_set_process_trash RPC. Documents are preserved; restore in Data Store.
- **Cancel queued job** is per-job; works only if the job is still queued and belongs to the signed-in owner. The database atomically transitions it to cancelled and records an audit event. It cannot cancel an already claimed/running task.
- **Resolve stale tracking job** is deliberately NOT a generic Delete Running control. It is available only when:
  - job is of type tracking and status running;
  - claim is at least 15 minutes old;
  - tracking-worker heartbeat is known and older than 5 minutes;
  - user explicitly confirms that the Windows tracking worker has been stopped;
  - user enters a written reconciliation note (12–500 characters).
  The owner-scoped database RPC re-checks ALL conditions while locking the job and worker row; it marks the job failed for operator review without changing trackingStatus or retrying the carrier request.
- Running DataDoc Bill/Proof and Outlook jobs CANNOT be reset by these controls: their external portal/mailbox effects must be reconciled manually before any job retry.

## Operational warning

A stale heartbeat alone does not prove a Chrome process stopped. Stop the Windows
carrier worker on the office PC before using the Resolve button. Inspect the
actual carrier result to make sure the old worker hasn't already saved results.
A late office worker's oms_finish_tracking will refuse a job already marked
Failed, preserving the operator's reconciliation state.

This deployment does not change or cancel any already queued/running jobs.
The owner chooses a specific job and confirms an action. Audit history is never
bulk-deleted and there is no mass job-cancellation button.

## Back-end security and testing

Migration supabase/migrations/029_audit_queue_cleanup_controls.sql adds:

- RLS read-only table oms_audit_view_scopes keyed by (signed-in user, scope).
- authenticated-only SECURITY DEFINER RPCs: oms_archive_audit_view,
  oms_restore_audit_view, oms_cancel_queued_job,
  oms_reconcile_stale_tracking_job.
- Authenticated user ID taken from auth.uid(), not from UI props or client-supplied owner IDs.
- Owner, job status, Process No. and worker freshness checked inside the DB.
- The migration never modifies existing customer records when installed.

Frontend test: npm run test:audit-cleanup. The Vercel production build runs it.
