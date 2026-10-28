-- PJS OMS: explicit personal-workspace reset even when retired workers left
-- stale queue rows marked Running. Schema only: no customer data is deleted
-- when this migration is installed. Actual deletion requires authenticated
-- owner, full preview, typed phrase, stopped-worker acknowledgement and
-- protected Edge Function storage cleanup.
--
-- Legacy automation has already been disabled by migration 036.
-- Process scope is exclusively user_id = p_owner AND team_id IS NULL.
-- Shared-team data, user login, settings and managed backups stay untouched.

create or replace function public.oms_prepare_personal_reset(
 p_owner uuid,p_expected_count integer
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_actual integer;
 v_id uuid;
begin
 if p_owner is null or p_expected_count not between 1 and 1000 then
   raise exception 'Invalid personal reset request';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_owner::text));

 select id into v_id from public.oms_workspace_reset_sessions
  where user_id=p_owner and state='preparing'
  for update;
 if v_id is not null then
   select count(*) into v_actual from public.oms_processes
   where user_id=p_owner and team_id is null
     and data->>'__pending_workspace_reset'=v_id::text;
   if v_actual<>p_expected_count then
     raise exception 'Existing reset in progress has a different record count; contact administrator';
   end if;
   return v_id;
 end if;

 perform 1 from public.oms_processes
  where user_id=p_owner and team_id is null for update;
 select count(*) into v_actual from public.oms_processes
  where user_id=p_owner and team_id is null;
 if v_actual<>p_expected_count then
   raise exception 'Process count changed. Refresh preview.';
 end if;

 -- Explicit operator acknowledgement of stopped Windows/cloud workers is
 -- enforced by the JWT-verified Edge Function before this privileged RPC.
 -- Cancel ALL legacy active statuses to prevent stale Running rows from
 -- blocking a new manual-only workspace after the user's confirmation.
 update public.oms_jobs j
 set status='cancelled',
     updated_at=now(),
     finished_at=coalesce(j.finished_at,now()),
     error_message='Cancelled by explicitly confirmed personal workspace reset'
 from public.oms_processes p
 where j.process_id=p.id and j.user_id=p_owner
   and p.user_id=p_owner and p.team_id is null
   and j.status in ('queued','running');

 update public.oms_cloud_jobs j
 set status='cancelled',
     updated_at=now(),
     finished_at=coalesce(j.finished_at,now()),
     error_message='Cancelled by explicitly confirmed personal workspace reset'
 from public.oms_processes p
 where j.process_id=p.id and j.user_id=p_owner
   and p.user_id=p_owner and p.team_id is null
   and j.status in ('queued','running');

 update public.oms_email_send_requests r
 set status='cancelled',
     finished_at=coalesce(r.finished_at,now()),
     error_message='Cancelled by explicitly confirmed personal workspace reset'
 from public.oms_processes p
 where r.process_id=p.id and r.owner_id=p_owner
   and p.user_id=p_owner and p.team_id is null
   and r.status in ('queued','running');

 insert into public.oms_workspace_reset_sessions(user_id,expected_count)
 values(p_owner,p_expected_count)
 returning id into v_id;

 update public.oms_processes
 set deleted_at=coalesce(deleted_at,now()),
     data=coalesce(data,'{}'::jsonb)||jsonb_build_object('__pending_workspace_reset',v_id::text)
 where user_id=p_owner and team_id is null;
 return v_id;
end; $$;

revoke all on function public.oms_prepare_personal_reset(uuid,integer) from public,anon,authenticated;
grant execute on function public.oms_prepare_personal_reset(uuid,integer) to service_role;

