-- Extend verified read-only carrier results to include Pending without changing existing records.
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
    'RTO Delivered','Returned','Cancelled','Delayed','Address Issue','Not Found','Pending');
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
