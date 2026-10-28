-- PJS OMS: complete manual-only personal register reset.
-- This migration INSTALLS code only; it NEVER executes a workspace reset.
-- A verified JWT + explicit typed confirmation on the website is required.
-- Auth accounts, preferences, shared-team records, and database backups are preserved.
-- All new agent job inserts and claims remain blocked by migration 036.

-- A clean register may contain detached albums or agent history but zero processes.
alter table public.oms_workspace_reset_sessions
  drop constraint if exists oms_workspace_reset_sessions_expected_count_check;
alter table public.oms_workspace_reset_sessions
  add constraint oms_workspace_reset_sessions_expected_count_check
    check (expected_count between 0 and 1000);

create or replace function public.oms_prepare_personal_reset(
 p_owner uuid, p_expected_count integer
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_actual integer;
 v_id uuid;
 v_marked integer;
begin
 if p_owner is null or p_expected_count not between 0 and 1000 then
   raise exception 'Invalid personal reset request';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_owner::text));
 select id into v_id
   from public.oms_workspace_reset_sessions
   where user_id=p_owner and state='preparing' for update;
 if v_id is not null then
   select count(*) into v_actual from public.oms_processes
    where user_id=p_owner and team_id is null;
   select count(*) into v_marked from public.oms_processes
    where user_id=p_owner and team_id is null
      and data->>'__pending_workspace_reset'=v_id::text;
   if v_actual<>p_expected_count or v_marked<>v_actual then
     raise exception 'Existing reset has a changed process inventory; contact administrator';
   end if;
   -- Retry is idempotent and continues the same storage cleanup session.
   return v_id;
 end if;

 perform 1 from public.oms_processes
   where user_id=p_owner and team_id is null for update;
 select count(*) into v_actual from public.oms_processes
  where user_id=p_owner and team_id is null;
 if v_actual<>p_expected_count then
   raise exception 'Process count changed; refresh reset preview';
 end if;

 -- All workers are globally paused by migration 036. These statuses are
 -- historical and must NOT block removal of the user's own entry data.
 -- Mark waiting and stale-running jobs cancelled first, before hiding rows.
 -- This does NOT cancel an action already executing outside the database.
 update public.oms_jobs j
   set status='cancelled',updated_at=now(),
    error_message='Personal workspace reset: queued/running job cancelled from OMS. Verify externally if an old worker was active.'
  from public.oms_processes p
  where j.process_id=p.id and p.user_id=p_owner and p.team_id is null
    and j.user_id=p_owner and j.status in ('queued','running');

 update public.oms_cloud_jobs j
   set status='cancelled',updated_at=now(),
    error_message='Personal workspace reset: queued/running cloud job cancelled from OMS.'
  from public.oms_processes p
  where j.process_id=p.id and p.user_id=p_owner and p.team_id is null
    and j.status in ('queued','running');

 update public.oms_email_send_requests r
   set status='cancelled',
    error_message='Personal workspace reset: email job cancelled from OMS.'
  from public.oms_processes p
  where r.process_id=p.id and p.user_id=p_owner and p.team_id is null
    and r.owner_id=p_owner and r.status in ('queued','running');

 insert into public.oms_workspace_reset_sessions(user_id,expected_count)
 values(p_owner,p_expected_count) returning id into v_id;

 update public.oms_processes
  set deleted_at=coalesce(deleted_at,now()),
   data=coalesce(data,'{}'::jsonb)||jsonb_build_object('__pending_workspace_reset',v_id::text)
  where user_id=p_owner and team_id is null;
 return v_id;
end;
$$;
revoke all on function public.oms_prepare_personal_reset(uuid,integer) from public,anon,authenticated;
grant execute on function public.oms_prepare_personal_reset(uuid,integer) to service_role;

