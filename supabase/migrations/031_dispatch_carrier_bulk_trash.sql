-- PJS OMS: recoverable carrier-scoped bulk cleanup for Dispatch Tracking.
-- Creating these functions NEVER changes an existing process, job or event.
-- Only the signed-in owner can invoke the explicit, confirmed APPLY function.
-- Excludes shared-team processes, processes outside Dispatch Tracking, and
-- every process with any queued or running job (not merely tracking jobs).

create or replace function public.oms_tracking_carrier_key(p_transporter text)
returns text language sql immutable set search_path='' as $$
  with t as (
    select pg_catalog.regexp_replace(
      pg_catalog.upper(pg_catalog.trim(coalesce(p_transporter,''))),
      '[[:space:]_-]+',' ','g'
    ) as value
  )
  select case
    when pg_catalog.position('SHREE MARUTI' in value)>0
      or pg_catalog.position('ARHAM ENTERPRISE' in value)>0 then 'SHREE MARUTI'
    when pg_catalog.position('TCI EXPRESS' in value)>0 then 'TCI EXPRESS'
    when pg_catalog.position('TCI FREIGHT' in value)>0 then 'TCI FREIGHT'
    when pg_catalog.position('V EXPRESS' in value)>0
      or pg_catalog.position('V XPRESS' in value)>0
      or pg_catalog.position('VXPRESS' in value)>0 then 'V EXPRESS'
    when pg_catalog.position('V TRANS' in value)>0
      or pg_catalog.position('VTRANS' in value)>0 then 'V TRANS'
    when value ~ '(^| )DTDC( |$)' then 'DTDC'
    when value ~ '(^| )ACPL( |$)' then 'ACPL'
    when value ~ '(^| )ARC( |$)' then 'ARC'
    when value ~ '(^| )VRL( |$)' then 'VRL'
    else null
  end from t;
$$;
revoke all on function public.oms_tracking_carrier_key(text)
  from public,anon,authenticated;

create or replace function public.oms_preview_dispatch_carrier_trash(p_carrier text)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_carrier text := public.oms_tracking_carrier_key(p_carrier);
  v_total int := 0;
  v_eligible int := 0;
  v_blocked int := 0;
  v_shared int := 0;
  v_fingerprint text;
  v_blocked_nos jsonb;
begin
  if v_uid is null then raise exception 'Sign in before previewing carrier cleanup'; end if;
  if v_carrier is null or trim(coalesce(p_carrier,'')) <> v_carrier then
    raise exception 'Choose one exact transporter in the Tracking filter (not All carriers)';
  end if;

  -- Owner scope is enforced inside the database; never use a supplied user ID.
  -- Include owner's shared-team processes in the visible count but never delete them.
  with matches as (
    select p.id,p.process_no,p.updated_at,p.team_id,
      exists(
        select 1 from public.oms_jobs j
        where j.process_id=p.id and j.status in ('queued','running')
      ) as blocked
    from public.oms_processes p
    where p.user_id=v_uid and p.deleted_at is null
      and lower(trim(coalesce(p.data->>'stage','')))='dispatch tracking'
      and public.oms_tracking_carrier_key(p.data->>'transporter')=v_carrier
  )
  select count(*)::int,
    count(*) filter(where team_id is null and not blocked)::int,
    count(*) filter(where team_id is null and blocked)::int,
    count(*) filter(where team_id is not null)::int,
    md5(coalesce(string_agg(
      id::text||':'||process_no||':'||updated_at::text||':'||
      coalesce(team_id::text,'personal')||':'||blocked::text,
      '|' order by id
    ),'')),
    coalesce(jsonb_agg(process_no order by process_no)
      filter(where team_id is null and blocked),'[]'::jsonb)
  into v_total,v_eligible,v_blocked,v_shared,v_fingerprint,v_blocked_nos
  from matches;

  return jsonb_build_object(
    'carrier',v_carrier,'total_owned',v_total,'eligible',v_eligible,
    'blocked',v_blocked,'shared',v_shared,
    'blocked_processes',v_blocked_nos,
    'fingerprint',v_fingerprint,
    'recoverable',true,'processes_deleted_permanently',false
  );
