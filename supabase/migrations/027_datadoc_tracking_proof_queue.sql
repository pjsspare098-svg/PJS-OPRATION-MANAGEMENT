-- PJS independent DataDoc tracking-proof transactions.
-- A separate authorized Windows worker claims only explicitly approved screenshot jobs.
-- Never automatically resubmit uncertain/failed external operations.
create table if not exists public.oms_datadoc_proof_workers (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 worker_name text not null,
 machine_name text not null default '',
 status text not null default 'offline'
  check (status in ('ready','idle','busy','paused','error','offline')),
 current_job_id uuid references public.oms_jobs(id) on delete set null,
 details jsonb not null default '{}'::jsonb,
 last_seen_at timestamptz not null default now()
);
alter table public.oms_datadoc_proof_workers enable row level security;
drop policy if exists oms_datadoc_proof_workers_read on public.oms_datadoc_proof_workers;
create policy oms_datadoc_proof_workers_read on public.oms_datadoc_proof_workers
 for select to authenticated using (owner_id=(select auth.uid()));
revoke all on public.oms_datadoc_proof_workers from public,anon,authenticated;
grant select on public.oms_datadoc_proof_workers to authenticated;

create or replace function public.oms_approve_datadoc_tracking_proof(
 p_process_id uuid,p_document_id uuid,p_acknowledged boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
 v_owner uuid := (select auth.uid());
 v_process public.oms_processes%rowtype;
 v_document public.oms_documents%rowtype;
 v_job_id uuid;
 v_credit text;
 v_sales text;
begin
 if v_owner is null or p_acknowledged is distinct from true then
  raise exception 'Owner confirmation is required for an actual DataDoc submission';
 end if;
 select * into v_process from public.oms_processes
 where id=p_process_id and user_id=v_owner and deleted_at is null for update;
 if not found then raise exception 'Cannot approve a different or deleted process'; end if;
 if lower(trim(coalesce(v_process.data->>'stage',''))) not in ('dispatch tracking','delivery proof') then
  raise exception 'Move process to Dispatch Tracking or Delivery Proof first';
 end if;
 if v_process.process_no !~ '^[0-9]{5,9}$' then
  raise exception 'Invalid DataDoc Process No.'; end if;
 select * into v_document from public.oms_documents
 where id=p_document_id and process_id=p_process_id and user_id=v_owner
   and kind='trackingShotDoc';
 if not found then raise exception 'Select a saved tracking screenshot for this process'; end if;
 if v_document.name !~* '\.(png|jpe?g)$' then
  raise exception 'Tracking proof must be a JPG or PNG screenshot'; end if;
 v_credit:=trim(coalesce(v_process.data->>'credit',''));
 v_sales:=trim(coalesce(v_process.data->>'sales',''));
 if v_credit not in ('Credit','Non Credit') then
  raise exception 'Set Credit or Non Credit in the process editor'; end if;
 if v_sales='' then raise exception 'Select Sales Person in the process editor'; end if;
 if v_credit='Non Credit' and
    lower(v_sales) not like 'deepa%' and lower(v_sales) not like 'ankita%' then
  raise exception 'Non Credit next work is not configured for this salesperson; manual DataDoc review required';
 end if;
 if exists(select 1 from public.oms_jobs where process_id=p_process_id
   and job_type='delivery_proof_submit' and status in ('queued','running','completed')) then
  raise exception 'Tracking proof already queued or submitted. Review existing DataDoc proof before trying again';
 end if;
 insert into public.oms_jobs(user_id,process_id,process_no,job_type,status,
   office_execution,payload)
 values (v_owner,p_process_id,v_process.process_no,'delivery_proof_submit','queued',
  'manual',jsonb_build_object(
   'proof_version','datadoc_tracking_proof_v1','approved_for_proof',true,
   'screenshot_document_id',p_document_id,'credit_type',v_credit,
   'sales_person',v_sales,'stage',v_process.data->>'stage',
   'screenshot_status',coalesce(v_process.data->>'trackingCaptureStatus',''),
   'operator_approved_at',now(),'requires_office_worker',true,
   'confirmed_external_submit',true,'auto_retry',false))
 returning id into v_job_id;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_owner,p_process_id,v_process.process_no,'DataDoc Tracking Proof approved',
  jsonb_build_object('job_id',v_job_id,'document_id',p_document_id,'sales_person',v_sales,
   'credit_type',v_credit,'actual_datadoc_submit_approved',true));
 return v_job_id;
