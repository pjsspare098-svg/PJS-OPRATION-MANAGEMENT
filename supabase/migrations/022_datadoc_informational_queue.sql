-- PJS independent OMS: allow an operator to queue a DataDoc bill even when
-- informational fields are incomplete. Real submission remains gated on the
-- precise files/fields the Python adapter actually needs and worker version.
-- Only requests explicitly tagged advisory_v1 use this new deferred policy.
-- Legacy approved jobs keep existing behavior; no existing rows are modified.
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
    and (
      j.payload->>'office_policy' is distinct from 'advisory_v1'
      or (
        -- Older Windows worker versions still reject informational Pick Slips.
        -- A new-style request must wait until the NEW worker is heartbeating.
        exists (
          select 1 from public.oms_office_workers w
          where w.owner_id=j.user_id and w.worker_name=p_worker_name
            and w.status in ('idle','busy','ready')
            and w.last_seen_at>now()-interval '2 minutes'
            and w.details->>'bill_submit_version'='advisory_v1'
        )
        and lower(trim(coalesce(p.data->>'stage',''))) in ('datadoc','datadoc bill submit')
        and trim(coalesce(p.data->>'invoice','')) ~ '^[A-Za-z0-9/._-]{1,80}$'
        and p.data->>'credit' in ('Credit','Non Credit')
        and (
          case
          when length(regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g')) not between 1 and 30 then false
          when regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g') !~ '^[0-9]+([.][0-9]+)?$' then false
          else
            regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g')::numeric>0
            and (
              regexp_replace(coalesce(p.data->>'amount',''),'[₹,[:space:]]','','g')::numeric<=50000
              or exists(
                select 1 from public.oms_documents d
                where d.process_id=j.process_id and d.user_id=j.user_id
                  and d.kind='ebillDoc'
                  and lower(d.name) like '%.pdf'
                  and d.path like j.user_id::text||'/'||j.process_id::text||'/%'
              )
            )
          end
        )
        and exists (
          select 1 from public.oms_documents d
          where d.process_id=j.process_id and d.user_id=j.user_id
            and d.kind='invoiceDoc'
            and lower(d.name) like '%.pdf'
            and d.path like j.user_id::text||'/'||j.process_id::text||'/%'
        )
        and exists (
          select 1 from public.oms_documents d
          where d.process_id=j.process_id and d.user_id=j.user_id
            and d.kind='einvoiceDoc'
            and lower(d.name) like '%.pdf'
            and d.path like j.user_id::text||'/'||j.process_id::text||'/%'
        )
      )
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
