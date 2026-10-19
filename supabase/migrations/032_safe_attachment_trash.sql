-- PJS OMS: remove a single attachment safely, without deleting its process,
-- physical private-storage object or immutable historical audit.
-- This migration creates reversible metadata + owner-only RPCs. It does NOT
-- archive or remove any existing document during deployment.

alter table public.oms_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists oms_documents_process_active_idx
  on public.oms_documents(process_id,created_at desc)
  where deleted_at is null;

-- A user may trash only their own personal process's specific document.
-- A queued/running job can use original PDF inputs, and completed jobs may
-- contain submitted document IDs; never hide such evidence from the workflow.
create or replace function public.oms_set_document_trash(
  p_process_id uuid,
  p_document_id uuid,
  p_restore boolean default false
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_proc public.oms_processes%rowtype;
  v_doc public.oms_documents%rowtype;
  v_referenced boolean;
begin
  if v_uid is null or p_process_id is null or p_document_id is null then
    raise exception 'Sign in and select a saved process attachment';
  end if;

  select * into v_proc
    from public.oms_processes p
   where p.id=p_process_id and p.user_id=v_uid and p.team_id is null
     and p.deleted_at is null
   for update;
  if not found then
    raise exception 'Only the owner of an active personal process may change its attachments';
  end if;

  select * into v_doc
    from public.oms_documents d
   where d.id=p_document_id and d.process_id=p_process_id
     and d.user_id=v_uid
   for update;
  if not found then
    raise exception 'Attachment not found in this process';
  end if;

  if p_restore then
    if v_doc.deleted_at is null then
      raise exception 'Attachment is already active; refresh';
    end if;
    update public.oms_documents
       set deleted_at=null,deleted_by=null
     where id=v_doc.id and deleted_at is not null;
  else
    if v_doc.deleted_at is not null then
      raise exception 'Attachment is already in Deleted attachments; refresh';
    end if;

    -- A job can be claimed while a browser is editing attachments.
    -- Lock first, then verify that no active job will lose a required PDF.
    lock table public.oms_jobs in share row exclusive mode;
    if exists(
      select 1 from public.oms_jobs j
       where j.process_id=p_process_id and j.status in ('queued','running')
    ) then
      raise exception 'This process has a queued or running job. Resolve it before removing a document';
    end if;

    -- A saved screenshot or email may remain referenced by current process data
    -- or a completed job. Preserve exactly such evidence (all job types).
    v_referenced :=
      coalesce(v_proc.data::text,'') like '%'||v_doc.id::text||'%'
      or exists (
        select 1 from public.oms_jobs j
         where j.process_id=p_process_id
           and (
             coalesce(j.payload::text,'') like '%'||v_doc.id::text||'%'
             or coalesce(j.result::text,'') like '%'||v_doc.id::text||'%'
           )
      );
    if v_referenced then
      raise exception 'Attachment is referenced by process evidence or automation history. Replace or reconcile that reference first';
    end if;

    update public.oms_documents
       set deleted_at=now(),deleted_by=v_uid
     where id=v_doc.id and deleted_at is null;
  end if;

  if not found then
    raise exception 'Document state changed during update. Refresh before retrying';
  end if;

  insert into public.oms_events(user_id,process_id,process_no,action,details)
  values(
    v_uid,p_process_id,v_proc.process_no,
    case when p_restore then 'Attachment restored from trash'
         else 'Attachment moved to trash' end,
    jsonb_build_object(
      'document_id',v_doc.id,'kind',v_doc.kind,'name',v_doc.name,
      'recoverable',true,'storage_object_preserved',true,
      'document_rows_removed',false
    )
  );

  return jsonb_build_object(
    'id',v_doc.id,'process_id',p_process_id,'name',v_doc.name,
    'kind',v_doc.kind,'trashed',not p_restore,'recoverable',true
  );
end;
$$;

revoke all on function public.oms_set_document_trash(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.oms_set_document_trash(uuid,uuid,boolean)
  to authenticated;
