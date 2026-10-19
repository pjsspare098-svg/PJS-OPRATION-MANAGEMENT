# PJS OMS — Shree Maruti tracking agent v2 (19 October 2026)

## What changes

- Dispatch Tracking → Shree Maruti → Upload Excel creates PJS tracking process records from Process No., Credit/Non-Credit, Sales Person Name and Tracking ID. It never overwrites an existing process and does not start tracking.
- Track All queues individually approved Shree Maruti tracking jobs for eligible filtered processes, excluding already delivered, queued or running IDs.
- The office Python worker uses one Chrome session and the October 2026 multi-AWB Shree Maruti page, grouping up to 20 approved jobs in one browser submission per batch.
- The public page at https://shreemaruti.com/track-shipment/ may embed tracking.shreemaruti.com in an iframe. The worker uses the form.search-bar input.search-input selector, the Track button, exact tracked-chip-label, the active chip and matching hero AWB, and the latest section.journey event.
- Carrier outcomes are keyed by the exact (Process No., Tracking ID) pair, never their row order. Returned is never inferred from a progress bar.
- Each job is finished with the preexisting oms_finish_tracking RPC, which checks the Process UUID, account, stage, carrier and Tracking ID once more, then updates trackingStatus, trackingDetail, trackingCheckedAt and trackingDeliveryDate in that process, with job result/audit/notification.
- Confirmed Delivered screenshots are named by Process + AWB and added to the private oms-documents bucket as trackingShotDoc for that process only AFTER successful status persistence. If screenshot saving/upload fails, the verified status remains recorded, but no screenshot is claimed.
- Ambiguous results, changed site selectors, missing chips and mixed AWB/hero labels fail closed as Error; never report Delivered or Not Found without a recognized latest event.
- Other carrier workers, DataDoc and Outlook remain unchanged.

## Required safe database update

Apply the included migration: supabase/migrations/028_shree_maruti_batch_claim.sql, to the independent Supabase project. The new owner-scoped, service-role-only RPC oms_claim_approved_shree_maruti_batch claims a maximum of 20 previously approved tracking jobs. It never creates/approves new jobs.

## Office Windows activation — keep LIVE=0 until verified

1. Ensure the existing office worker's local .env includes PJS_ENABLE_LIVE_TRACKING=0 and PJS_SHREE_MARUTI_BATCH_SIZE=20. Keep DataDoc Proof separately paused. Do not share or overwrite secrets.
2. After the GitHub PR is merged, stop the old tracking worker and replace its Python source files from the latest main branch. Preserve local .env, screenshots and logs.
3. Install dependencies with the existing Python: & "C:\Users\vivek.pal\Python313\python.exe" -m pip install -r ".\requirements.txt"
4. Run offline unit tests from the worker directory: & "C:\Users\vivek.pal\Python313\python.exe" -m unittest -v test_shree_maruti_batch.py test_shree_tracking_persistence.py test_dispatch_tracking_worker.py test_tracking_agent.py
5. Run the carrier worker, not the separate Proof worker: & "C:\Users\vivek.pal\Python313\python.exe" start_worker.py dispatch_tracking_worker.py
6. Open Dispatch Tracking → Shree Maruti and confirm heartbeat mode shree_maruti_verified_batch_v2 is PAUSED. Legacy heartbeat modes mean the old worker is still running.
7. Prepare two approved, currently traceable AWBs for different OMS Process Nos., with *known different current statuses*. Independently verify exact statuses on the public Shree Maruti site.
8. Queue those two with Track All. To begin the supervised live test only, change PJS_ENABLE_LIVE_TRACKING=1 LOCALLY and restart the carrier worker. Observe a single comma-separated carrier search, both selected AWB chips and hero labels.
9. Cross-check each process-specific status, latest event date/details, audit entry and (for Delivered) saved private screenshot on the PJS website against the carrier UI.
10. If either Process No. is mixed up or there is any failed/uncertain completion, STOP the worker and revert PJS_ENABLE_LIVE_TRACKING=0. Check logs/dispatch-tracking.log; do not reset or auto-retry claimed jobs until reconciled.

## Important limitations

- CI can test mapping, queue calls, fake Selenium DOM and screenshot storage without internet. It CANNOT certify Shree Maruti's real dynamic DOM on the authorized Windows PC. Conduct supervised acceptance before using live automation.
- The worker runs under the Windows office user. The website/Vercel cannot launch or control that local Chrome browser.
- The website never treats an In Transit screenshot as proof of receipt in DataDoc. This carrier tracking worker does not submit documents or emails.
- If a job was committed but the completion response was lost, do not retry the carrier job automatically.

## Regression tests

- worker/test_shree_maruti_batch.py: multi-AWB verification, out-of-order response, duplicated AWBs under separate processes, one bounded read-only retry, latest-event precedence, screenshots and conservative failures.
- worker/test_shree_tracking_persistence.py: exact per-job Supabase identities, failed mapping, stale LR rejection, photo privacy, no evidence upload before status commit, paused settings.
- Existing worker tests remain in the GitHub Actions test workflow.
