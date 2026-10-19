-- Shree Maruti batch tracking: atomically claim up to 20 independently approved
-- jobs for one authorized owner. No existing jobs are auto-approved.
-- The existing single-job claim/finish RPCs and all other carrier workers remain valid.
create or replace function public.oms_claim_approved_shree_maruti_batch(
  p_worker_name text, p_owner_id uuid, p_limit integer default 20
) returns setof public.oms_jobs
language plpgsql security definer set search_path = '' as $$
begin
  if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
    raise exception 'Tracking worker identity is required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'Shree Maruti batch claim limit must be 1–20';
  end if;
  return query
  with ranked as (
    select j.id, j.process_id, j.created_at,
           row_number() over(partition by j.process_id order by j.created_at,j.id) as rn
    from public.oms_jobs j
    join public.oms_processes p on p.id=j.process_id
    where j.user_id=p_owner_id and p.user_id=p_owner_id
      and p.deleted_at is null and j.process_no=p.process_no
      and lower(trim(coalesce(p.data->>'stage','')))='dispatch tracking'
      and j.job_type='tracking' and j.status='queued'
      and j.office_execution='manual'
      and j.payload->>'tracking_version'='carrier_track_v1'
      and j.payload->>'approved_for_tracking'='true'
      and nullif(trim(j.payload->>'tracking_id'),'') is not null
      and trim(coalesce(p.data->>'transporter',''))=trim(j.payload->>'transporter')
      and trim(coalesce(p.data->>'lr',''))=trim(j.payload->>'tracking_id')
      and (
         upper(coalesce(p.data->>'transporter','')) like '%SHREE MARUTI%'
         or upper(coalesce(p.data->>'transporter','')) like '%ARHAM ENTERPRISE%'
      )
      and coalesce(p.data->>'trackingStatus','') not in ('Delivered','RTO Delivered')
      and not exists (
         select 1 from public.oms_jobs other
         where other.process_id=j.process_id and other.job_type='tracking'
           and other.status='running'
      )
  ), candidate as (
    select j.id
    from public.oms_jobs j
    join ranked r on r.id=j.id and r.rn=1
    where j.status='queued'
    order by r.created_at,j.id
    for update of j skip locked
    limit p_limit
  )
  update public.oms_jobs j
     set status='running', progress=10, started_at=now(),
         updated_at=now(), worker_name=p_worker_name, error_message=null
    from candidate
   where j.id=candidate.id and j.status='queued'
  returning j.*;
end;
$$;
revoke all on function public.oms_claim_approved_shree_maruti_batch(text,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.oms_claim_approved_shree_maruti_batch(text,uuid,integer)
  to service_role;
