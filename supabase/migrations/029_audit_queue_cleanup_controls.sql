-- PJS independent OMS Audit & Reports clean-up controls.
-- Installing this migration never deletes an event, document, process or job
-- and never changes any existing job's status.
-- Actual actions require the currently authenticated owner to opt in.

create table if not exists public.oms_audit_view_scopes (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  hidden_before timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, scope),
  constraint oms_audit_scope_format check (
    scope = '*' or scope ~ '^[0-9]{5,10}$'
  )
);
alter table public.oms_audit_view_scopes enable row level security;
revoke all on public.oms_audit_view_scopes from public,anon,authenticated;
grant select on public.oms_audit_view_scopes to authenticated;
drop policy if exists oms_audit_view_scope_owner_read on public.oms_audit_view_scopes;
create policy oms_audit_view_scope_owner_read
 on public.oms_audit_view_scopes for select to authenticated
 using(user_id=(select auth.uid()));

-- Hiding means a personal VIEW preference only, not deleting an audit record.
-- This scope can be global (*) or one owned Process No.
create or replace function public.oms_archive_audit_view(p_scope text)
returns timestamptz
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
  v_scope text:=trim(coalesce(p_scope,''));
  v_hidden timestamptz:=clock_timestamp();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_scope<>'*' and v_scope !~ '^[0-9]{5,10}$' then
    raise exception 'Use ALL or an exact numeric Process No.';
  end if;
  if v_scope<>'*' and not (
    exists(select 1 from public.oms_processes where user_id=v_uid and process_no=v_scope)
    or exists(select 1 from public.oms_events where user_id=v_uid and process_no=v_scope)
    or exists(select 1 from public.oms_jobs where user_id=v_uid and process_no=v_scope)
  ) then
    raise exception 'Process number not found in your personal audit history';
  end if;
  insert into public.oms_audit_view_scopes(user_id,scope,hidden_before,updated_at)
    values(v_uid,v_scope,v_hidden,v_hidden)
  on conflict(user_id,scope) do update set
    hidden_before=greatest(public.oms_audit_view_scopes.hidden_before,excluded.hidden_before),
    updated_at=excluded.updated_at;
  insert into public.oms_events(user_id,process_id,process_no,action,details)
    values(v_uid,null,case when v_scope='*' then '' else v_scope end,
     'Audit display cleared (history retained)',
     jsonb_build_object('scope',v_scope,'hidden_before',v_hidden,
       'audit_records_deleted',false,'processes_changed',false));
  return v_hidden;
end;
$$;
revoke all on function public.oms_archive_audit_view(text) from public,anon,authenticated;
grant execute on function public.oms_archive_audit_view(text) to authenticated;

-- Atomic cancel cannot race with the office worker's FOR UPDATE claim.
-- Never remove a queued job; preserve it with a cancelled status and event.
create or replace function public.oms_cancel_queued_job(
 p_job_id uuid,p_process_no text
) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
 v_job public.oms_jobs%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required';end if;
 if p_job_id is null or trim(coalesce(p_process_no,''))='' then
   raise exception 'Job ID and Process No. are required';
 end if;
 select * into v_job from public.oms_jobs
 where id=p_job_id and user_id=v_uid and process_no=p_process_no
   and status='queued'
 for update;
 if not found then return false;end if;
 update public.oms_jobs
 set status='cancelled',finished_at=now(),updated_at=now(),
     error_message='Cancelled by the process owner before worker claim',
     result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
        'cancelled_by',v_uid,'cancel_reason','owner_requested',
        'external_action_performed',false)
 where id=v_job.id and status='queued';
 if not found then return false;end if;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_uid,v_job.process_id,v_job.process_no,'Queued automation job cancelled',
   jsonb_build_object('job_id',v_job.id,'job_type',v_job.job_type,
                      'worker_claimed',false));
 return true;
end;
$$;
revoke all on function public.oms_cancel_queued_job(uuid,text) from public,anon,authenticated;
grant execute on function public.oms_cancel_queued_job(uuid,text) to authenticated;

-- A running carrier lookup is not deletable. It may be marked failed ONLY
-- after 15 minutes, with a stale tracking-worker heartbeat and explicit
-- operator acknowledgement that the Windows worker was stopped.
-- This must never be available to DataDoc, Outlook or other write workers.
create or replace function public.oms_reconcile_stale_tracking_job(
 p_job_id uuid,p_process_no text,p_reason text,p_worker_stopped boolean
) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
  v_job public.oms_jobs%rowtype;
  v_last_seen timestamptz;
  v_reason text:=trim(coalesce(p_reason,''));
begin
 if v_uid is null then raise exception 'Authentication required';end if;
 if p_worker_stopped is distinct from true then
   raise exception 'Confirm you stopped the Windows carrier worker before resolving this job';
 end if;
 if length(v_reason) not between 12 and 500 then
   raise exception 'Describe the manual verification in 12–500 characters';
 end if;
 select * into v_job from public.oms_jobs
 where id=p_job_id and user_id=v_uid and process_no=p_process_no
   and job_type='tracking' and status='running' for update;
 if not found then return false;end if;
 if v_job.started_at is null or v_job.started_at > now()-interval '15 minutes' then
   raise exception 'Job is too recent to reconcile; wait and check the worker';
 end if;
 select last_seen_at into v_last_seen from public.oms_tracking_workers
 where owner_id=v_uid for update;
 if v_last_seen is null or v_last_seen > now()-interval '5 minutes' then
   raise exception 'Tracking worker heartbeat is recent or unknown; stop the worker and wait 5 minutes';
 end if;
 update public.oms_jobs
 set status='failed',finished_at=now(),updated_at=now(),
     error_message='Stale tracking lookup reconciled by operator; manually verify status before requeue: '||v_reason,
     result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
       'reconciled_stale_tracking',true,'external_result_unverified',true,
       'operator_reason',v_reason,'previous_worker',coalesce(v_job.worker_name,''),
       'reconciled_at',now())
 where id=v_job.id and status='running';
 if not found then return false;end if;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_uid,v_job.process_id,v_job.process_no,'Stale tracking job marked failed for review',
   jsonb_build_object('job_id',v_job.id,'worker',v_job.worker_name,
                      'reason',v_reason,'worker_stopped_acknowledged',true,
                      'last_tracking_heartbeat',v_last_seen));
 return true;
end;
$$;
revoke all on function public.oms_reconcile_stale_tracking_job(uuid,text,text,boolean)
 from public,anon,authenticated;
grant execute on function public.oms_reconcile_stale_tracking_job(uuid,text,text,boolean)
 to authenticated;
