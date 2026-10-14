# DataDoc Bill Submit — One ZIP Transaction (Office Worker V2)

This workflow is based on the DataDoc screenshots supplied on 14 Oct 2026.
**No usernames, passwords, Supabase keys or real customer data are stored in the repository.**

## Data mapping

| OMS process field | DataDoc action |
|---|---|
| PJS Process No. | Global search `#txtGlobalProcessNo`, click exact autocomplete option |
| Credit Type: Credit / Non Credit | Add Transaction `#spanAddTransactions`; select `#cphContent_ddlWork` = `Dispatch - Credit` / `Dispatch - Non Credit` |
| Invoice No. | Credit: `#cphContent_txtExtraField_2`; Non Credit: `#cphContent_txtExtraField` |
| Invoice Amount | Credit: `#cphContent_txtExtraField_3`; Non Credit: `#cphContent_txtExtraField_2` |
| Full Payment Verify | Credit: `#cphContent_txtExtraField`; Non Credit: `#cphContent_txtExtraField_3`; enters **Yes** as instructed for approved verified transactions |
| Next Required Work | `#cphContent_ddlNextWork` = `Disp. Detail Send To Client` |
| Next Response User | Select the required office user in `#cphContent_chkNextUser` |
| Documents | One temporary ZIP attached in `#cphContent_fileAttachment1` |
| Final action | `#cphContent_btnSubmit` ONCE, verify matching Dispatch row & invoice |

### ZIP contents

The **office worker**, not the public browser, reads the latest owner/process-scoped PDFs
from private Supabase Storage and creates `<process>_BillSubmit.zip` locally.

- `Invoice.pdf` (required to actually submit)
- `E-Invoice.pdf` (included when attached to the OMS process)
- `E-Way-Bill.pdf` (included when attached to the OMS process)

If no E-Invoice or E-Way Bill exists, the ZIP contains only available files; the website
shows advisory warnings and requires a positive amount, credit choice, invoice number and
at least an invoice PDF for **execution**. Check current tax/legal requirements before
confirming an invoice without an E-Way Bill. No ZIP is uploaded to the PJS cloud; it is
deleted with the temporary working directory after the attempt.

### Safe sequencing

1. Signed-in owner approves/queues exactly one bill in the DataDoc stage.
2. Supabase queues a `bill_submit` job marked `office_policy='zip_v2'`.
3. New claim RPC permits a new claim only after the **updated Windows worker** advertises a
   recent `bill_submit_version='zip_v2'` heartbeat, with complete invoice essentials.
4. Worker validates the owner/process, checks for previously completed jobs, and builds ZIP.
5. Selenium signs into DataDoc **Sales**, searches process and opens the process.
6. If a matching Dispatch Credit/Non-Credit transaction already exists, **stop for manual
   review** — do not create a duplicate.
7. Selenium fills all current fields, checks text values, selects next workflow/user,
   attaches the ZIP and clicks Submit once.
8. Mark completed **only** when a matching Dispatch transaction and Invoice No. appears.
   Otherwise mark manual review, never retry automatically.

### First office-PC acceptance (mandatory)

Use the **authorized local Windows PC** that can reach the private `192.168.0.18:8082`
service and has Chrome/Selenium installed. Do not attempt real browser interaction from
Vercel or Cloud Run. Update the office worker scripts from GitHub (keep private `.env`).

1. **Rotate the DataDoc password shared in chat** before entering new credentials in
   local `worker/.env`. Never commit or screenshot them.
2. Set `PJS_DATADOC_URL`, `PJS_DATADOC_USERNAME` and `PJS_DATADOC_PASSWORD` in local
   `.env`; leave unrelated flags off, especially untested DataDoc Email Submit.
3. Start the updated worker, verify `ZIP v2` worker heartbeat on DataDoc queue.
4. Verify one authorized low-risk, not-yet-submitted process and **preview the ZIP contents
   locally** before letting the real submission run.
5. With office operator present, enable only `PJS_ENABLE_LIVE_DATADOC=1`, restart worker
   and approve exactly one reviewed bill. Check the actual DataDoc row and ZIP attachment.
6. If DataDoc rejects ZIP file types, has different iframe field IDs or behaves unexpectedly,
   **stop without retrying**; provide the local `logs/datadoc-worker.log` with all private
   credentials removed so selectors can be adjusted.

Cloud unit tests check structure, ZIP integrity, field mapping and no-duplicate behavior.
They **cannot prove an actual login, upload, network connection or submission** inside the
private DataDoc site.