end;$$;
revoke all on function public.oms_approve_datadoc_tracking_proof(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.oms_approve_datadoc_tracking_proof(uuid,uuid,boolean) to authenticated;

create or replace function public.oms_claim_datadoc_tracking_proof(
 p_worker_name text,p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path = '' as $$
begin
 if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
  raise exception 'Proof worker identity required'; end if;
 return query
 with candidate as (
 select j.id from public.oms_jobs j join public.oms_processes p on p.id=j.process_id
 join public.oms_documents d
   on d.id=(j.payload->>'screenshot_document_id')::uuid
   and d.process_id=j.process_id and d.user_id=j.user_id and d.kind='trackingShotDoc'
 where j.user_id=p_owner_id and p.user_id=p_owner_id
 and j.job_type='delivery_proof_submit' and j.status='queued'
 and j.office_execution='manual'
 and j.payload->>'proof_version'='datadoc_tracking_proof_v1'
 and j.payload->>'approved_for_proof'='true'
 and p.deleted_at is null and p.process_no=j.process_no
 and lower(trim(coalesce(p.data->>'stage',''))) in ('dispatch tracking','delivery proof')
 and p.data->>'credit'=j.payload->>'credit_type'
 and p.data->>'sales'=j.payload->>'sales_person'
 and exists(select 1 from public.oms_datadoc_proof_workers w
    where w.owner_id=p_owner_id and w.worker_name=p_worker_name
    and w.details->>'proof_version'='datadoc_tracking_proof_v1'
    and w.details->>'live_enabled'='true')
 order by j.created_at,j.id
 for update of j skip locked limit 1
 )
 update public.oms_jobs j set status='running',progress=10,
  started_at=now(),updated_at=now(),worker_name=p_worker_name,error_message=null
 from candidate where j.id=candidate.id and j.status='queued'
 returning j.*;
end;$$;
revoke all on function public.oms_claim_datadoc_tracking_proof(text,uuid) from public,anon,authenticated;
grant execute on function public.oms_claim_datadoc_tracking_proof(text,uuid) to service_role;

create or replace function public.oms_finish_datadoc_tracking_proof(
 p_job_id uuid,p_worker_name text,p_success boolean,p_detail text default '',
 p_next_work text default '',p_next_user text default ''
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
 v_job public.oms_jobs%rowtype;
 v_process public.oms_processes%rowtype;
 v_success boolean;
begin
 select * into v_job from public.oms_jobs
 where id=p_job_id and job_type='delivery_proof_submit'
 and status='running' and worker_name=p_worker_name
 and payload->>'proof_version'='datadoc_tracking_proof_v1'
 and payload->>'approved_for_proof'='true'
 for update;
 if not found then raise exception 'Proof job is not an active worker claim'; end if;
 select * into v_process from public.oms_processes
 where id=v_job.process_id and user_id=v_job.user_id
   and process_no=v_job.process_no and deleted_at is null for update;
 if not found then raise exception 'Source process changed or deleted. Manual reconciliation required'; end if;
 v_success:=coalesce(p_success,false) and trim(coalesce(p_next_work,''))<>'' and trim(coalesce(p_next_user,''))<>'';
 if v_success then
  update public.oms_processes set
   data=coalesce(data,'{}'::jsonb) || jsonb_build_object(
    'trackingProofSubmittedAt',now()::text,
    'trackingProofDocumentId',v_job.payload->>'screenshot_document_id',
    'trackingProofNextWork',left(p_next_work,150),
    'trackingProofNextUser',left(p_next_user,150),
    'trackingProofSource','datadoc_confirmed_by_worker'),
   updated_at=now()
  where id=v_process.id;
 end if;
 update public.oms_jobs set status=case when v_success then 'completed' else 'failed' end,
  progress=case when v_success then 100 else progress end,
  result=jsonb_build_object('worker',p_worker_name,'submitted',v_success,
   'proof_document_id',v_job.payload->>'screenshot_document_id',
   'next_work',left(coalesce(p_next_work,''),150),
   'next_user',left(coalesce(p_next_user,''),150),
   'detail',left(coalesce(p_detail,''),1000)),
  error_message=case when v_success then null else
   'DataDoc result uncertain; inspect portal before retrying: '||left(coalesce(p_detail,''),850) end,
  updated_at=now(),finished_at=now()
 where id=p_job_id;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_job.user_id,v_job.process_id,v_job.process_no,
  case when v_success then 'DataDoc Tracking Proof submitted' else 'DataDoc Tracking Proof needs review' end,
  jsonb_build_object('job_id',p_job_id,'worker',p_worker_name,'submitted',v_success,
   'detail',left(coalesce(p_detail,''),850)));
 insert into public.oms_agent_notifications(user_id,kind,title,body)
 values(v_job.user_id,'update',
  case when v_success then 'Proof uploaded: ' else 'Review proof: ' end || v_job.process_no,
  left(coalesce(p_detail,''),300));
 return true;
end;$$;
revoke all on function public.oms_finish_datadoc_tracking_proof(uuid,text,boolean,text,text,text)
 from public,anon,authenticated;
grant execute on function public.oms_finish_datadoc_tracking_proof(uuid,text,boolean,text,text,text)
 to service_role;
