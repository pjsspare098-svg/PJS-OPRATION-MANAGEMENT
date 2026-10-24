-- PJS OMS - NEW explicitly approved email sending via Classic Outlook (2026-10-25).
-- Separate from oms_jobs (DataDoc-only), and the retired Outlook DRAFT RPCs.
-- Installation never sends an email or queues a job. Live Windows switch defaults OFF.

create table if not exists public.oms_email_send_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 process_id uuid not null references public.oms_processes(id),
 process_no text not null,
 original_document_id uuid not null references public.oms_documents(id),
 invoice_document_id uuid not null references public.oms_documents(id),
 lr_document_id uuid not null references public.oms_documents(id),
 process_updated_at timestamptz not null,
 status text not null default 'queued' check (status in ('queued','running','completed','review_required','cancelled')),
 worker_name text,
 result jsonb not null default '{}'::jsonb,
 error_message text,
 requested_at timestamptz not null default now(),
 claimed_at timestamptz,
 finished_at timestamptz,
 check(original_document_id<>invoice_document_id and original_document_id<>lr_document_id and invoice_document_id<>lr_document_id)
);

create unique index if not exists oms_email_send_one_attempt_per_process
on public.oms_email_send_requests(process_id) where status<>'cancelled';

create index if not exists oms_email_send_ready_queue
on public.oms_email_send_requests(owner_id,requested_at) where status='queued';

alter table public.oms_email_send_requests enable row level security;
revoke all on public.oms_email_send_requests from anon,authenticated;
grant select on public.oms_email_send_requests to authenticated;
create policy oms_email_send_owner_read
on public.oms_email_send_requests for select to authenticated
using(owner_id=(select auth.uid()));
-- No browser/anon insert/update/delete policy. Only restricted RPC may change jobs.

create or replace function public.oms_request_email_send(
 p_process_id uuid,
 p_original_document_id uuid,
 p_invoice_document_id uuid,
 p_lr_document_id uuid,
 p_confirmation text
) returns public.oms_email_send_requests
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_proc public.oms_processes%rowtype;
 v_result public.oms_email_send_requests%rowtype;
 v_data jsonb;
 v_field text;
 v_required text[]:=array['invoice','so','party','po','poDate','invoiceDate','transporter','lr','courierDate','weight'];
 v_document_id uuid;
 v_kind text;
 v_name text;
 v_mismatch text;
