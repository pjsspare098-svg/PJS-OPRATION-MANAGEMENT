-- Fix claimed/finish Outlook Send RPCs: SECURITY DEFINER functions must not
-- compare current_user to service_role because current_user becomes the owner.
-- Security is enforced by explicit function EXECUTE grants to service_role only.
-- This migration creates NO email requests and changes NO customer data.

create or replace function public.oms_claim_email_send(
 p_owner_id uuid,p_worker_name text
) returns setof public.oms_email_send_requests
language plpgsql security definer set search_path=''
as $$
declare
 v_request public.oms_email_send_requests%rowtype;
begin
 -- Caller permissions are checked by REVOKE ALL / GRANT EXECUTE below.
 -- SECURITY DEFINER changes current_user to function owner (usually postgres).
 if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
   raise exception 'Invalid worker identity';
 end if;
 -- No age-based recovery of Running jobs: uncertain Outlook Send outcomes must
 -- be manually checked before any further approval.
 select q.* into v_request
 from public.oms_email_send_requests q
 join public.oms_processes p on p.id=q.process_id
 where q.owner_id=p_owner_id and q.status='queued'
   and p.user_id=q.owner_id and p.team_id is null and p.deleted_at is null
   and p.process_no=q.process_no
 order by q.requested_at asc limit 1
 for update of q skip locked;
 if not found then return;end if;
 update public.oms_email_send_requests
 set status='running',worker_name=p_worker_name,claimed_at=now()
 where id=v_request.id returning * into v_request;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_request.owner_id,v_request.process_id,v_request.process_no,
   'Outlook Send worker claimed request',
   jsonb_build_object('request_id',v_request.id,'worker',p_worker_name,'actual_email_sent',false));
 return next v_request;
end;
$$;
revoke all on function public.oms_claim_email_send(uuid,text) from public,anon,authenticated;
grant execute on function public.oms_claim_email_send(uuid,text) to service_role;

create or replace function public.oms_finish_email_send(
 p_request_id uuid,p_worker_name text,p_send_invoked boolean,p_detail text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v_req public.oms_email_send_requests%rowtype;
 v_move integer:=0;
begin
 -- Caller permissions are checked by REVOKE ALL / GRANT EXECUTE below.
 -- SECURITY DEFINER changes current_user to function owner (usually postgres).
 select * into v_req from public.oms_email_send_requests
 where id=p_request_id and status='running' and worker_name=p_worker_name
 for update;
 if not found then raise exception 'Not a running request for this worker; do not retry Send';end if;
 update public.oms_email_send_requests set
  status=case when p_send_invoked then 'completed' else 'review_required' end,
  finished_at=now(),
  error_message=case when p_send_invoked then null else
    'Check Outlook Drafts, Outbox and Sent Items before another attempt. '||left(coalesce(p_detail,''),350) end,
  result=jsonb_build_object(
    'outlook_send_invoked',p_send_invoked,
    'delivery_confirmed',false,
    'message',left(coalesce(p_detail,''),350),
    'worker',p_worker_name
  )
 where id=v_req.id;
 if p_send_invoked then
   -- Stage advances only after the specific Outlook reply.Send() returned
   -- without raising; this confirms Outlook accepted submission, not delivery.
   update public.oms_processes p set
     data=jsonb_set(jsonb_set(coalesce(p.data,'{}'::jsonb),
       '{stage}',to_jsonb('Dispatch Tracking'::text)),
       '{status}',to_jsonb('Pending'::text)),
     updated_at=now()
   where p.id=v_req.process_id and p.user_id=v_req.owner_id and p.team_id is null
     and p.deleted_at is null and p.data->>'stage'='Email to Client';
   get diagnostics v_move=row_count;
 end if;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_req.owner_id,v_req.process_id,v_req.process_no,
  case when p_send_invoked then 'Outlook Reply All submitted for sending'
       else 'Outlook send uncertain - manual reconciliation required' end,
  jsonb_build_object('request_id',v_req.id,'worker',p_worker_name,
    'outlook_send_invoked',p_send_invoked,'delivery_confirmed',false,
    'moved_to_tracking',v_move=1));
 return true;
end;
$$;
revoke all on function public.oms_finish_email_send(uuid,text,boolean,text)
 from public,anon,authenticated;
grant execute on function public.oms_finish_email_send(uuid,text,boolean,text)
 to service_role;