create or replace function public.oms_complete_personal_reset(
 p_owner uuid,p_session uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_count integer;
 v_expected integer;
 v_deleted integer;
 v_albums integer;
 v_documents integer;
 v_photos integer;
 v_jobs integer;
 v_cloud_jobs integer;
 v_email_requests integer;
 v_tasks integer;
begin
 if p_owner is null or p_session is null then
   raise exception 'Missing reset scope or session';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_owner::text));

 select expected_count into v_expected
 from public.oms_workspace_reset_sessions
 where id=p_session and user_id=p_owner and state='preparing' for update;
 if not found then
   raise exception 'Reset session missing or already completed';
 end if;

 perform 1 from public.oms_processes
 where user_id=p_owner and team_id is null for update;
 select count(*) into v_count from public.oms_processes
 where user_id=p_owner and team_id is null
   and data->>'__pending_workspace_reset'=p_session::text;

 if v_count<>v_expected or
   exists(select 1 from public.oms_processes
    where user_id=p_owner and team_id is null
      and data->>'__pending_workspace_reset' is distinct from p_session::text) then
   raise exception 'Process inventory changed during cleanup; contact administrator';
 end if;

 -- File blobs were removed by the official Supabase Storage API before
 -- this transaction. Count relational rows for the completion receipt.
 select count(*) into v_documents
 from public.oms_documents d
 join public.oms_processes p on p.id=d.process_id
 where p.user_id=p_owner and p.team_id is null and d.user_id=p_owner;
 select count(*) into v_photos
 from public.oms_done_pick_photos photo
 join public.oms_done_pick_albums a on a.id=photo.album_id
 where a.user_id=p_owner
 and a.process_no in (
   select process_no from public.oms_processes
   where user_id=p_owner and team_id is null
 );
 select count(*) into v_jobs
 from public.oms_jobs j join public.oms_processes p on p.id=j.process_id
 where p.user_id=p_owner and p.team_id is null;
 select count(*) into v_cloud_jobs
 from public.oms_cloud_jobs j join public.oms_processes p on p.id=j.process_id
 where p.user_id=p_owner and p.team_id is null;

 -- Email send requests have NO ACTION document FKs, so remove them before
 -- deleting their documents or their process. Owner-scoped rows only.
 delete from public.oms_email_send_requests r
 where r.owner_id=p_owner and (
   r.process_id in (
      select id from public.oms_processes
      where user_id=p_owner and team_id is null
   )
   or (r.process_id is null and r.process_no in (
       select process_no from public.oms_processes
       where user_id=p_owner and team_id is null
     ) and not exists(
       select 1 from public.oms_processes shared
       where shared.process_no=r.process_no and shared.team_id is not null
     ))
 );
 get diagnostics v_email_requests=row_count;

 -- Done Pick List albums are keyed by owner + Process No. rather than
 -- process UUID; photos cascade from the albums.
 delete from public.oms_done_pick_albums a
 where a.user_id=p_owner
   and a.process_no in (
     select process_no from public.oms_processes
     where user_id=p_owner and team_id is null
   );
 get diagnostics v_albums=row_count;

 -- Preserve events for unrelated/shared processes even if Process No.
 -- happens to coincide. Only owned personal process events are erased.
 delete from public.oms_events e
 where e.user_id=p_owner and (
   e.process_id in (
     select id from public.oms_processes
     where user_id=p_owner and team_id is null
   )
   or (e.process_id is null and e.process_no in (
     select process_no from public.oms_processes
     where user_id=p_owner and team_id is null
   ) and not exists(
     select 1 from public.oms_processes shared
     where shared.process_no=e.process_no and shared.team_id is not null
   ))
 );

 -- Process-specific agent tasks and their notification rows are removed.
 -- General agent chat messages, login and Settings are not process records.
 delete from public.oms_agent_tasks t
 where t.user_id=p_owner and t.process_no in (
   select process_no from public.oms_processes
   where user_id=p_owner and team_id is null
 );
 get diagnostics v_tasks=row_count;

 -- Process delete cascades to documents, office jobs, cloud jobs and
 -- exceptions. The session is updated only on exact expected row count.
 delete from public.oms_processes
 where user_id=p_owner and team_id is null
   and data->>'__pending_workspace_reset'=p_session::text;
 get diagnostics v_deleted=row_count;
 if v_deleted<>v_expected then
   raise exception 'Unexpected deletion count; transaction rolled back';
 end if;

 update public.oms_workspace_reset_sessions
 set state='completed',completed_at=now(),deleted_count=v_deleted
 where id=p_session and user_id=p_owner and state='preparing';

 return jsonb_build_object(
   'deleted_processes',v_deleted,
   'deleted_documents',v_documents,
   'deleted_photos',v_photos,
   'deleted_albums',v_albums,
   'deleted_jobs',v_jobs,
   'deleted_cloud_jobs',v_cloud_jobs,
   'deleted_email_requests',v_email_requests,
   'deleted_agent_tasks',v_tasks,
   'scope','personal_only',
   'managed_supabase_backups_untouched',true
 );
end; $$;

revoke all on function public.oms_complete_personal_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.oms_complete_personal_reset(uuid,uuid) to service_role;
