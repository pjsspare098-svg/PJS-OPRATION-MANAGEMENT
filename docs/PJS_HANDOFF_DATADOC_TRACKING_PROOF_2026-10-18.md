# PJS Operations — Progress Checkpoint
**Checkpoint date:** 18 October 2026  
**Project:** PJS Operations / PJS independent OMS  
**Live website:** https://pjs-oms-independent-pjsspare098-2655.vercel.app/  
**Source repository:** https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT  
**Supabase:** Independent project `tbkytdktututiyeoqkwa` (private process/doc storage)

> This file records implementation progress, not evidence that a customer's DataDoc transaction was submitted. Do not enable a live worker or requeue an uncertain DataDoc job without manual reconciliation.

## Completed and implemented

1. **Universal Process — extracted client email recipients:** extract all addresses from Outlook conversation text, deduplicate, save into the existing Client Email field, display saved recipients in Email to Client and dispatch drafts. Review recipients before sending.
2. **Universal Process — Transfer Process:** destination selector and `Save & Transfer` for workflow stages; retain the original process and attachments. Check active queued/running jobs and completion rules; transfer does not trigger DataDoc, email, or tracking automation.
3. **Dispatch Tracking — Transport mode:** Non-trackable / Shree Maruti / Transport categories, transporter and status filters, row-level Track and Transfer To controls, desktop table/mobile cards. Supported manual carrier labels: VRL, TCI Freight, TCI Express, V Express, V Trans, ACPL, ARC, DTDC.
4. **Tracking screenshots and manual status:** capture a permitted browser tab or upload JPG/PNG; save under the exact private process as `trackingShotDoc`. Screenshot OCR for Transport mode **removed** at user's request. Operator manually selects carrier status and types tracking result details (up to 600 characters); display them in Carrier result as **not carrier-worker verified**. Do not infer delivery from this field.
5. **DataDoc Tracking Proof — new workflow:** DataDoc > Delivery Proof displays screenshot-backed processes and a screenshot choice, credit category, salesperson, planned Work/Time, Next Required Work/User and owner approval to queue an actual DataDoc transaction. Distinct from bill ZIP submission.
6. **Supabase migration 027:** `oms_datadoc_proof_workers` heartbeat table; owner-only `oms_approve_datadoc_tracking_proof` approval RPC; service-role-only atomic claim and finish RPCs. Claim binds the process, its owner, saved screenshot, credit category and salesperson. No automatic requeue after failed/uncertain external submission. Existing process delivery status is not marked Delivered by this.
7. **Windows Python proof worker:** `worker/datadoc_proof_worker.py` with process/document validation, private screenshot download, invocation of the hardened `DataDocAgent.submit_tracking_proof` method, database job result reporting. The worker is configured separately from the existing bill worker and is disabled by default in `worker/.env.example` (`PJS_ENABLE_LIVE_DATADOC_PROOF=0`).
8. **DataDoc Selenium flow implemented:** search exact `txtGlobalProcessNo`, choose matching autocomplete process, Add, Work/Time `Original Doc. And Mtrl Rcvd. Conf. - India GST`, route Next Required Work, clear previously checked Next Response User selections, choose the salesperson, attach approved screenshot to `cphContent_fileAttachment1`, click Submit **once**, confirm a matching transaction in DataDoc history and close only the Selenium-controlled browser **on confirmed success**.
9. **Existing workers untouched in behavior:** bill submission, carrier tracking and Outlook workflows remain separate; worker launcher/preflight includes the new proof worker without changing live flags.

## DataDoc mapping currently implemented

| OMS credit / salesperson | Next Required Works | Only Next Response User |
| --- | --- | --- |
| Credit / configured salesperson | Credit | Salesperson matched in DataDoc |
| Non Credit / Deepa Bisht | Close - Client Spares | Deepa Bisht |
| Non Credit / Ankita Dahake | Close - Client - Pump (fallback Close - Client Pump) | Ankita Dahake |
| Non Credit / others | Block pending mapping review | No submission |

**Screenshot reference process:** 292864, Shree Samarth Hydro Jet Systems Pvt. Ltd., Non Credit, salesperson Deepa Bisht. Previously captured transport result was *In Transit*. Do not treat it as delivered/received, or as authorization to submit proof, without operator review.

## Verification to date

- GitHub PR #21 merged into `main` with DataDoc Proof workflow changes: https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/pull/21
- Vercel production deployment was observed **READY** after that merge; automated website checks and proof safety tests passed.
- Independent Supabase migration 027 successfully applied; permission check confirmed authenticated process owner can approve but cannot claim proof jobs (claim reserved for service role).
- **Not verified yet:** actual Windows worker installation, connectivity to private office DataDoc, interactive Selenium session, user checkbox selection on the real portal, proof upload acceptance, actual transaction confirmation, and browser closure in a live end-to-end test.

## Resume HERE — Windows worker setup required

On the authorized Windows office PC or Windows server with access to the private DataDoc host:

1. Obtain current repository ZIP, update the existing `worker` directory (including `datadoc_proof_worker.py`, `datadoc.py`, `start_worker.py`, preflight/launch scripts). **Back up and preserve the local `worker/.env`; never overwrite it with `.env.example`.**
2. Install Python dependencies: `python -m pip install -r requirements.txt`.
3. Verify that the configured `PJS_DATADOC_URL` opens from that machine (office screenshot URL: `http://192.168.0.18:8082`). This address is private; Vercel/cloud services cannot normally reach it.
4. In existing **local** `worker/.env`, set `PJS_ENABLE_LIVE_DATADOC_PROOF=0` and `PJS_PROOF_POLL_SECONDS=20`. Retain local `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, owner UUID, and DataDoc credentials; never paste secrets into chat or commit them.
5. Run `python office_preflight.py` and `python start_worker.py datadoc_proof_worker.py` from the `worker` folder; expect the new DataDoc proof worker heartbeat to show **Paused** in **DataDoc > Delivery Proof**.
6. Check for existing submissions for the intended process **manually in DataDoc first**. Review screenshot purpose, salesperson, credit category, Work/Time and destination. An In Transit screenshot does not prove delivery.
7. Supervise a **single authorized test** on an approved, appropriate record only after choosing to enable `PJS_ENABLE_LIVE_DATADOC_PROOF=1` locally and restarting the worker. Check the actual transaction and attachment in DataDoc; do not blindly requeue if completion is uncertain.
8. Only after successful supervised acceptance should unattended startup be considered.

## Important boundaries

- Local DataDoc automation has **not** been executed by the assistant. No customer transaction is claimed as submitted.
- A saved screenshot/manual tracking note is *unverified evidence*, not a confirmed delivery.
- DataDoc Tracking Proof is separate from DataDoc bill ZIP and separate from carrier tracking.
- Never hardcode usernames/passwords or service-role keys in website code, GitHub, or Vercel.
- If DataDoc Submit was clicked and the outcome is uncertain, investigate the portal and do not automatically retry.
