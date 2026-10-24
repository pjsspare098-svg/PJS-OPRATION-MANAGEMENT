# New optional Outlook SEND worker — 25 October 2026

In addition to the approved DataDoc submit workers, users may now **explicitly approve real Outlook Reply All sends** from the Email to Client page. The **separate** `outlook_send_worker.py` performs the Send only when its private `PJS_ENABLE_LIVE_EMAIL_SEND=1` switch is enabled after supervised setup. DataDoc remains unchanged. The previous `outlook_draft_worker.py` and carrier tracking worker remain retired.

The normal `START_OFFICE_WORKERS.ps1` shortcut intentionally starts DataDoc workers **only**; it does NOT automatically start the email sender. Read `docs/OUTLOOK_EMAIL_SEND_SETUP_2026-10-25.md` before enabling any real send.

---
# CURRENT POLICY (23 October 2026): DataDoc-only automation

**Only DataDoc bill submission and DataDoc tracking-proof submission may run automatically in the authorized Windows office environment.** Outlook Reply All and all carrier lookups are manual. Cloud background audit/extraction agents are retired. The website, SQL guards and START_OFFICE_WORKERS.ps1 enforce this.

Run only `independent_worker.py` and (after a verified supervised test) `datadoc_proof_worker.py`. Keep live flags off until an authorized supervised DataDoc acceptance test. Do not run old `outlook_draft_worker.py` or `dispatch_tracking_worker.py`. The launcher rejects those scripts.

The historical notes below document earlier capabilities and are **not current operational instructions** wherever they discuss Outlook, carrier tracking, Track All, or unrelated cloud workers.

---

# Independent PJS OMS — Windows Login DataDoc Worker

The independent website stays hosted on Vercel. DataDoc submissions stay safely queued in **independent Supabase** when the office PC is switched off. After Windows sign-in, Task Scheduler starts a dedicated Python worker. The worker connects to the private office DataDoc website, claims approved jobs, submits one bill at a time, and writes outcomes and notifications back to Supabase.

