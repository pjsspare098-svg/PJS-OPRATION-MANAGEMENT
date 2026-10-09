-- Independent OMS data model. Run ONLY in a NEW Supabase project, never the legacy PJS project.
create table if not exists public.oms_processes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  process_no text not null,
  party_name text not null default '',
  sales_order_no text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, process_no)
);
create table if not exists public.oms_documents (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.oms_processes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pickDoc','invoiceDoc','einvoiceDoc','ebillDoc','lrDoc')),
  name text not null,
  path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists oms_processes_user_idx on public.oms_processes(user_id,created_at desc);
create index if not exists oms_documents_process_idx on public.oms_documents(process_id);
alter table public.oms_processes enable row level security;
alter table public.oms_documents enable row level security;
drop policy if exists oms_processes_owner on public.oms_processes;
create policy oms_processes_owner on public.oms_processes
for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists oms_documents_owner on public.oms_documents;
create policy oms_documents_owner on public.oms_documents
for all to authenticated using (auth.uid()=user_id) with check
(auth.uid()=user_id and exists (select 1 from public.oms_processes p where p.id=process_id and p.user_id=auth.uid()));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('oms-documents','oms-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists oms_files_read on storage.objects;
create policy oms_files_read on storage.objects for select to authenticated
using (bucket_id='oms-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists oms_files_insert on storage.objects;
create policy oms_files_insert on storage.objects for insert to authenticated
with check (bucket_id='oms-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists oms_files_delete on storage.objects;
create policy oms_files_delete on storage.objects for delete to authenticated
using (bucket_id='oms-documents' and (storage.foldername(name))[1]=auth.uid()::text);
