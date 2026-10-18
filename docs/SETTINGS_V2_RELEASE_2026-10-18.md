# PJS OMS Settings 2.0 — staged implementation and release (18 October 2026)

## Baseline & release constraints

- Single independent PJS OMS frontend, unchanged signed-in identity and Supabase project.
- No database migrations, policy changes, server credentials, worker switches or live submissions in this change.
- Preserve process CRUD, invoice/OCR workflow, team access, DataDoc approvals, tracking, drafts, multi-photo albums, history, preferences, notifications and export/reset protections.
- Never claim queue success means an external DataDoc/Outlook action was completed.
- UI-only preferences persist in browser storage under \`pjs_oms_local_settings_v2\`; they do not sync to the cloud.

## Eight Settings 2.0 sections

| Section | Working now | Deferred (visible but not enabled) |
| --- | --- | --- |
| Appearance & Accessibility | Existing light/dark, density and landing page; text sizes, high contrast, reduce motion | cloud synced preferences, per-table columns |
| Android Navigation | Four editable bottom tabs, duplicate-safe swap, More drawer always present | gesture navigation, offline camera queue |
| Dashboard Layout | Show/hide total, in-workflow, attention and completed cards; at least one stays visible | drag-and-drop order, custom queries |
| Smart Notifications | Existing in-app notification inbox and read state | outbound email/SMS/WhatsApp, quiet hours/digests |
| Automation Control | Existing queue monitor and worker statuses; protected links | remote worker commands, automatic retries and unverified sending |
| Camera & Documents | Existing photo selection preference and upload flow; PDF/OCR test bench retained under operational settings | compression controls and background sync |
| Security & Account | Existing auth/session, role-administration and audit links | cross-device session administration and permissions matrix |
| Data & Backup | Existing CSV export, historical import and confirmed owner-only reset | verified managed storage/database backup and restore |

Legacy operational controls (Office Worker Monitor, Users & Roles, Dispatch Rules, PDF/OCR Test Bench) remain in the Settings navigation under **Existing Operations**.

## Release stages

1. **Review and protect baseline** — source on feature branch, no backend changes.
2. **Implement browser-local preferences** — shared validator and safe default restoration for corrupt settings.
3. **Wire UI** — configure bottom-nav pages and show/hide Control Tower metric cards; maintain More drawer and original page actions.
4. **Enhance accessibility** — light/dark compatibility, larger text, high contrast, reduced motion, touch-friendly Settings pages.
5. **Run automated build and invariants** — full \`npm run build\` includes existing tests, \`test:responsive\`, \`test:settings\`, and \`test:settings-v2\`; Vercel preview must be READY.
6. **Production release** — merge UI-only pull request after automated checks; verify Vercel production deployment targets the merge SHA.
7. **Manual UAT** — Android 360/390px and desktop 1366/1920px: navigate all tabs, persist after refresh, test dark mode, check text scaling, login, uploads and old workflows. These require a real tester, not just a successful build.
8. **Backend expansions (separate approval)** — opt-in notifications, server-backed user preferences, permission enforcement, remote worker control, backups/recovery and server-side audit, each with isolated migration and environment testing.

## Risks and mitigations

- Browser storage may be disabled: defaults are used; browser-local preferences are not a cloud backup.
- Invalid or duplicate tab preferences: normalize to four allowed, unique pages. More is permanently available.
- All dashboard cards hidden: validator prevents it.
- Text scaling may cause tight layouts on small devices: scroll wide tables horizontally, test extra-large on real devices.
- Legacy controls remain rendered and mounted only when their selected Settings tab is open.
- Production rollback changes only React/CSS commits; never roll back/delete live data.
