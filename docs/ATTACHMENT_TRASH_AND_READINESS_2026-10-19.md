# PJS OMS — attachment Delete/Restore + retired worker readiness cleanup

Date: 19 October 2026. Independent PJS OMS site.

## Attachment management

Open a personal Process No. in the PJS OMS editor. Under **Private attachments**, each **saved** Pick Slip, invoice, e-invoice, e-way bill, LR, Outlook message, Proof PDF or tracking screenshot now has a **Delete** action next to Open / Download / Extract (where applicable). Previously attached Done Pick List photos can also be moved to Deleted attachments here. A newly selected but unsaved attachment has **Remove selected**, which affects only the unsaved browser selection.

- Click Delete on the exact file and accept the confirmation describing the Process No.
- The file is **moved to Deleted attachments**. Its original private storage object and document metadata are preserved, and an owner-scoped OMS audit event is recorded.
- Use **Deleted attachments → Restore files** in the same editor to restore an archived file.
- Process details, other attachments and source files remain unchanged.
- The action is unavailable in local demo mode, for shared-team processes, and for documents in another account. A server-side function checks the authenticated owner and exact Process No./attachment UUID regardless of what the web interface displays.
- Deletion is rejected while ANY job for the process is queued or Running, or the file's UUID is referenced by the current process or historical job payload/result. For example, a tracking screenshot already selected as DataDoc evidence or the email conversation used by a submitted Outlook job may require manual reconciliation/replacement before it can be removed.
- Archived files are filtered out of normal process lists and cannot be opened, downloaded or scanned via the standard PJS file buttons. Their bytes remain privately stored until a separately reviewed retention-management procedure is introduced.
- No bulk attachment deletion or permanent storage wipe is introduced.

## Control Tower

The retired **Carrier Tracking Worker** has been removed from the Control Tower's System readiness list, including its stale Offline status and setup link. The independent DataDoc and Outlook worker statuses remain unchanged.

## Verification

- Migration 032 creates nullable deleted_at/deleted_by metadata and secure owner-only RPC oms_set_document_trash. It never archives a file during installation.
- The Vercel build runs the tests/attachmentTrash.test.mjs checks plus all existing regressions.
- An operator should confirm the full flow on one safe, non-referenced test attachment before archiving important invoices or proof.
