-- PJS independent OMS only. Schema-only: no customer data is deleted at install.
-- Permanent reset is limited to the authenticated person's OWN personal records.
-- Related private storage is removed by a JWT-verified Edge Function between phases.
create table if not exists public.oms_workspace_reset_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'preparing' check (state in ('preparing','completed')),
  expected_count int not null check (expected_count between 1 and 1000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_count int not null default 0
);
create unique index if not exists oms_workspace_reset_one_pending
 on public.oms_workspace_reset_sessions(user_id) where state='preparing';
alter table public.oms_workspace_reset_sessions enable row level security;
revoke all on public.oms_workspace_reset_sessions from public,anon,authenticated;
grant select on public.oms_workspace_reset_sessions to authenticated;
drop policy if exists oms_workspace_reset_owner_read on public.oms_workspace_reset_sessions;
create policy oms_workspace_reset_owner_read on public.oms_workspace_reset_sessions
 for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.oms_prepare_personal_reset(p_owner uuid,p_expected_count integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actual integer; v_id uuid; v_running integer;
begin
 if p_owner is null or p_expected_count not between 1 and 1000 then
   raise exception 'Invalid personal reset request';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_owner::text));
 select id into v_id from public.oms_workspace_reset_sessions
  where user_id=p_owner and state='preparing' for update;
 if v_id is not null then
   select count(*) into v_actual from public.oms_processes
    where user_id=p_owner and team_id is null
      and data->>'__pending_workspace_reset'=v_id::text;
   if v_actual<>p_expected_count then
     raise exception 'Existing reset in progress has a different record count; contact administrator';
   end if;
   return v_id;
 end if;
 perform 1 from public.oms_processes where user_id=p_owner and team_id is null for update;
 select count(*) into v_actual from public.oms_processes
  where user_id=p_owner and team_id is null;
 if v_actual<>p_expected_count then raise exception 'Process count changed. Refresh preview.'; end if;
 if exists(select 1 from public.oms_jobs j join public.oms_processes p on p.id=j.process_id
           where p.user_id=p_owner and p.team_id is null and j.status='running')
    or exists(select 1 from public.oms_cloud_jobs j join public.oms_processes p on p.id=j.process_id
           where p.user_id=p_owner and p.team_id is null and j.status='running') then
   raise exception 'A real automation job is running. Wait for it to finish before clearing records.';
 end if;
 -- Safely stop every queued job; worker claims require a non-trashed process.
 update public.oms_jobs j set status='cancelled',updated_at=now(),
    error_message='Cancelled by explicitly confirmed personal workspace reset'
  from public.oms_processes p
  where j.process_id=p.id and p.user_id=p_owner and p.team_id is null and j.status='queued';
 update public.oms_cloud_jobs j set status='cancelled',updated_at=now(),
    error_message='Cancelled by explicitly confirmed personal workspace reset'
  from public.oms_processes p
  where j.process_id=p.id and p.user_id=p_owner and p.team_id is null and j.status='queued';
 insert into public.oms_workspace_reset_sessions(user_id,expected_count)
 values(p_owner,p_expected_count) returning id into v_id;
 update public.oms_processes
  set deleted_at=coalesce(deleted_at,now()),
   data=coalesce(data,'{}'::jsonb)||jsonb_build_object('__pending_workspace_reset',v_id::text)
  where user_id=p_owner and team_id is null;
 return v_id;
end; $$;
revoke all on function public.oms_prepare_personal_reset(uuid,integer) from public,anon,authenticated;
grant execute on function public.oms_prepare_personal_reset(uuid,integer) to service_role;

create or replace function public.oms_complete_personal_reset(p_owner uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer;v_expected integer;v_deleted integer;v_albums integer;
begin
 perform pg_advisory_xact_lock(hashtext(p_owner::text));
 select expected_count into v_expected from public.oms_workspace_reset_sessions
  where id=p_session and user_id=p_owner and state='preparing' for update;
 if not found then raise exception 'Reset session missing or already completed'; end if;
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
 if exists(select 1 from public.oms_jobs where process_id in
    (select id from public.oms_processes where user_id=p_owner and team_id is null)
    and status='running') then raise exception 'Running job detected; cannot finalize'; end if;
 -- Albums are independently keyed by Process No. and user, not process_id.
 delete from public.oms_done_pick_albums a
 where a.user_id=p_owner and a.process_no in
  (select process_no from public.oms_processes where user_id=p_owner and team_id is null);
 get diagnostics v_albums=row_count;
 -- Delete event history only for processes removed, including events with process_no.
 delete from public.oms_events e
 where e.user_id=p_owner and (
   e.process_id in (select id from public.oms_processes where user_id=p_owner and team_id is null)
   or e.process_no in (select process_no from public.oms_processes where user_id=p_owner and team_id is null)
 );
 delete from public.oms_agent_tasks t
 where t.user_id=p_owner and t.process_no in
    (select process_no from public.oms_processes where user_id=p_owner and team_id is null);
 delete from public.oms_processes
  where user_id=p_owner and team_id is null
    and data->>'__pending_workspace_reset'=p_session::text;
 get diagnostics v_deleted=row_count;
 if v_deleted<>v_expected then raise exception 'Unexpected deletion count; transaction rolled back'; end if;
 update public.oms_workspace_reset_sessions
   set state='completed',completed_at=now(),deleted_count=v_deleted where id=p_session;
 return jsonb_build_object('deleted_processes',v_deleted,'deleted_albums',v_albums,
   'scope','personal_only','managed_supabase_backups_untouched',true);
end; $$;
revoke all on function public.oms_complete_personal_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.oms_complete_personal_reset(uuid,uuid) to service_role;
