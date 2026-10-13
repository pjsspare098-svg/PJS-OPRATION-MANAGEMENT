# Dispatch Tracking — PJS Independent OMS

Status: the browser queues explicitly approved tracking jobs; the Windows tracking
worker performs carrier lookups and writes verified results. **Never claim that a
queued request has been executed.** Office acceptance tests are required before
enabling live carrier access.

## One-time deployment

1. Apply `supabase/migrations/020_tracking_office_worker.sql` **only** to the
   independent Supabase project `tbkytdktututiyeoqkwa`. The migration is additive
   and does not approve legacy tracking jobs.
2. Release the matching website version and update the office `worker` folder.
   Existing local `.env` MUST NOT be overwritten by `.env.example`.
3. On the authorized office PC, open PowerShell in the worker folder and run
   `& "C:\Users\vivek.pal\Python313\python.exe" -m pip install -r requirements.txt`.
   This worker uses Selenium Chrome, with the office network and authorized user.
4. Set `SUPABASE_URL` to the independent OMS URL, and set the matching
   `SUPABASE_SERVICE_ROLE_KEY` and `PJS_OFFICE_OWNER_USER_ID` locally. Do not
   put private keys in GitHub, chat, or screenshots. Keys must be for **the same**
   project; a Supabase 401 means the service credential still needs correction.
5. Add to local `.env`:
   ```
   PJS_TRACKING_WORKER_NAME=pjs-carrier-tracking-office
   PJS_TRACKING_POLL_SECONDS=20
   PJS_ENABLE_LIVE_TRACKING=0
   ```
6. Start in PAUSED mode:
   `& "C:\Users\vivek.pal\Python313\python.exe" .\start_worker.py dispatch_tracking_worker.py`
   Check **Dispatch Tracking** shows a fresh heartbeat marked **Paused**.
7. Prepare ONE authorized shipment in Dispatch Tracking with a verified transporter
   and LR. Click **Queue track** on the website. Confirm it appears as queued.
   It will not run while the flag is 0.
8. After office acceptance and verification of that exact carrier URL/LR, set
   `PJS_ENABLE_LIVE_TRACKING=1` locally, restart the tracking worker, and observe
   that single job complete or fail. Check the carrier website manually against
   the stored result. If the site has a CAPTCHA or unsupported layout, pause and
   correct the adapter rather than bypassing it or fabricating a Delivered status.
9. `START_OFFICE_WORKERS.bat` starts DataDoc, Outlook draft and Tracking workers
   using `start_worker.py` and finds `Python313\python.exe`. Disabled workers
   report paused; this script does **not** enable any external action.

## Website behavior

- Only a process owner can authorize a tracking request; only the authorized
  service-role office worker can claim and finish it.
- Requests are versioned `carrier_track_v1`, require explicit approval,
  and must match the current process, carrier, LR, and Dispatch Tracking stage.
- One job per process/type may be queued or running; a claim locks a single row.
- Carrier results are read-only. Delivered must come from an actual carrier result;
  uncertain/error statuses never become Delivered.
- The worker stores result/detail/date in `oms_jobs` and `oms_processes.data`;
  screenshots remain **local to the office PC**.
- After a verified Delivered result, the website offers **Delivery Proof**.
  No delivery-proof submission happens automatically from carrier tracking.
- A crashed/uncertain claimed job stays **running** for manual reconciliation.
  Do not blindly requeue, retry, or reset it.
- Client email sending is separate: Outlook worker makes **drafts only**.
  Review recipients and attachments in Classic Outlook, manually Send, then
  confirm sent in the website.

## Logs and safety

Tracking logs: `worker/logs/dispatch-tracking.log`. Browser shows online worker
status only for heartbeats newer than 90 seconds. Both browser and SQL validate
owner/process identity. No secret credentials are sent to the browser.

To stop tracking, press Ctrl+C or set `PJS_ENABLE_LIVE_TRACKING=0` and restart.
Do not close Chrome during a lookup.

Unit tests:
`python -m unittest -v test_tracking_agent.py test_dispatch_tracking_worker.py`.
