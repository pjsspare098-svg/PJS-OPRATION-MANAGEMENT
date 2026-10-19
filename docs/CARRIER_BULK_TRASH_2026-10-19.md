# Dispatch Tracking: delete by selected transporter (recoverable bulk trash)

Date: 19 October 2026. Applies to the independent PJS OMS site only.

## Operator workflow

1. Open Dispatch Tracking > Trackable. Choose one transporter (for example SHREE MARUTI) in the Transporter dropdown. The action stays disabled for All carriers.
2. Click **Delete selected transporter**. A server-side preview lists the current count of your matching personally owned processes in Dispatch Tracking, how many are eligible to move, how many are blocked by queued/running jobs, and how many are protected shared-team processes owned by you.
3. This targets all personal processes of the selected transporter in the Dispatch Tracking stage, **regardless of the search text or status filter**. It does not touch another stage or carrier.
4. Type **DELETE SHREE MARUTI** (replace carrier name as necessary), then acknowledge the final confirmation dialog.
5. The server compares a fingerprint covering the matching process IDs, numbers, update timestamps, team ownership, and job-blocker states. Changes since the preview reject the transaction; refresh preview and inspect.
6. In one transaction, only the eligible rows are moved to Deleted Processes. All process attachments, private screenshots, jobs and audit events are retained. One new audit event is saved for each moved Process No.
7. Eligible processes can be restored in Data Store > Deleted Processes using the existing Restore action.

## Safety and scope

- No permanent deletion, storage deletion, job cancellation, retry, DataDoc submission, email or carrier tracking.
- Only the authenticated user's personal processes are eligible. Any shared-team processes are excluded.
- Excludes every process with ANY queued or running OMS job (including old tracking worker jobs).
- Current observation before deployment: 60 non-deleted Shree Maruti processes in Dispatch Tracking, 2 with active jobs; a preview can show 58 eligible. This number is NOT a command to move them. No process is moved until a signed-in user confirms in the UI.
- Back end recomputes current ownership, stage, transporter and active-job state while holding transactional locks and returns a count; a mismatch aborts everything.

## Deployment and QA

- Migration: supabase/migrations/031_dispatch_carrier_bulk_trash.sql, functions: oms_tracking_carrier_key, oms_preview_dispatch_carrier_trash, oms_move_dispatch_carrier_to_trash.
- Build regression: npm run test:carrier-bulk-trash, plus existing standard build tests.
- Manually verify the preview for Shree Maruti WITHOUT confirming it initially. Verify other transporter filters, the disabled All carriers button, and audit recovery after a deliberately selected known test record.

No migration action directly changes customer data. The operator must select a carrier, review, type a phrase, and explicitly approve before any process is moved.