**This worker handles only \`bill_submit\` jobs.** Tracking, delivery-proof and Outlook adapters are separate projects. No PC is required for cloud OCR, Excel, AI chat or tasks.

## Important: Website cannot launch Python

Browser security prevents opening the PJS website from directly starting an arbitrary local Python program. Install \`install_autostart.ps1\` once as the actual office Windows user. Windows Task Scheduler will then start the worker on Windows **sign-in**, whether or not the browser is open. Selenium normally requires that user to remain signed in with an interactive desktop. Do not run it as SYSTEM.

## What was changed safely

- \`oms_jobs.office_execution\` defaults to \`manual\` for all old rows. No old/past job becomes auto-executable by migration.
- Clicking **Approve & queue for office PC** on a bill-ready process creates a **new, approved \`auto_on_login\`** job for that account.
- Database RPC \`oms_claim_approved_office_bill\` claims at most one queued job atomically. No two workers can claim the same job.
- The independent worker uses \`oms_processes\`, \`oms_documents\` and private \`oms-documents\` storage, **not the old** \`shipments\` / \`automation_jobs\` / \`pjs-process-documents\`.
- It validates Process No., party, SO No., credit category, positive amount, original Pick Slip, Invoice PDF, E-Invoice PDF and E-Way Bill PDF if **amount exceeds ₹50,000** before opening DataDoc.
- Outcomes are stored with \`oms_finish_approved_office_bill\` in one transaction, with an audit entry, a PJS in-app notification and an automatic move to **Email to Client** only on confirmed success.
- **Any failure or uncertain/partially completed submission is NOT automatically retried.** Check the real DataDoc process first; only then manually queue another job if required.
- Status heartbeat appears in **DataDoc → DataDoc pending submission queue**.

## One-time office PC setup (Windows 10/11)

1. Log in to the Windows account that is authorized to access DataDoc. Confirm that \`http://192.168.0.18:8082\` (or the office's actual DataDoc URL) loads on this PC while connected to the office network.
2. Install Python 3.12+ and Google Chrome (the existing Python 3.13 is supported). In the independent project's GitHub repository, download the \`worker\` directory (download the repository ZIP if needed), and extract it to a permanent folder, such as \`C:\PJS\OMS-Worker\`.
3. Open **PowerShell** in that folder and run:
   \`& "C:\Path\To\python.exe" -m pip install -r requirements.txt\`
4. Copy \`.env.example\` to \`.env\`:
   \`Copy-Item .env.example .env\`
5. Edit **only the local** \`.env\`, supplying:
   - \`SUPABASE_SERVICE_ROLE_KEY\`: **independent OMS** Supabase server-only key, directly from the independent Supabase dashboard. Never paste it in chat, GitHub, browser or screenshots.
   - \`PJS_OFFICE_OWNER_USER_ID\`: UUID for the OMS user who will queue bills. Find the UID under **Supabase → Authentication → Users**.
   - \`PJS_DATADOC_URL\`, \`PJS_DATADOC_USERNAME\` and \`PJS_DATADOC_PASSWORD\`: the working private office connection and authorized account.
   - Keep **\`PJS_ENABLE_LIVE_DATADOC=0\`** during the first configuration check.
6. Run the worker manually with live execution paused:
   \`& "C:\Path\To\python.exe" .\independent_worker.py\`
   Check **DataDoc → pending submission queue**. It should show **Worker connected · paused**. Logs are kept locally in \`logs\datadoc-worker.log\`. Press Ctrl+C to stop.
7. **Before enabling real actions**, select ONE known safe bill process; check DataDoc manually and confirm it has not already been submitted. On the website select **Approve & queue for office PC**. The job must show **Waiting for office PC**.
8. Once the office operator has verified the DataDoc account, uploaded document mapping and the test process, set \`PJS_ENABLE_LIVE_DATADOC=1\` in the local \`.env\`, then run the worker manually. Observe the actual DataDoc session and confirm the single test outcome and uploaded documents **inside DataDoc**.
9. After that single supervised test succeeds, install automatic Windows sign-in startup:
   \`powershell -NoProfile -ExecutionPolicy Bypass -File .\install_autostart.ps1 -PythonExe "C:\Path\To\python.exe"\`
   The command registers a per-user Task Scheduler task: **PJS OMS DataDoc Worker**.
10. At your next Windows sign-in, Task Scheduler starts \`independent_worker.py\`. It waits for office DataDoc to be reachable, polls approved pending bill jobs and runs them sequentially. The PJS browser may be open or closed.

## Stop, troubleshoot, uninstall

- **Pause execution:** set \`PJS_ENABLE_LIVE_DATADOC=0\` and restart the worker; new approved bills remain queued. If already submitting, wait for the current DataDoc operation to finish; do not close Chrome mid-submit.
- **Inspect status:** DataDoc → Pending Submission Queue or \`logs\datadoc-worker.log\`.
- **Remove startup task:** \`powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_autostart.ps1\` (does not delete cloud jobs, documents or secrets).
- **Network inaccessible:** worker remains paused and leaves jobs queued. Check office VPN/Wi-Fi and DataDoc itself.
- **Status remains RUNNING after a crash:** DO NOT manually reset to queued until the exact DataDoc transaction has been checked. Failed/uncertain submits may have partly succeeded.
- **Office worker remains offline:** Task Scheduler must run only when the target Windows user is signed in; check Python executable path and logs. Chrome/DataDoc may require an unlocked desktop.
- **User ownership:** this worker only claims jobs from \`PJS_OFFICE_OWNER_USER_ID\`; work queued by other users remains pending until a worker is registered for them.

No machine has been configured just by committing these files to GitHub. Only installing the scheduled task on the real Windows PC enables auto-start.

## Security notes

The \`.env\` must not be committed. The repository's \`.gitignore\` excludes \`.env\`. Keep the independent Supabase project isolated from legacy systems. A service-role key has broad database permissions: store it only on the trusted office PC in a protected directory, rotate it if exposed, and ideally migrate to a limited-scope worker credential later. Workstations can be disabled by pausing or removing the task; job history remains in Supabase.

## Outlook Reply All (new adapter, draft-only until integration is tested)

\`outlook_reply_agent.py\` provides a separate Reply All draft-preparation step.
It takes the **verified original Outlook MailItem**, calls Outlook's native
\`ReplyAll()\`, inserts escaped process/dispatch information, attaches
locally verified dispatch files, saves a draft and displays it. The agent
does **not** extract or save recipient addresses and does **not** call Send().

The website queues an \ `email_reply` job with the exact stored \ `.eml`
document ID plus Process/SO/invoice/carrier details, never email addresses.
No Outlook worker claims these jobs yet: only DataDoc \ `bill_submit` is
executable by the existing independent worker. The Windows bridge that opens
the correct \ `.eml` in Classic Outlook, resolves the matching MailItem,
requests operator approval, sends the final reply and confirms sent status
will be implemented after reviewing the user's original VBA and testing on
the authorized office PC. Never mark queued Outlook jobs as completed or
automatically retry an uncertain sent state.

Safe tests: from \ `worker\` run
\`python -m unittest -v test_outlook_reply_agent.py\`.
Requires Python 3.12+. No Outlook installation or secrets are needed for
the mock tests. Actual Outlook COM automation will require Windows desktop
Outlook and the appropriate approved Python dependencies.


## Start both office workers together (DataDoc + Outlook drafts)

After installing dependencies and configuring the **existing** local `.env` (do not overwrite a working configuration), on the authorized Windows PC open the worker folder and double-click `START_OFFICE_WORKERS.bat`. This opens two independent Python processes using the current Windows account:

- `independent_worker.py` handles approved DataDoc `bill_submit` jobs.
- `outlook_draft_worker.py` handles approved, versioned Outlook **Reply All drafts only**, with **no automatic Send**.

The launcher never turns on `PJS_ENABLE_LIVE_DATADOC` or `PJS_ENABLE_OUTLOOK_DRAFT`. When set to 0 the worker reports **Paused** after connecting, and external execution remains off. Turn a live flag on only after its individual supervised acceptance test has succeeded. A failed connection appears in the local logs; the browser cannot force the Windows process online.

Refresh **Control Tower → System readiness** to see real Supabase heartbeats for both workers. It will show **Offline** if a heartbeat was not received recently, **Paused** if a worker is configured but execution is disabled, or **Online/Busy** when its actual heartbeat reports it. The Carrier Tracking adapter still requires a separate authenticated queue integration and is not an always-online worker.

If configured DataDoc and Outlook both require automatic startup after Windows login, use the existing `install_autostart.ps1` for DataDoc, and configure the Outlook draft worker separately using a per-user interactive desktop task after a supervised test. Do not run Outlook under SYSTEM. Keep all keys in `worker/.env` locally.


## DataDoc Tracking Proof (separate authorized Windows worker)

This is **not** the DataDoc ZIP bill submit. Open **DataDoc → Delivery Proof** in PJS. Processes in **Dispatch Tracking** with a saved tracking screenshot also appear. Choose an exact saved screenshot, review the credit category and Sales Person, and click **Approve & Queue Tracking Proof**. You are authorizing a **real DataDoc Submit**, not just an upload preview.

- Work/Time: `Original Doc. And Mtrl Rcvd. Conf. - India GST`.
- Credit: Next Required Work `Credit`, response user selected from the salesperson.
- Non Credit + Deepa Bisht: Next Required Work `Close - Client Spares`, response user `Deepa Bisht` ONLY.
- Non Credit + Ankita Dahake: `Close - Client - Pump` or the verified `Close - Client Pump` alias, response user `Ankita Dahake` ONLY.
- Unmapped Non Credit salespeople require operator review; they are **not** silently skipped.
- The worker clears pre-selected users, selects the intended response user, attaches only that process's saved JPG/PNG screenshot, clicks Submit once, verifies the Work/Time transaction in DataDoc and closes only its own Selenium browser after confirmed success.
- Failed/uncertain submissions are **never retried automatically**, because DataDoc may already contain a partial or complete transaction. Verify manually before any further action.
- It does not alter the process's actual delivery status or complete the workflow automatically.

### Setup on the DataDoc-connected Windows machine

1. Update the entire `worker/` directory from GitHub and install `requirements.txt` using Python 3.12+.
2. Keep existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PJS_OFFICE_OWNER_USER_ID` and DataDoc credentials in the local `worker/.env`. Never copy them to GitHub or Vercel.
3. Add `PJS_ENABLE_LIVE_DATADOC_PROOF=0` and `PJS_PROOF_POLL_SECONDS=20`. Running `python start_worker.py datadoc_proof_worker.py` in this state shows a **paused** heartbeat and will not claim proof jobs.
4. After manually checking one known process, its salesperson and actual DataDoc Work/Time labels, set `PJS_ENABLE_LIVE_DATADOC_PROOF=1` **locally**, restart the worker, and watch the first approved test submission. Confirm the screenshot and transaction in DataDoc yourself.
5. `START_OFFICE_WORKERS.bat` can launch the proof worker alongside other workers without enabling any live switch. The PJS website cannot access the local DataDoc address by itself.

