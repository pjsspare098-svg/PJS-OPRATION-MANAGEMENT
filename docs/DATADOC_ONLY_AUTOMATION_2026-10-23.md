# PJS OMS: DataDoc submission is the ONLY automation (23 October 2026)

## Current behavior

- **Control Tower**: no Outlook Reply All Draft Worker indicator, no generic Queued jobs card, no carrier worker indicator. The existing DataDoc submission worker remains visible.
- **Email to Client**: manual Outlook Reply All only. Download or attach original .eml, review and copy dispatch text, send the reply yourself in Outlook, then confirm sent to move the process to Dispatch Tracking. No draft jobs or Outlook worker heartbeat/polling. Confirmation is operator-attested, not automatic proof of email delivery.
- **Dispatch Tracking**: manually open official websites, capture screenshots, and record statuses under each Process No. No automatic Track All.
- **DataDoc**: retain only **Bill Submit** and **Tracking Proof** submissions via authorized Windows worker. Both submit to DataDoc. Remove unfinished DataDoc Email Submit job adapter UI.
- **Settings**: automation and worker pages scoped only to DataDoc. No generic Queued jobs card or Outlook workflow link. Audit & Reports retains historical jobs for safety; DataDoc's own pending submission queue still exists as required to process approved bills.
- **Windows**: START_OFFICE_WORKERS.ps1 and start_worker.py permit only independent_worker.py and datadoc_proof_worker.py. START_OUTLOOK_DRAFT_WORKER.bat is retired and does not start a worker.
- **Backend**: migration 033 rejects new oms_jobs types other than bill_submit or delivery_proof_submit. Blocks all new oms_cloud_jobs; existing Outlook and cloud claim functions return zero jobs. Carrier claim functions were already disabled by migration 030. DataDoc bill and proof claim/finish functions are unchanged.

## Important operational details

These changes do not interrupt or cancel any existing Running jobs or delete processes, private documents, storage objects, or audit events. Historical tracking jobs currently marked Running must be manually reconciled in Audit & Reports, and retired local Python worker processes should be stopped on the office PC. A stale heartbeat alone is not proof a browser/worker has stopped.

DataDoc live submission settings remain **off** until the operator explicitly completes a supervised acceptance test and enables the corresponding switches on the authorized Windows PC. The website cannot turn the Windows worker on or off.

## Verification

- npm run test:datadoc-only as part of the standard npm run build
- run existing email, process attachment, manual tracking and proof regression suites
- run worker/test_start_worker.py in the worker directory
- verify migration 033 and both claim RPC definitions with read-only SQL
- verify existing job counts did not change because of migration
- review one manual email transition and one authorized DataDoc submission in the relevant external systems before claiming full end-to-end operation.
