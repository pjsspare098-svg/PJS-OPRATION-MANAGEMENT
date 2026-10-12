-- PJS Independent OMS Outlook draft-only automation.
-- Existing jobs, DataDoc RPCs, and past queued requests remain unchanged.
create table if not exists public.oms_outlook_workers (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 worker_name text not null,
 machine_name text not null default '',
 status text not null default 'offline'
   check (status in ('ready','idle','busy','paused','error','offline')),
 current_job_id uuid references public.oms_jobs(id) on delete set null,
 details jsonb not null default '{}'::jsonb,
 last_seen_at timestamptz not null default now()
);
alter table public.oms_outlook_workers enable row level security;
drop policy if exists oms_outlook_workers_read on public.oms_outlook_workers;
create policy oms_outlook_workers_read on public.oms_outlook_workers
 for select to authenticated using(owner_id = (select auth.uid()));
revoke all on public.oms_outlook_workers from anon,authenticated;
grant select on public.oms_outlook_workers to authenticated;

create or replace function public.oms_claim_outlook_draft(
 p_worker_name text, p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
  raise exception 'Worker identity is required';
 end if;
 return query
 with candidate as (
  select j.id
  from public.oms_jobs j
  join public.oms_processes p on p.id=j.process_id
  join public.oms_documents d on d.process_id=p.id
     and d.user_id=j.user_id and d.kind='emailDoc'
     and d.id::text = j.payload->>'email_document_id'
  where j.user_id=p_owner_id
   and j.job_type='email_reply'
   and j.status='queued'
   and j.office_execution='manual'
   and j.process_no=p.process_no
   and p.user_id=p_owner_id
   and p.deleted_at is null
   and j.payload->>'automation_version'='outlook_draft_v1'
   and j.payload->>'approved_for_draft'='true'
   and j.payload->>'auto_send'='false'
   and j.payload->>'reply_all'='true'
   and d.path like (j.user_id::text||'/'||p.id::text||'/%')
  order by j.created_at,j.id
  for update of j skip locked
  limit 1
 )
 update public.oms_jobs j
  set status='running',progress=10,started_at=now(),updated_at=now(),
  worker_name=p_worker_name,error_message=null
 from candidate
 where j.id=candidate.id and j.status='queued'
 returning j.*;
end;
$$;
revoke all on function public.oms_claim_outlook_draft(text,uuid) from public,anon,authenticated;
grant execute on function public.oms_claim_outlook_draft(text,uuid) to service_role;

create or replace function public.oms_finish_outlook_draft(
 p_job_id uuid,p_worker_name text,p_success boolean,p_details text default ''
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 v_job public.oms_jobs%rowtype;
 v_details text:=left(coalesce(p_details,''),1000);
begin
 select * into v_job from public.oms_jobs
 where id=p_job_id and job_type='email_reply'
  and status='running' and worker_name=p_worker_name
  and payload->>'automation_version'='outlook_draft_v1'
  and payload->>'auto_send'='false'
 for update;
 if not found then raise exception 'Not an active Outlook draft claim for this worker'; end if;
 update public.oms_jobs
 set status=case when p_success then 'completed' else 'failed' end,
     progress=case when p_success then 100 else progress end,
     result=jsonb_build_object('worker',p_worker_name,'draft_saved',p_success,
         'email_sent',false,'message',v_details),
     error_message=case when p_success then null
       else 'Outlook draft requires manual review. Do not automatically retry. '||v_details end,
     finished_at=now(),updated_at=now()
 where id=p_job_id;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_job.user_id,v_job.process_id,v_job.process_no,
  case when p_success then 'Outlook Reply All draft prepared' else 'Outlook Reply All draft needs review' end,
  jsonb_build_object('job_id',p_job_id,'worker',p_worker_name,'draft_saved',p_success,'email_sent',false));
 insert into public.oms_agent_notifications(user_id,kind,title,body)
 values(v_job.user_id,'update',
 case when p_success then 'Review Outlook draft: ' else 'Outlook draft needs review: ' end||v_job.process_no,
 left(v_details,600));
 return true;
end;
$$;
revoke all on function public.oms_finish_outlook_draft(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.oms_finish_outlook_draft(uuid,text,boolean,text) to service_role;

create or replace function public.oms_cancel_outlook_draft(p_job_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_job public.oms_jobs%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.oms_jobs
  set status='cancelled',updated_at=now(),finished_at=now(),
      result=jsonb_build_object('cancelled_by',auth.uid(),'email_sent',false)
 where id=p_job_id and user_id=auth.uid()
  and job_type='email_reply' and status='queued'
 returning * into v_job;
 return found;
end;
$$;
revoke all on function public.oms_cancel_outlook_draft(uuid) from public,anon;
grant execute on function public.oms_cancel_outlook_draft(uuid) to authenticated;
