-- New OMS Supabase only. Done Pick List photos are linked to an existing, owner-scoped process.
alter table public.oms_documents drop constraint if exists oms_documents_kind_check;
alter table public.oms_documents add constraint oms_documents_kind_check
  check (kind in ('pickDoc','invoiceDoc','einvoiceDoc','ebillDoc','lrDoc','emailDoc','proofDoc','donePickDoc'));
alter table public.oms_documents add column if not exists extracted_process_no text;
comment on column public.oms_documents.extracted_process_no is 'OCR Process No. prior to explicit human verification.';
