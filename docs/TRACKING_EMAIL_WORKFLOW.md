# PJS Dispatch Tracking + Customer Email — Fast, Verified Workflow

Scope: **independent** Vercel/Supabase OMS only. Retains existing process data.
The following is the actual implemented path, not a promise that disconnected
office computers can be remotely controlled.

## Office startup and worker status

1. Run `worker/START_OFFICE_WORKERS.bat` on the signed-in authorized office PC.
2. The launcher checks Python and authenticates to independent Supabase with a
   read-only request using `worker/office_preflight.py`; no secrets are printed.
3. If any credential is wrong (the previously observed 401), **all workers
   remain stopped** rather than flooding logs or claiming any jobs.
4. DataDoc, Classic Outlook and Carrier Tracking each heartbeat separately.
   Online means a recent heartbeat; Paused means connected but local live
   execution is disabled. A successful launch message is *not* proof of online.
5. Do not overwrite the office `.env`. The service credential must be for
   `tbkytdktututiyeoqkwa`. All enable/disable switches remain unchanged.

## Customer email workflow

```text
Email to Client
    ↓ Upload original .eml conversation (Message-ID; NO recipient extraction)
    ↓ Validate PO, SO, invoice, dates, weight, carrier and LR
    ↓ Attach invoice PDF + courier LR receipt PDF
    ↓ PREPARE REPLY ALL DRAFT (records approved owner-scoped queue request)
    ↓ Authorized Windows Classic Outlook worker matches exact original message
    ↓ Outlook ReplyAll → insert verified dispatch fields → attach PDFs → Save/Display
    ↓ Operator checks recipients and attachments, clicks SEND inside Outlook
    ↓ I SENT THIS IN OUTLOOK (explicit human attestation, audit records draft job)
    ↓ Dispatch Tracking
```

A draft is **not** a sent email. The website cannot honestly mark an email
sent merely because a draft worker finishes. Sending always remains operator-
controlled until a separately authorized, fully tested, sent-folder verification
workflow is implemented.

The legacy `modCustomerDispatchEmail.bas` has a 2-stage Prepare Drafts →
Approve → Send routine. This independent system instead preserves the *original
Outlook conversation and Reply All recipients*, avoiding reconstructing To/Cc
from stale Excel cells or scanning arbitrary SMB paths.

## Carrier tracking workflow

```text
Dispatch Tracking (after operator confirms email was actually sent)
    ↓ Verify Process No., customer, transporter and LR
    ↓ Only 6 VBA-backed carrier families accepted:
      Shree Maruti/Arham, VRL, ACPL, V Express, TCI Freight, ARC
    ↓ QUEUE TRACK (owner-approved versioned job, no direct browser fetch)
    ↓ Windows Tracking worker claims exactly one job atomically
    ↓ Python Selenium reads CURRENT carrier status (not historical timeline)
    ↓ Normalize conservative statuses:
      Delivered / In Transit / Out for Delivery / Pending / RTO /
      Returned / Undelivered / Cancelled / Delayed / Address Issue / Not Found
      Unknown / CAPTCHA / verification / site error → needs review, NEVER delivered
    ↓ Worker commits outcome & audit to independent Supabase
    ↓ Website displays status, check time, courier details, and job failure reason
        ├─ Delivered → operator opens Delivery Proof
        ├─ In Transit / Pending → leave in Tracking; later explicit recheck
        └─ Exception / Not Found → operator reviews carrier and Check List
```

**Accuracy rules from old VBA (modTrackingEngineMain and TrackingDataBridge):**
- Match by Process No. + transporter + LR, not row index.
- Do not call the same consignment Delivered from ambiguous site text.
- One site outage should not block other carriers/jobs.
- Carrier websites may change or require CAPTCHA; do not bypass verification.
- The six original carrier selectors are preserved in `worker/carriers.py`;
  `src/carrierRegistry.ts` mirrors the original transporter aliases.
- Delivered screenshots are currently stored **locally** under
  `worker/tracking-screenshots`; they are NOT uploaded as cloud delivery proof.
- One approved job is processed once. After a crash or uncertain outcome, do
  not blindly retry a job whose outcome may already have been recorded.

## Button semantics

| Website button | Real behavior |
|---|---|
| Approve & queue for office PC | Approved DataDoc Bill Submit request; not immediate submission |
| Prepare Reply All draft | Creates queued Outlook request; never sends email |
| I sent this in Outlook · Track | Operator confirms manual Send and moves to Tracking |
| Queue track | Starts waiting read-only carrier lookup; status until worker reports |
| Carrier site | Opens official carrier portal for manual verification |
| Delivery Proof | Navigates only after an explicitly verified Delivered carrier result |

## Office acceptance tests before live use

- Test safe PAUSED heartbeat for all three worker modules.
- Test one existing real shipment at its official carrier portal, then compare
  the result against the saved database status. ACPL may require manual human
  verification on its new tracking site.
- Test one original Outlook message, create a Reply All draft, verify exact
  original recipients and attachments and then manually send.
- Verify that interrupted jobs are not duplicated and that older queued jobs
  do not unexpectedly become executable.
- Only enable the corresponding LIVE flag after each supervised test passes.

AI agent enhancements, automatic retry/recovery and unsupervised customer
email sending remain explicitly out of scope for this release.