end;
$$;
revoke all on function public.oms_preview_dispatch_carrier_trash(text)
  from public,anon,authenticated;
grant execute on function public.oms_preview_dispatch_carrier_trash(text)
  to authenticated;

create or replace function public.oms_move_dispatch_carrier_to_trash(
  p_carrier text,p_expected_fingerprint text,p_confirmation text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_carrier text := public.oms_tracking_carrier_key(p_carrier);
  v_preview jsonb;
  v_moved int := 0;
begin
  if v_uid is null then raise exception 'Sign in before changing processes'; end if;
  if v_carrier is null or trim(coalesce(p_carrier,'')) <> v_carrier then
    raise exception 'Choose a specific supported transporter; All carriers cannot be deleted';
  end if;
  if p_confirmation is distinct from 'DELETE '||v_carrier then
    raise exception 'Type DELETE followed by the exact transporter name to confirm';
  end if;
  if p_expected_fingerprint is null
    or p_expected_fingerprint !~ '^[0-9a-f]{32}$' then
    raise exception 'Preview carrier cleanup first';
  end if;

  -- Block new job inserts/claims briefly while verifying and moving this batch.
  -- No jobs are cancelled, deleted, changed, claimed or retried here.
  lock table public.oms_jobs in share row exclusive mode;

  -- Lock the exact owner-scoped set before comparing with the preview.
  -- This prevents carrier/stage edits while the cleanup is being committed.
  perform p.id from public.oms_processes p
  where p.user_id=v_uid and p.deleted_at is null
    and lower(trim(coalesce(p.data->>'stage','')))='dispatch tracking'
    and public.oms_tracking_carrier_key(p.data->>'transporter')=v_carrier
  order by p.id for update;

  v_preview:=public.oms_preview_dispatch_carrier_trash(v_carrier);
  if v_preview->>'fingerprint' is distinct from p_expected_fingerprint then
    raise exception 'Carrier processes or job statuses have changed. Refresh the preview before confirming.';
  end if;
  if (v_preview->>'eligible')::int < 1 then
    raise exception 'No eligible personal processes for this transporter. Running jobs must be reviewed separately.';
  end if;

  with moved as (
    update public.oms_processes p
      set deleted_at=now(),updated_at=now()
    where p.user_id=v_uid and p.team_id is null and p.deleted_at is null
      and lower(trim(coalesce(p.data->>'stage','')))='dispatch tracking'
      and public.oms_tracking_carrier_key(p.data->>'transporter')=v_carrier
      and not exists(
        select 1 from public.oms_jobs j
        where j.process_id=p.id and j.status in ('queued','running')
      )
    returning p.id,p.process_no
  ), logged as (
    insert into public.oms_events(user_id,process_id,process_no,action,details)
    select v_uid,m.id,m.process_no,
      'Tracking process moved to Deleted Processes (transporter bulk)',
      jsonb_build_object('carrier',v_carrier,'recoverable',true,
        'original_documents_preserved',true,'queued_running_jobs_excluded',true)
    from moved m
    returning id
  )
  select count(*)::int into v_moved from logged;

  if v_moved<>(v_preview->>'eligible')::int then
    raise exception 'Carrier cleanup changed during execution; no processes were moved. Refresh and retry.';
  end if;

  return jsonb_build_object(
    'carrier',v_carrier,'moved',v_moved,
    'blocked',(v_preview->>'blocked')::int,
    'shared',(v_preview->>'shared')::int,
    'recoverable',true
  );
end;
$$;
revoke all on function public.oms_move_dispatch_carrier_to_trash(text,text,text)
  from public,anon,authenticated;
grant execute on function public.oms_move_dispatch_carrier_to_trash(text,text,text)
  to authenticated;
