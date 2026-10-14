-- ZIP_V2 DataDoc transaction: only the updated signed-in Windows worker may
-- claim new submissions; invoice PDF and core fields remain mandatory.
-- E-Invoice/E-Way Bill are optional ZIP members when available.
-- This migration makes NO changes to existing processes/jobs.
create or replace function public.oms_claim_approved_office_bill(
 p_worker_name text, p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
  raise exception 'Worker identity is required';
 end if;
 return query
 with candidate as (
  select j.id from public.oms_jobs j
  join public.oms_processes p on p.id=j.process_id
  where j.user_id=p_owner_id
    and p.user_id=j.user_id
    and j.status='queued'
    and j.job_type='bill_submit'
    and j.office_execution='auto_on_login'
    and j.approved_at is not null
    and p.deleted_at is null and p.process_no=j.process_no
    -- Never allow a previous on-PC adapter to consume an incorrectly packaged bill.
    -- Existing running jobs are unaffected; only *new claims* require zip_v2.
    and exists (
      select 1 from public.oms_office_workers w
      where w.owner_id=j.user_id and w.worker_name=p_worker_name
        and w.status in ('idle','busy','ready')
        and w.last_seen_at>now()-interval '2 minutes'
        and w.details->>'bill_submit_version'='zip_v2'
    )
    and lower(trim(coalesce(p.data->>'stage',''))) in ('datadoc','datadoc bill submit')
    and trim(coalesce(p.data->>'invoice','')) ~ '^[A-Za-z0-9/._-]{1,80}$'
    and p.data->>'credit' in ('Credit','Non Credit')
    and (
      case
      when length(regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g')) not between 1 and 30 then false
      when regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g') !~ '^[0-9]+([.][0-9]+)?$' then false
      else regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g')::numeric>0
      end
    )
    -- A PDF invoice is required for actual submission. E-Invoice and E-Way Bill
    -- PDFs go into the ZIP only if saved in this process, regardless of amount.
    and exists (
      select 1 from public.oms_documents d
      where d.process_id=j.process_id and d.user_id=j.user_id
        and d.kind='invoiceDoc' and lower(d.name) like '%.pdf'
        and d.path like j.user_id::text||'/'||j.process_id::text||'/%'
    )
  order by j.created_at,j.id
  for update of j skip locked
  limit 1
 )
 update public.oms_jobs j
 set status='running',progress=5,started_at=now(),updated_at=now(),
   worker_name=p_worker_name,error_message=null
 from candidate
 where j.id=candidate.id and j.status='queued'
 returning j.*;
end;
$$;
revoke all on function public.oms_claim_approved_office_bill(text,uuid) from public,anon,authenticated;
grant execute on function public.oms_claim_approved_office_bill(text,uuid) to service_role;
