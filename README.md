# OMS Independent · PJS Operations Management

Independent React/Vite website, migrated from the AppDeploy design to GitHub + Vercel. Existing PJS and AppDeploy sites are unchanged.

## Implemented
- All OMS navigation and workflow UI pages.
- Deterministic extraction of **Process No., Party Name, and SO No.** from the supplied Sales Order Pick Slip Report layout, using PDF.js positional text. Scanned PDFs/images fall back to Tesseract.js OCR. Extracted fields require review.
- Duplicate Process No. checks.
- Supabase-ready secure email-link sign-in, owner-scoped Postgres records, and private file storage. No AppDeploy SDK dependencies.
- Document and missing-field checks. Automatic DataDoc/Outlook/carrier job execution is **not** connected yet.

## Setup (required before real use)
1. Create a **new Supabase project**, separate from the legacy PJS Supabase database.
2. Run `supabase/migrations/001_oms.sql` in that project's SQL editor.
3. Set Vercel environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon/publishable client key; never service-role key).
4. In Supabase Authentication -> URL Configuration set the new Vercel production site URL and add its auth redirect URL; enable email sign-in.
5. Redeploy and sign in with your verified email. Test Pick Slip upload, reload persistence and a private attachment download before migrating actual work.

Without those environment variables the site displays **LOCAL PREVIEW**: records reside only in that browser's localStorage. PDF files are parsed locally but **not stored**. Do not use local preview for confidential operational records.

## Safety
- This GitHub repository is currently **public**. Change it to private in GitHub Settings before adding business-only source material.
- Never commit customer PDFs, credentials, service-role keys or .env files.
- Existing cloud records from AppDeploy are not automatically migrated. They need an authenticated export/import step.
- The original office-side Python worker must be connected through its own authenticated backend job API, not directly from a browser or a public GitHub repository.
