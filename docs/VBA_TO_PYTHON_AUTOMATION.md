# PJS Operations - VBA to Python conversion (12 October 2026)

This branch adds new adapters to the independent OMS React/Vercel/Supabase project. It does NOT install/start code on an office PC, enable live mail sending, or replace the existing safe DataDoc bill worker.

## Mapping of all 10 uploaded modules

| Original VBA | New Python component | Intended task |
| --- | --- | --- |
| modCustomerDispatchEmail.bas | worker/outlook_reply_agent.py, outlook_mailbox_bridge.py, oms_dispatch_bridge.py | Find attached original conversation and create a native Outlook Reply All draft |
| modDataDocEmailSubmit.bas | worker/datadoc_email_agent.py | Validate exact SENT email proof, select DataDoc work, attach and verify |
| modTrackingEngineMain.bas | worker/tracking_agent.py + carriers.py | Batch tracking, errors, deduplication and statuses |
| modTrackingDataBridge.bas | worker/tracking_agent.py | Structured result/status/date/error output, replacing Excel updates |
| modTrackShreeMaruti.bas | worker/carriers.py | Shree Maruti and Arham Enterprise |
| modTrackVRL.bas | worker/carriers.py | VRL |
| modTrackACPL.bas | worker/carriers.py | ACPL |
| modTrackVExpress.bas | worker/carriers.py | V Express |
| modTrackTCIFreight.bas | worker/carriers.py | TCI Freight |
| modTrackARC.bas | worker/carriers.py | ARC |

## Improvements

- Use a shared Chrome browser session, Selenium explicit waits, 6 carrier-specific methods, aliases, and standardized statuses.
- Classify UNDELIVERED, NOT DELIVERED, OUT FOR DELIVERY and RTO DELIVERED before generic DELIVERED; preserve errors separately.
- Take evidence screenshots for confirmed delivered statuses only.
- Avoid automatically retrying irreversible DataDoc actions or sending email after an uncertain result.
- Reply All on the exact existing Outlook MailItem selected through Message-ID in the configured Windows Classic Outlook account. Recipients remain Outlook-managed. No address extraction.
- Save and display the prepared Outlook reply; the code deliberately does not send anything.
- Use exact process/attachment IDs from independent OMS private storage. Never search old shared folders or guess invoice matches from filenames.
- Include product name, sales person, invoice and carrier details in the drafted response.
- Never copy hardcoded VBA passwords into Python or GitHub. Use local worker .env settings.

## Test and setup

In the worker folder on authorized Windows office PC, with Python 3.12 or newer:

1. Install dependencies: python -m pip install -r requirements.txt
2. Run mock tests: python -m unittest -v test_tracking_agent.py test_datadoc_email_agent.py test_outlook_reply_agent.py test_outlook_mailbox_bridge.py test_oms_dispatch_bridge.py
3. Keep existing PJS_ENABLE_LIVE_DATADOC=0 until a supervised DataDoc bill test has passed.
4. Keep PJS_ENABLE_LIVE_DATADOC_EMAIL=0 until the correct sent-email proof and result verification have passed.
5. Set PJS_OUTLOOK_ACCOUNT_SMTP locally to the authorized account if testing Outlook drafts.

An optional read-only batch tracking test:

python tracking_agent.py --input pending_tracking.json --output tracking_results.json --live

The input JSON is an array of dictionaries containing process_no, transporter, tracking_id, and optionally current_status. This CLI produces only local result JSON; it does not modify OMS data.

DataDoc email submissions require a genuine SENT .eml or .msg proof file with the exact Process No. in its filename. An inbound original conversation is NOT proof of a sent dispatch email.

## Integration status and limitations

- The original independent worker still claims only approved bill_submit jobs. Email reply, carrier tracking and DataDoc sent-email jobs are NOT automatically claimed by this change.
- A dedicated, secure, audited Supabase claim/finish RPC is needed before making these new modules unattended jobs.
- The Outlook bridge searches authorized Inbox and Sent Items for a unique Message-ID in the existing Outlook mailbox. An .eml absent from that mailbox must be manually resolved; no recipient guessing.
- Real Outlook, office DataDoc and live carrier HTML need supervised tests and authorized Windows PC connectivity. Mock tests are not evidence of real carrier availability or successful live sending.
- At least one uploaded VBA module included a hard-coded password. The credential was not copied. Rotate it if still active.

## Logical agent plan

Six logical agents: Process Import, DataDoc Bill Submit, Outlook Dispatch Reply All, Carrier Tracking, Delivery Proof/DataDoc Email, and Job Control/Recovery. They can reuse existing workers and Supabase; no six-server deployment required.
