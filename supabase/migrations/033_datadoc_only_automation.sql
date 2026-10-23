-- PJS OMS policy 2026-10-23: DataDoc portal submissions are the only automation.
-- Allowed: bill_submit, delivery_proof_submit (both execute in DataDoc).
-- Manual-only: Outlook Reply All, all carrier tracking, cloud audit/OCR jobs,
-- and the unconnected DataDoc Email Submit adapter (datadoc_submit).
--
-- Applying this migration NEVER changes/cancels/claims an existing job,
-- process, document, or audit event. Existing Running legacy jobs require
-- explicit manual reconciliation; no unexpected requeue or retry is allowed.

create or replace function public.oms_only_datadoc_job_insert()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.job_type not in ('bill_submit','delivery_proof_submit') then
    raise exception 'Only DataDoc Bill Submit and DataDoc Tracking Proof automation are enabled. Other operations are manual.';
  end if;
  return new;
end;
$$;

drop trigger if exists oms_only_datadoc_job_insert_guard on public.oms_jobs;
create trigger oms_only_datadoc_job_insert_guard
before insert on public.oms_jobs for each row
execute function public.oms_only_datadoc_job_insert();

create or replace function public.oms_disable_cloud_job_insert()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'PJS Cloud background jobs are disabled. DataDoc submission is the only automation.';
end;
$$;

drop trigger if exists oms_disable_cloud_job_insert_guard on public.oms_cloud_jobs;
create trigger oms_disable_cloud_job_insert_guard
before insert on public.oms_cloud_jobs for each row
execute function public.oms_disable_cloud_job_insert();

-- Prevent stale Windows Outlook workers from claiming any old waiting jobs.
-- Keeping the same RPC signature protects existing worker clients gracefully.
create or replace function public.oms_claim_outlook_draft(
  p_worker_name text,p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
  if p_owner_id is null or length(btrim(coalesce(p_worker_name,''))) not between 3 and 100 then
    raise exception 'Valid worker identity required';
  end if;
  -- No claims: Outlook is strictly a manual Reply All workflow.
  return;
end;
$$;
revoke all on function public.oms_claim_outlook_draft(text,uuid)
  from public,anon,authenticated;
grant execute on function public.oms_claim_outlook_draft(text,uuid)
  to service_role;

-- Prevent old GitHub Actions cloud job workers from claiming queued work.
create or replace function public.oms_cloud_claim(p_worker text)
returns setof public.oms_cloud_jobs
language plpgsql security definer set search_path='' as $$
begin
  if p_worker is null or length(btrim(p_worker)) not between 3 and 80 then
    raise exception 'Valid cloud worker identity required';
  end if;
  -- No claims: OCR/audit cloud agents are retired from OMS automation.
  return;
end;
$$;
revoke all on function public.oms_cloud_claim(text)
  from public,anon,authenticated;
grant execute on function public.oms_cloud_claim(text) to service_role;

-- Previously installed migrations 030 already no-op BOTH carrier tracking
-- claim functions; they are deliberately not re-enabled here.
-- The bill_submit and delivery_proof_submit claim/finish RPCs are unchanged.
