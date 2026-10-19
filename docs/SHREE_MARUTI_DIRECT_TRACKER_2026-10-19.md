# PJS OMS — Direct Shree Maruti tracking + process screenshots (19 October 2026)

This update follows the operator's Chrome/DevTools screenshots of https://tracking.shreemaruti.com/:

- Search input: form.search-bar input.search-input
- Track action: form.search-bar button.btn-primary
- Shipment identifier/status: section.status-hero .status-hero-top
- Green current progress dot: section.status-hero .progress-step.current .progress-label
- Latest actual event: section.journey li.journey-item.latest (with first journey item fallback)

## Result capture

1. On the authorized Windows office machine, use one Selenium Chrome session to open https://tracking.shreemaruti.com/ DIRECTLY.
2. For up to 20 approved IDs, enter comma-separated AWBs and click Track once; open the exact AWB chip for each returned result. A **single-ID search may not create a chip**. This is supported ONLY if the new search contains that one ID and the hero shows its exact AWB.
3. Record the displayed green **current** progress marker, not all earlier "done" steps. The marker is recorded in the tracking details, but the **latest shipment journey event** determines trackingStatus. This matters when returns/undelivered shipments keep a green marker on an earlier delivery stage.
4. Capture a **full-page PNG** of the selected result, including AWB/green status and the Shipment Journey, for *each successfully verified status*: In Transit, Out for Delivery, Delivered, Returned, etc. Use a viewport fallback if Chrome DevTools protocol capture is unavailable.
5. Before and after capture confirm the page still belongs to the same AWB. Reject mismatched pages, missing journeys, stale results or ambiguous statuses.
6. Persist one job at a time with oms_finish_tracking, which checks owner/process UUID/stage/Tracking ID again. The status, carrier details and event date live in that specific OMS process.
7. **After** the process-specific status update succeeds, attach each screenshot in the private oms-documents bucket as kind trackingShotDoc for the exact process. In the Shree Maruti tracking row, click **Search result** to view the latest screenshot.
8. Screenshot failure does NOT invent proof of delivery or discard a legitimately verified tracking status. Review logs/dispatch-tracking.log if no screenshot is attached. In Transit screenshots are only tracking evidence, not physical delivery confirmation.
9. No DataDoc/Outlook activity. No automatic retries of uncertain database writes or job claims.

## Deployment & Windows follow-up

- Website repo / production Vercel is updated by merging this PR; Windows office files do not update themselves.
- Preserve local C:\Users\vivek.pal\PJS-OMS-Worker\.env (and logs). Leave PJS_ENABLE_LIVE_TRACKING=0, PJS_ENABLE_LIVE_DATADOC_PROOF=0.
- Stop the old carrier worker before replacing the updated three source files: shree_maruti_batch.py, dispatch_tracking_worker.py, carriers.py. Tests can be updated separately.
- Run the mock test suite with Python 3.13:
  & "C:\Users\vivek.pal\Python313\python.exe" -m unittest discover -s . -p "test_*tracking*.py" -v
  & "C:\Users\vivek.pal\Python313\python.exe" -m unittest discover -s . -p "test_shree_maruti_batch.py" -v
- Start the carrier worker in paused mode:
  & "C:\Users\vivek.pal\Python313\python.exe" start_worker.py dispatch_tracking_worker.py
- Verify worker heartbeat mode shree_maruti_direct_screenshots_v3; use two safe, known AWBs with distinct statuses in a supervised live test. Confirm both screenshots are saved to their correct Process Nos. before enabling continuous operation.
- **Review existing queued tracking jobs before enabling live**. The carrier worker would claim older eligible approved jobs too; leave the flag off until the queue is understood. Do not clear jobs automatically.
- The real carrier UI and private screenshots cannot be fully verified by mock tests or a Vercel build; proof is the supervised Windows run.
