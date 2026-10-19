# PJS OMS — DataDoc Tracking Proof live verification handoff
**Checked 19 October 2026.** Independent Supabase project: `tbkytdktututiyeoqkwa`.
Production: https://pjs-oms-independent-pjsspare098-2655.vercel.app/

## What has been verified remotely (READ-ONLY)
- Independent Supabase project reports ACTIVE_HEALTHY.
- `oms_datadoc_proof_workers` exists and the approval, atomic claim and finish RPCs exist.
- Tracking-proof migration is recorded as applied.
- **No registered proof-worker heartbeat** exists yet.
- **No `delivery_proof_submit` jobs** exist yet.
- There are three `trackingShotDoc` screenshots for Process 292864, but that process is currently **Check List / Exception**, with last manual tracking status **In Transit**. It is **not** a valid live delivery-proof acceptance candidate.
- Process 290219 is in DataDoc and has no tracking screenshot.
- **No eligible proof processes** are currently at Dispatch Tracking or Delivery Proof stage with an attached tracking screenshot.
- The existing *bill* worker is a separate adapter. Its historical heartbeat cannot confirm this *proof* worker is installed.

## Next acceptance stage: authorized Windows office machine
The DataDoc host is an office-private portal (example `http://192.168.0.18:8082`). Verification requires a Windows desktop/session on the office network, or authorized remote access to such a session. Browser/Vercel cannot launch Windows Selenium or access private IPs automatically.

1. Back up local `worker/.env`; update the worker code from `main` without overwriting that file.
2. Open PowerShell in the local `worker` folder with a configured Python 3.12+ installation.
3. Install dependencies if missing: `python -m pip install -r requirements.txt`.
4. In local `.env`, keep `PJS_ENABLE_LIVE_DATADOC_PROOF=0` and `PJS_PROOF_POLL_SECONDS=20`. **Do not share/commit credentials.**
5. Test that the private DataDoc host opens in the office browser. Use `Test-NetConnection 192.168.0.18 -Port 8082` from PowerShell if this remains the configured host.
6. Run `python office_preflight.py` (read-only credential and module check).
7. Run `python start_worker.py datadoc_proof_worker.py`. This holds the terminal open, writes a fresh paused heartbeat and **never claims/submits any job while proof live flag is 0**. A second launch is prevented by the per-worker lock.
8. Refresh **PJS OMS → DataDoc → Delivery Proof**. Confirm worker status **Paused**; the paused heartbeat can also be verified via `oms_datadoc_proof_workers` in Supabase. Stop with Ctrl+C when ready.
9. Nominate an appropriate, actually verified screenshot-backed process after resolving any active Check List exception and confirming the destination/Work/Time labels, owner and screenshot. **Never use an In Transit screenshot as proof of delivery.**
10. Before any real submission, manually verify that there is no preexisting matching transaction in DataDoc. Ensure the process owner explicitly authorizes the single test. **Only then**, locally enable `PJS_ENABLE_LIVE_DATADOC_PROOF=1`, restart the worker and supervise exactly one approved queued job.
11. Verify the actual transaction and attached screenshot in DataDoc plus a completed audit job; if submission is uncertain or failed, **do not requeue automatically**. Investigate in the private DataDoc portal first.

## Constraints
- No DataDoc transaction, database job or live flag was created or changed during the remote-readiness check.
- A successful website build, a healthy database, or a paused heartbeat is **not** evidence of a successful real proof submission.
- Browser automation must run with the authorized interactive Windows account. Secrets stay in local `.env`, not this repository.