Logs: `worker/logs/datadoc-proof.log`. Never reset a `running` or `failed` job to `queued` until the exact DataDoc transaction is reconciled.


## Shree Maruti batch tracking v2 (separate worker)

See docs/SHREE_MARUTI_BATCH_AGENT_2026-10-19.md in the repository.

The Dispatch Tracking Excel import creates process-specific tracking records.
Track All queues up to 20 eligible carrier IDs per group, with the authorized
tracking worker claiming those jobs atomically through the new 028 migration.
The Python adapter now opens https://tracking.shreemaruti.com/ directly,
matches the exact AWB even when a single-ID result has no chip, reads the green
current progress marker and the authoritative latest Shipment Journey event,
persists status to **its own** OMS Process No., and uploads a result screenshot
for every successfully verified Shree Maruti tracking status (not only Delivered)
to private OMS documents. Read docs/SHREE_MARUTI_DIRECT_TRACKER_2026-10-19.md.

Keep PJS_ENABLE_LIVE_TRACKING=0 until the new Python files have been installed
on the office PC and two distinct AWBs are verified in a supervised carrier
test. The other DataDoc Proof live switch is unrelated and must remain disabled.

Use the carrier worker entry point (not the proof worker):
& "C:\Users\vivek.pal\Python313\python.exe" start_worker.py dispatch_tracking_worker.py

Check worker/logs/dispatch-tracking.log and Dispatch Tracking → Shree Maruti for
the actual heartbeat. NEVER copy or overwrite a local .env when updating files.