create or replace function public.oms_complete_personal_reset(
 p_owner uuid,p_session uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_expected integer;
 v_actual integer;
 v_marked integer;
 v_deleted integer;
 v_albums integer;
 v_jobs integer;
 v_cloud_jobs integer;
 v_email_jobs integer;
 v_events integer;
 v_documents integer;
 v_photos integer;
 v_tasks integer;
 v_notifications integer;
 v_messages integer;
begin
 if p_owner is null or p_session is null then
   raise exception 'Invalid personal reset session';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_owner::text));
 select expected_count into v_expected
   from public.oms_workspace_reset_sessions
   where id=p_session and user_id=p_owner and state='preparing' for update;
 if not found then raise exception 'Reset session not found or already completed'; end if;

 perform 1 from public.oms_processes
  where user_id=p_owner and team_id is null for update;
 select count(*) into v_actual from public.oms_processes
  where user_id=p_owner and team_id is null;
 select count(*) into v_marked from public.oms_processes
  where user_id=p_owner and team_id is null
    and data->>'__pending_workspace_reset'=p_session::text;
 if v_actual<>v_expected or v_marked<>v_expected then
   raise exception 'Process inventory changed during reset; no database records deleted';
 end if;

 -- A remaining stale Running flag cannot block a user-confirmed reset.
 -- The preparatory function already cancels job statuses. No new job claims
 -- are possible in manual-only mode.
 select count(*) into v_jobs from public.oms_jobs j
  where j.user_id=p_owner and j.process_id in
   (select id from public.oms_processes where user_id=p_owner and team_id is null);
 select count(*) into v_cloud_jobs from public.oms_cloud_jobs j
  where j.user_id=p_owner and j.process_id in
   (select id from public.oms_processes where user_id=p_owner and team_id is null);

 -- Email requests reference both documents and processes without ON DELETE CASCADE.
 -- Remove these first so document/process deletions cannot fail on a foreign key.
 delete from public.oms_email_send_requests r
  where r.owner_id=p_owner and r.process_id in
   (select id from public.oms_processes where user_id=p_owner and team_id is null);
 get diagnostics v_email_jobs=row_count;

 select count(*) into v_documents from public.oms_documents d
  where d.user_id=p_owner and d.process_id in
   (select id from public.oms_processes where user_id=p_owner and team_id is null);

 -- Done Pick List albums are independently owned and may outlive a process.
 -- Delete EVERY personal album, including orphan albums and Trash.
 select count(*) into v_photos from public.oms_done_pick_photos
  where user_id=p_owner and album_id in
   (select id from public.oms_done_pick_albums where user_id=p_owner);
 delete from public.oms_done_pick_albums where user_id=p_owner;
 get diagnostics v_albums=row_count;

 delete from public.oms_events e where e.user_id=p_owner and (
   e.process_id in (
    select id from public.oms_processes where user_id=p_owner and team_id is null)
   or e.process_no in (
    select process_no from public.oms_processes where user_id=p_owner and team_id is null)
 );
 get diagnostics v_events=row_count;

 -- The user asked to clear old agent/job data, not just process rows.
 -- Personal chat/task/notification history is independent of process FKs.
 delete from public.oms_agent_notifications where user_id=p_owner;
 get diagnostics v_notifications=row_count;
 delete from public.oms_agent_tasks where user_id=p_owner;
 get diagnostics v_tasks=row_count;
 delete from public.oms_agent_messages where user_id=p_owner;
 get diagnostics v_messages=row_count;

 -- Clear old personal worker heartbeat rows (no shared cloud-worker records).
 delete from public.oms_office_workers where owner_id=p_owner;
 delete from public.oms_outlook_workers where owner_id=p_owner;
 delete from public.oms_tracking_workers where owner_id=p_owner;
 delete from public.oms_datadoc_proof_workers where owner_id=p_owner;

 -- FK CASCADE removes all related personal docs/jobs/cloud jobs/exceptions.
 -- The deletion stays inside one transaction; failures roll back DB changes.
 delete from public.oms_processes where user_id=p_owner and team_id is null
   and data->>'__pending_workspace_reset'=p_session::text;
 get diagnostics v_deleted=row_count;
 if v_deleted<>v_expected then
   raise exception 'Unexpected process deletion count; rolled back';
 end if;

 update public.oms_workspace_reset_sessions
  set state='completed',completed_at=now(),deleted_count=v_deleted
  where id=p_session and user_id=p_owner;

 return jsonb_build_object(
   'deleted_processes',v_deleted,'deleted_albums',v_albums,
   'deleted_photos',v_photos,'deleted_documents',v_documents,
   'deleted_jobs',v_jobs,'deleted_cloud_jobs',v_cloud_jobs,
   'deleted_email_requests',v_email_jobs,'deleted_events',v_events,
   'deleted_agent_tasks',v_tasks,'deleted_notifications',v_notifications,
   'deleted_agent_messages',v_messages,
   'scope','personal_only','managed_supabase_backups_untouched',true
 );
end;
$$;
revoke all on function public.oms_complete_personal_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.oms_complete_personal_reset(uuid,uuid) to service_role;

-- While an explicit reset is preparing, block new independent photo/doc rows
-- for that user. The rest of the user's cloud account remains intact.
create or replace function public.oms_prevent_personal_reset_uploads()
returns trigger language plpgsql set search_path='' as $$
begin
 if exists (
  select 1 from public.oms_workspace_reset_sessions s
  where s.user_id=new.user_id and s.state='preparing'
 ) then
  raise exception 'Your personal process reset is being completed; new uploads are temporarily disabled.';
 end if;
 return new;
end;
$$;

drop trigger if exists oms_block_docs_during_reset on public.oms_documents;
create trigger oms_block_docs_during_reset
 before insert on public.oms_documents for each row
 execute function public.oms_prevent_personal_reset_uploads();

drop trigger if exists oms_block_albums_during_reset on public.oms_done_pick_albums;
create trigger oms_block_albums_during_reset
 before insert on public.oms_done_pick_albums for each row
 execute function public.oms_prevent_personal_reset_uploads();

drop trigger if exists oms_block_photos_during_reset on public.oms_done_pick_photos;
create trigger oms_block_photos_during_reset
 before insert on public.oms_done_pick_photos for each row
 execute function public.oms_prevent_personal_reset_uploads();
