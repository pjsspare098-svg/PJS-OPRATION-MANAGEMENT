# Outlook Reply All Send — PJS OMS (25 October 2026)

## What changes

Email to Client now has a **Send Email** action per Process No. It first opens a review panel. Select the original Outlook .eml, Invoice PDF and LR PDF, review the dispatch information, tick the authorization checkbox and type **SEND <Process No.>**. This queues a request; **the website never directly sends mail**.

A separate Python 3.13 Classic Outlook worker claims approved requests from private Supabase using an office-only service key. Outlook ReplyAll() preserves recipients and conversation history from exactly one matching Message-ID in the authorized mailbox. The worker attaches the approved invoice and LR files. The sender is OFF by default.

## Configure authorized Windows office PC

1. Update the local worker folder from the current GitHub repository. Preserve your local private `.env`; do NOT overwrite it or share screenshots of its contents.
2. Use Classic Outlook for Windows with the authorized dispatch account already signed in. The original conversation must be in its Inbox or Sent Items. New Outlook and Outlook Web cannot run this COM adapter.
3. Install the worker requirements with `& "C:\Users\vivek.pal\Python313\python.exe" -m pip install -r .\requirements.txt` from the worker directory.
4. In the existing **private** `.env`, configure `PJS_OUTLOOK_ACCOUNT_SMTP` to the authorized sending account. Add `PJS_ENABLE_LIVE_EMAIL_SEND=0`, `PJS_EMAIL_WORKER_NAME=pjs-outlook-send-office`, `PJS_EMAIL_POLL_SECONDS=20`. Keep the existing independent SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PJS_OFFICE_OWNER_USER_ID.
5. Run read-only preflight and unit tests: `& "C:\Users\vivek.pal\Python313\python.exe" -m unittest -v test_outlook_send_worker test_outlook_reply_agent`.
6. Start the standalone worker in PAUSED mode: `& "C:\Users\vivek.pal\Python313\python.exe" start_worker.py outlook_send_worker.py`. This only sends a heartbeat; no job is claimed or sent.
7. Complete one authorized supervised end-to-end acceptance test: verify the original .eml corresponds to a real Outlook message, validate its Reply All recipients, invoice and LR PDFs, sender account, and message contents in Outlook manually. Only then may an authorized operator privately change PJS_ENABLE_LIVE_EMAIL_SEND=1 and restart the separate worker to process a specific approved test request.
8. After Outlook Send returns, verify Sent Items and the PJS event log. A completed request means Outlook accepted the Send invocation; **not** confirmation of recipient delivery.

## Important safety

- Previous DataDoc Bill Submit and Tracking Proof automations are unchanged. The retired Outlook DRAFT and carrier workers remain disabled.
- START_OFFICE_WORKERS.ps1 intentionally does not automatically start the email sender.
- Requests are owner-only, exact Process No. and document IDs, must have complete dispatch fields, and require typed approval.
- At most one non-cancelled request exists per process. An unsent queued request can be cancelled, but a running/completed/review_required request cannot be retried automatically.
- Every worker claim is one-way: after a crash or uncertain Outlook Send it remains Running or Review Required. Check the real Outlook Sent Items and Outbox before resolving; a later send could be a duplicate.
- Email recipient addresses are never extracted from the original .eml for storage or invented by PJS. Outlook ReplyAll() uses only its authorized source message.
- Attachments are owner/private-storage validated and must have valid PDF signatures. The process must still be in Email to Client and match the approved update timestamp.
- The worker does not run on Vercel; it requires the authorized Windows office PC.

## Implementation

- Migration: supabase/migrations/034_outlook_send_explicit_approval.sql; separate private queue and four RLS-restricted RPCs.
- Site: src/EmailToClientWorkflow.tsx, src/EmailSendReview.tsx, src/emailSend.ts, src/emailSendApi.ts.
- Worker: worker/outlook_send_worker.py, reusing the existing mailbox and dispatch bridges.
- Tests: tests/emailSendApproval.test.mjs and worker/test_outlook_send_worker.py.

Migration/deployment itself sends no email, changes no existing process, and does not start any worker.