begin
 if v_uid is null then raise exception 'Sign in before requesting Outlook Reply All';end if;
 if p_process_id is null or p_original_document_id is null or
    p_invoice_document_id is null or p_lr_document_id is null then
    raise exception 'Select an original Outlook .eml, Invoice PDF, and LR PDF';
 end if;
 if p_original_document_id=p_invoice_document_id or
    p_original_document_id=p_lr_document_id or
    p_invoice_document_id=p_lr_document_id then
    raise exception 'Each source must be a separate attachment';
 end if;
 select * into v_proc from public.oms_processes
 where id=p_process_id and user_id=v_uid and team_id is null and deleted_at is null
 for update;
 if not found then raise exception 'Personal process not found or not owned by signed-in user';end if;
 if coalesce(trim(v_proc.data->>'stage'),'')<>'Email to Client' then
    raise exception 'Process must still be in Email to Client';
 end if;
 if p_confirmation is distinct from 'SEND '||v_proc.process_no then
    raise exception 'Type SEND followed by this exact Process No. to authorize real email sending';
 end if;
 if coalesce(trim(v_proc.process_no),'')='' then raise exception 'Missing Process No.';end if;
 v_data:=coalesce(v_proc.data,'{}'::jsonb);
 if nullif(trim(v_proc.party_name),'') is null or nullif(trim(v_proc.sales_order_no),'') is null then
   raise exception 'Complete Party Name and SO No. before sending';
 end if;
 -- Required dispatch fields: no partial or default/template values allowed.
 foreach v_field in array v_required loop
   if v_field not in ('party','so') and nullif(trim(coalesce(v_data->>v_field,'')),'') is null then
     raise exception 'Missing dispatch field %; edit the process before sending',v_field;
   end if;
 end loop;
 if not (trim(coalesce(v_data->>'weight','')) ~* '^[0-9]+(\.[0-9]{1,3})?\s*(kg|kgs)?$')
    or coalesce((regexp_replace(trim(coalesce(v_data->>'weight','')), '[^0-9.]','','g'))::numeric,0)<=0 then
   raise exception 'Box Weight (Kgs) must be a positive number';
 end if;
 if exists(
   select 1 from public.oms_email_send_requests j where j.process_id=v_proc.id and j.status<>'cancelled'
 ) then
   raise exception 'This process already has an approved, sent, or review-required email request. Check the status and Outlook Sent Items; do not resend';
 end if;
 for v_document_id,v_kind in
 select id,kind from (values
  (p_original_document_id,'emailDoc'::text),
  (p_invoice_document_id,'invoiceDoc'::text),
  (p_lr_document_id,'lrDoc'::text)
 ) as chosen(id,kind)
 loop
   select name into v_name from public.oms_documents
    where id=v_document_id and user_id=v_uid and process_id=p_process_id
      and deleted_at is null and kind=v_kind;
   if not found then raise exception 'Missing or wrong-process % attachment',v_kind;end if;
   if v_kind='emailDoc' and right(lower(trim(v_name)),4)<>'.eml' then
     raise exception 'Original email must be a saved .eml with Message-ID';
   elsif v_kind<>'emailDoc' and right(lower(trim(v_name)),4)<>'.pdf' then
     raise exception 'Invoice and LR must be PDF attachments';
   end if;
 end loop;
 -- CREATE only. Explicit approval is user-bound and includes immutable IDs.
 insert into public.oms_email_send_requests(
   owner_id,process_id,process_no,original_document_id,invoice_document_id,
   lr_document_id,process_updated_at
 ) values (
   v_uid,v_proc.id,v_proc.process_no,p_original_document_id,p_invoice_document_id,
   p_lr_document_id,v_proc.updated_at
 ) returning * into v_result;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_uid,v_proc.id,v_proc.process_no,'Outlook email send explicitly approved',
   jsonb_build_object('request_id',v_result.id,'original_document_id',p_original_document_id,
   'invoice_document_id',p_invoice_document_id,'lr_document_id',p_lr_document_id,
   'requires_windows_worker',true,'automatic_retry',false,'actual_email_sent',false));
 return v_result;
end;
$$;
revoke all on function public.oms_request_email_send(uuid,uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.oms_request_email_send(uuid,uuid,uuid,uuid,text) to authenticated;

create or replace function public.oms_cancel_email_send(p_request_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_req public.oms_email_send_requests%rowtype;
begin
 if v_uid is null then raise exception 'Sign in';end if;
 select * into v_req from public.oms_email_send_requests
  where id=p_request_id and owner_id=v_uid and status='queued'
  for update;
 if not found then raise exception 'Only an unsent, queued request may be cancelled';end if;
 update public.oms_email_send_requests
  set status='cancelled',finished_at=now(),error_message=null
  where id=v_req.id;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_uid,v_req.process_id,v_req.process_no,'Outlook email request cancelled',
  jsonb_build_object('request_id',v_req.id,'actual_email_sent',false));
 return true;
end;
$$;
revoke all on function public.oms_cancel_email_send(uuid) from public,anon,authenticated;
grant execute on function public.oms_cancel_email_send(uuid) to authenticated;

create or replace function public.oms_claim_email_send(
 p_owner_id uuid,p_worker_name text
) returns setof public.oms_email_send_requests
language plpgsql security definer set search_path=''
as $$
declare
 v_request public.oms_email_send_requests%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Windows worker service authorization required';end if;
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
 if current_user<>'service_role' then raise exception 'Windows worker service authorization required';end if;
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

comment on table public.oms_email_send_requests is
 'Explicit per-process Outlook Reply All send requests. Separate from DataDoc OMS job queue; never retry Running or uncertain sends automatically.';
