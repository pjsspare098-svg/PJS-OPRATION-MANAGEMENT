-- OMS email thread and delivery proof attachments
alter table public.oms_documents drop constraint if exists oms_documents_kind_check;
alter table public.oms_documents add constraint oms_documents_kind_check check (kind in ('pickDoc','invoiceDoc','einvoiceDoc','ebillDoc','lrDoc','emailDoc','proofDoc'));
update storage.buckets set allowed_mime_types=array['application/pdf','image/jpeg','image/png','message/rfc822','application/octet-stream'] where id='oms-documents';
