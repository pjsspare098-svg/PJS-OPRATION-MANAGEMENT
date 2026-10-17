-- Tracking screenshot status and remarks are now typed by a person.
-- Preserve existing screenshot rows, JSON fields and owner protections.
create or replace function public.oms_record_tracking_capture(
 p_process_id uuid, p_document_id uuid, p_status text, p_detail text default ''
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
 v_owner uuid := (select auth.uid());
 v_process public.oms_processes%rowtype;
 v_status text := left(trim(coalesce(p_status,'')),60);
begin
 if v_owner is null then raise exception 'Sign in to save tracking evidence'; end if;
 if v_status not in ('Needs Review','Pending','In Transit','Out for Delivery','Delivered',
   'Undelivered','RTO','Returned','Cancelled','Delayed','Address Issue','Not Found') then
   raise exception 'Invalid manually entered tracking status';
 end if;
 select * into v_process from public.oms_processes
 where id=p_process_id and user_id=v_owner and deleted_at is null for update;
 if not found then raise exception 'Only the process owner may save tracking evidence'; end if;
 if lower(trim(coalesce(v_process.data->>'stage',''))) <> 'dispatch tracking' then
   raise exception 'This process is no longer in Dispatch Tracking';
 end if;
 if not exists(select 1 from public.oms_documents d
    where d.id=p_document_id and d.process_id=p_process_id and d.user_id=v_owner
    and d.kind='trackingShotDoc') then
   raise exception 'Tracking screenshot must be stored in this process first';
 end if;
 update public.oms_processes set
   data=coalesce(data,'{}'::jsonb) || jsonb_build_object(
     'trackingCaptureStatus',v_status,'trackingCaptureDetail',left(trim(coalesce(p_detail,'')),600),
     'trackingCaptureAt',now()::text,'trackingCaptureDocumentId',p_document_id::text,
     'trackingCaptureUnverified',true,'trackingCaptureSource','manual'),
   updated_at=now()
 where id=p_process_id;
 insert into public.oms_events(user_id,process_id,process_no,action,details)
 values(v_owner,p_process_id,v_process.process_no,'Tracking screenshot saved — manual result unverified',
   jsonb_build_object('document_id',p_document_id,'manual_status',v_status,'verified',false));
 return true;
end;
$$;
revoke all on function public.oms_record_tracking_capture(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.oms_record_tracking_capture(uuid,uuid,text,text) to authenticated;
