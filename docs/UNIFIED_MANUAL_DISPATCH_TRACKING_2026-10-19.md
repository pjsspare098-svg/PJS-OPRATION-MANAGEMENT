# PJS Operations — unified MANUAL Dispatch Tracking (19 Oct 2026)

Operator decision: remove AI Command Center from website navigation and stop automated courier tracking. Shree Maruti and all supported transporters now use one manual tracking flow. Existing customer processes, private screenshots, DataDoc workflows, Outlook and audit history remain preserved.

## Website workflow

- AI Command Center is removed from sidebar, route, task bell shortcut and mobile navigation options. Existing cloud tasks and records are not erased by deployment.
- Dispatch Tracking now has two categories: Trackable and Non-trackable. Trackable includes Shree Maruti, VRL, TCI Freight, TCI Express, V Express, V Trans, ACPL, ARC, and DTDC. All appear in one table and one carrier filter.
- Click Track for the Process No. to open the official carrier website in a new tab. The LR ID is copied to clipboard when browser permission allows. Check the status yourself on the carrier site.
- Capture opens the same manual screenshot dialog for EVERY carrier. Capture a selected browser tab (requires browser permission) or upload an image, select a status and enter the journey details.
- Save to this process stores the screenshot in private trackingShotDoc storage, plus the exact process owner's manually recorded tracking status and details via the existing guarded oms_record_tracking_capture database function. These are labeled Manual and Not worker-verified.
- Search result opens the latest stored process-specific screenshot. Transfer retains the Check List and DataDoc destinations without submitting anything to external portals.
- The existing four-column Shree Maruti Excel importer (Process No., Credit Type, Sales Person, Tracking ID) is kept above the unified table and creates tracking records only. The user did not request a new general-carrier Excel template in this phase.
- Historical tracking worker statuses remain available for prior processes and audit. A warning shows outstanding old running tracking jobs, which must be reconciled separately.

## Stop automatic tracking

- No automatic Track All button, Auto track button, carrier worker status card or website bulk queue.
- The website's shared ops.queue call explicitly refuses new automatic tracking jobs.
- Supabase migration 030_manual_only_carrier_tracking_claims replaces both legacy single and batch carrier tracking claim RPCs with claim-disabled implementations. Neither can claim an automatic carrier job anymore.
- Migration 030 contains no UPDATE or DELETE statements. Running jobs, failed jobs, previously uploaded evidence, audit events, and other unrelated automation (DataDoc and Outlook) remain unchanged.
- The authorized Windows carrier tracker should also be stopped by the user if it is still running. Cloud code cannot stop a local Windows process.

## Rollout verification

Run the manual dispatch test suite and all preexisting Vercel build checks.
Manually review one Shree Maruti and one other courier tracking ID against the
official carrier websites. Capture each result and confirm its correct process
number, screenshot, saved manual status, and audit entry.

Shree Maruti direct site: https://tracking.shreemaruti.com/.
