-- Prevent clients from modifying/queueing work on records moved to Trash.
-- A recoverable delete must only happen through the authenticated RPC.
create or replace function public.oms_protect_process_identity()
returns trigger language plpgsql set search_path=''
as $$
begin
 if current_user='authenticated' then
  if old.deleted_at is not null then
   raise exception 'Process is in Trash. Restore it before making changes';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
   raise exception 'Use confirmed Delete Process / Restore to change the Trash status';
  end if;
  if new.user_id is distinct from old.user_id or new.team_id is distinct from old.team_id then
   raise exception 'Record ownership and workspace cannot be changed directly';
  end if;
  if new.process_no is distinct from old.process_no then
   raise exception 'Process No. cannot be changed after record creation';
  end if;
 end if;
 return new;
end;$$;
drop policy if exists oms_processes_delete on public.oms_processes;
drop policy if exists oms_documents_insert on public.oms_documents;
create policy oms_documents_insert on public.oms_documents for insert to authenticated
with check (
 user_id=auth.uid() and exists(
  select 1 from public.oms_processes p where p.id=process_id and p.deleted_at is null
   and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))
 ));
drop policy if exists oms_jobs_queue on public.oms_jobs;
create policy oms_jobs_queue on public.oms_jobs for insert to authenticated
with check(
 user_id=auth.uid() and status='queued' and progress=0 and exists(
  select 1 from public.oms_processes p
  where p.id=oms_jobs.process_id and p.process_no=oms_jobs.process_no
    and p.deleted_at is null
    and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))
 ));
drop policy if exists oms_files_insert on storage.objects;
create policy oms_files_insert on storage.objects for insert to authenticated
with check (
 bucket_id='oms-documents'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists(
  select 1 from public.oms_processes p
  where p.id::text=(storage.foldername(name))[2] and p.deleted_at is null
    and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))
 )
);