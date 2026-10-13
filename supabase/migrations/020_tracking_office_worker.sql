-- Independent OMS only: connect explicit carrier tracking requests to a real office worker.
-- No existing job is automatically approved or claimed by this migration.
create table if not exists public.oms_tracking_workers (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 worker_name text not null,
 machine_name text not null default '',
 status text not null default 'offline'
   check (status in ('ready','idle','busy','paused','error','offline')),
 current_job_id uuid references public.oms_jobs(id) on delete set null,
 details jsonb not null default '{}'::jsonb,
 last_seen_at timestamptz not null default now()
);
alter table public.oms_tracking_workers enable row level security;
drop policy if exists oms_tracking_workers_read on public.oms_tracking_workers;
create policy oms_tracking_workers_read on public.oms_tracking_workers
 for select to authenticated using(owner_id = (select auth.uid()));
revoke all on public.oms_tracking_workers from public, anon, authenticated;
grant select on public.oms_tracking_workers to authenticated;

create or replace function public.oms_claim_approved_tracking(
 p_worker_name text, p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path = '' as $$
begin
 if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
   raise exception 'Tracking worker identity is required';
 end if;
 return query
 with candidate as (
   select j.id from public.oms_jobs j
   join public.oms_processes p on p.id=j.process_id
   where j.user_id=p_owner_id and p.user_id=p_owner_id
     and p.deleted_at is null and p.process_no=j.process_no
     and lower(trim(coalesce(p.data->>'stage','')))='dispatch tracking'
     and j.job_type='tracking' and j.status='queued'
     and j.office_execution='manual'
     and j.payload->>'tracking_version'='carrier_track_v1'
     and j.payload->>'approved_for_tracking'='true'
     and nullif(trim(j.payload->>'transporter'),'') is not null
     and nullif(trim(j.payload->>'tracking_id'),'') is not null
     and trim(coalesce(p.data->>'transporter',''))=trim(j.payload->>'transporter')
     and trim(coalesce(p.data->>'lr',''))=trim(j.payload->>'tracking_id')
   order by j.created_at,j.id for update of j skip locked limit 1
 )
 update public.oms_jobs j set status='running',progress=10,
   started_at=now(),updated_at=now(),worker_name=p_worker_name,error_message=null
 from candidate where j.id=candidate.id and j.status='queued'
 returning j.*;
end;
$$;
revoke all on function public.oms_claim_approved_tracking(text,uuid) from public,anon,authenticated;
grant execute on function public.oms_claim_approved_tracking(text,uuid) to service_role;

create or replace function public.oms_finish_tracking(
 p_job_id uuid, p_worker_name text, p_success boolean,
 p_status text default '', p_detail text default '', p_delivery_date text default ''
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
 v_job public.oms_jobs%rowtype;
 v_process public.oms_processes%rowtype;
 v_status text := left(trim(coalesce(p_status,'')),60);
 v_detail text := left(coalesce(p_detail,''),900);
 v_date text := left(trim(coalesce(p_delivery_date,'')),100);
 v_previous text;
 v_verified boolean;
begin
 select * into v_job from public.oms_jobs
 where id=p_job_id and status='running' and job_type='tracking'
   and worker_name=p_worker_name
   and payload->>'tracking_version'='carrier_track_v1'
   and payload->>'approved_for_tracking'='true'
 for update;
 if not found then raise exception 'Tracking job is not an active claim of this worker'; end if;
 select * into v_process from public.oms_processes
 where id=v_job.process_id and user_id=v_job.user_id
   and process_no=v_job.process_no and deleted_at is null for update;
 if not found then raise exception 'Tracking process no longer accessible; reconcile manually'; end if;
 if trim(coalesce(v_process.data->>'transporter','')) is distinct from trim(v_job.payload->>'transporter')
    or trim(coalesce(v_process.data->>'lr','')) is distinct from trim(v_job.payload->>'tracking_id')
    or lower(trim(coalesce(v_process.data->>'stage',''))) <> 'dispatch tracking' then
   raise exception 'Process carrier, LR or stage changed during tracking; reconcile manually';
 end if;
 v_verified := p_success and v_status in
   ('Delivered','In Transit','Out for Delivery','Undelivered','RTO',
    'RTO Delivered','Returned','Cancelled','Delayed','Address Issue','Not Found');
 if p_success and not v_verified then
   raise exception 'Refusing unverified carrier outcome';
 end if;
 if v_verified then
   v_previous := trim(coalesce(v_process.data->>'trackingStatus',''));
   -- Never downgrade a previously confirmed delivery because a carrier lookup is stale.
   if v_previous not in ('Delivered','RTO Delivered') or v_status in ('Delivered','RTO Delivered') then
      update public.oms_processes
      set data=coalesce(data,'{}'::jsonb) || jsonb_build_object(
        'status',v_status,'trackingStatus',v_status,
        'trackingDetail',v_detail,'trackingCheckedAt',now()::text,
        'trackingDeliveryDate',v_date,'trackingCarrier',v_job.payload->>'transporter',
        'trackingId',v_job.payload->>'tracking_id'),
        updated_at=now()
      where id=v_process.id;
   end if;
 end if;
 update public.oms_jobs set
   status=case when v_verified then 'completed' else 'failed' end,
   progress=case when v_verified then 100 else progress end,
   result=jsonb_build_object('worker',p_worker_name,'verified',v_verified,
     'carrier',v_job.payload->>'transporter','tracking_id',v_job.payload->>'tracking_id',
     'status',v_status,'detail',v_detail,'delivery_date',v_date),
   error_message=case when v_verified then null
     else 'Carrier lookup inconclusive or failed. Review status before requeueing: '||v_detail end,
   finished_at=now(),updated_at=now()
 where id=p_job_id;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_job.user_id,v_job.process_id,v_job.process_no,
   case when v_verified then 'Carrier tracking checked' else 'Carrier tracking needs review' end,
   jsonb_build_object('job_id',p_job_id,'worker',p_worker_name,
     'carrier',v_job.payload->>'transporter','status',v_status,'verified',v_verified));
 insert into public.oms_agent_notifications(user_id,kind,title,body)
 values(v_job.user_id,'update',
   case when v_verified then 'Carrier checked: ' else 'Review tracking: ' end||v_job.process_no,
   left(coalesce(nullif(v_detail,''),v_status),300));
 return true;
end;
$$;
revoke all on function public.oms_finish_tracking(uuid,text,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.oms_finish_tracking(uuid,text,boolean,text,text,text) to service_role;
