# PJS Operations — Independent OMS

React + Vite website hosted by Vercel and connected to a **separate** Supabase project. The legacy PJS Delivery Control and AppDeploy applications are left unchanged.

## Phases 1–3 implementation

### Phase 1 — Reliable document intake
- Digital Pick Slip PDF header extraction: **Process No., Party Name, SO No.**
- OCR fallback for scanned PDFs and camera images, with source/confidence warnings and mandatory human review
- Done Pick List photo OCR, exact Process No. matching and confirmation before private attachment
- Failed attachment retry from the same editor without duplicating the saved process
- Private owner/team-authorized PDF and image storage in Supabase

### Phase 2 — Cloud workspaces and safe import
- Google OAuth or pre-existing password login; no email approval flow required for Google
- Opt-in Admin / Operator / Viewer team workspaces under **Settings**
- Email-address invitations are stored securely in the database. Colleagues accept by logging in with that verified address; invitation creation does **not** send an email.
- Existing personal records stay private until their owner explicitly selects them to join a team
- Historical process CSV import under **Settings**: preview required fields and duplicates, explicit confirmation; imported records always start at **Review**.
- Historical PDFs, audit history and jobs are **not** migrated by CSV import. Original PJS data is not modified.

### Phase 3 — Business workflow validation
- DataDoc readiness checks require verified process identity, Pick Slip, invoice data, original PDFs and E-Way Bill when the configured amount threshold applies
- Tracking, client email and delivery-proof queues have separate readiness checks
- Delivery cannot be closed without confirmed delivery evidence and a completed proof-submission job
- Courier bill OCR can extract several labelled LR numbers. Exact, missing and ambiguous matches must be reviewed.
- **Generate Excel** downloads an independent, styled workbook with Summary, LR Review and Process Register. It is not an approved DataDoc/carrier upload template.
- Check List uses persistent exception cases and written resolution notes, with cloud audit events.

## Setup and real-world acceptance tests

1. Ensure the independent Supabase Google provider is enabled and Site URL is the production Vercel URL.
2. Log into the live website: https://pjs-oms-independent-pjsspare098-2655.vercel.app/
3. Upload representative digital Pick Slip PDFs and scanned images; review every extracted value; save and reopen the original PDF.
4. Upload a Done Pick List photo; confirm it only attaches to the exact matching Process No. Verify signed-out users cannot open its file.
5. Under Settings, create a team workspace. Invite a second authorized Google account, have it accept the invitation, and test Viewer vs Operator permissions using **test records**.
6. Preview a historical CSV before importing; confirm duplicates are skipped and imported processes start in Review.
7. Verify readiness warnings in DataDoc, generate an LR workbook and inspect all three sheets.
8. Open and resolve a sample exception, then check its audit history.

**Security:** Do not commit customer documents, secrets, service-role keys or passwords. The GitHub repository should be private. Enable Supabase leaked-password protection if password login will be used.

## Important limitations

- The office PC Python worker remains **offline**. DataDoc submission, Outlook sending, courier tracking and delivery-proof submission are not executed by the website. A queued job is not evidence of completion.
- AI-assisted extraction beyond local PDF.js/Tesseract OCR requires a separately configured secure server-side AI service, not a browser API key.
- New team-role and OCR features have automated build tests, but live multi-account permissions, customer-specific scanned documents, and complete upload/download cycles still require real user acceptance testing.
- Existing records in the old PJS Supabase or AppDeploy database are not automatically migrated.
