# PJS Operations — Outlook Reply All automation

This setup enables **draft preparation only**. It does not send email automatically. Do not install with an administrator/SYSTEM session: use the same signed-in Windows user who has Classic Outlook access to the authorized dispatch mailbox.

## Website workflow

1. Universal Process → open process → verify Process/SO/Party/Invoice and the dispatch details.
2. Email to Client → attach the **original** Outlook email conversation as exactly one .eml.
3. Save the process. Use **Review dispatch preview** and confirm documents.
4. Choose **Queue Reply All draft**. The website creates a versioned, owner-approved, draft-only job in the independent Supabase queue. It may wait safely while the Windows office PC is offline.
5. Windows Outlook worker claims it, matches the original email's Message-ID to **one** actual mailbox message, calls Outlook ReplyAll, inserts process and dispatch information, attaches saved invoice/transport PDFs, and saves/displays the reply draft.
6. **You review recipients and supporting files in Classic Outlook and manually click Send.**
7. In the website click **Confirm sent & track** only after you genuinely sent the email; this records manual confirmation and moves the process to Dispatch Tracking. Draft creation alone is NOT proof of sending.

No customer email addresses are extracted or copied into the PJS application.

## Windows setup (Python 3.12+; Python 3.13 is supported)

Download/update this repository's worker folder to a permanent office PC location. The folder must be writable for logs and temporary files. Open Classic Outlook and sign in to the same account you will use for dispatch. The original conversation must exist in that mailbox Inbox or Sent Items with the same Message-ID as the attached .eml.

In PowerShell (replace the path with the real location):

```powershell
cd C:\PJS\OMS-Worker
py -3 -m pip install -r requirements.txt
py -3 -m unittest -v test_outlook_reply_agent.py test_outlook_mailbox_bridge.py test_oms_dispatch_bridge.py test_outlook_draft_worker.py
Copy-Item .env.example .env
```

If your worker's .env already exists, **do not overwrite it**. Add the new variables instead.

Keep these values in the local .env (never put service keys or passwords in chat, GitHub, Vercel, or the website):

```text
SUPABASE_URL=https://tbkytdktututiyeoqkwa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your existing independent OMS server-only key>
PJS_OFFICE_OWNER_USER_ID=<your personal authorized OMS account UUID>
PJS_OUTLOOK_ACCOUNT_SMTP=<your authorized Classic Outlook sender account>
PJS_OUTLOOK_WORKER_NAME=pjs-outlook-draft-office
PJS_OUTLOOK_POLL_SECONDS=20
PJS_ENABLE_OUTLOOK_DRAFT=0
```

Double-click START_OUTLOOK_DRAFT_WORKER.bat. The website should report **worker connected · paused**. No jobs are claimed while it is paused. The worker stores its logs at worker/logs/outlook-draft-worker.log.

After reviewing one harmless test process, independently confirming the original message exists in Outlook, and confirming all dispatch details, change PJS_ENABLE_OUTLOOK_DRAFT=1 locally and restart the worker. Queue **one** test draft, verify it opens a Reply All draft in Outlook and **does not send**, and review the job state in Email to Client.

If you wish to auto-start after Windows login, configure Windows Task Scheduler to launch the .bat file as the signed-in Outlook user with an interactive desktop; do not run under SYSTEM. Automatic draft creation still requires the local safety flag to be enabled.

## Troubleshooting / safety

- Worker offline → no live agent registered. Queue may still wait in Supabase.
- Original message not found → the saved .eml Message-ID does not match any unique message in the authorized Inbox/Sent Items scanned. Move/find the original in Classic Outlook or resolve manually; do not guess recipients.
- Multiple Outlook .eml attachments → resolve to exactly one original conversation in the process before queueing. Old attachments are not automatically deleted.
- Draft job failed/running unexpectedly → check Outlook Drafts and local logs. **Never automatically retry** an uncertain result.
- Invoice PDF is required by this worker even if website metadata has an invoice number. Attach it before the worker can produce a complete draft.
- Product Name and Sales Person are included from the current process record; missing carrier/LR are marked Pending.
- DataDoc bill worker, bill submission, tracking carrier worker and cloud OCR remain separate. This migration does not change their execution.
- The service-role key is highly privileged; use only the local authorized machine. Never share screenshots exposing it.

## Technical boundaries

Only newly approved 'outlook_draft_v1' jobs with auto_send:false may be claimed using oms_claim_outlook_draft. Legacy queues are not claimed. oms_finish_outlook_draft records draft_saved and email_sent:false. oms_outlook_workers publishes heartbeats visible to the owner through Supabase RLS. A manual cancellation RPC can cancel a still-queued request, never an actively running job.

The current Windows bridge supports Classic Outlook COM. New Outlook/Web or Google Cloud Run cannot directly use the local Windows Outlook COM interface. An alternative mailbox API architecture would require separate authorization and thread-safe Reply All implementation.
