-- PJS independent OMS: carrier tracking is now manual only.
-- Applied to BOTH legacy and batch carrier worker claim endpoints.
-- Schema-only migration: it does NOT cancel, delete, or finish an existing job.
-- Existing running jobs are untouched and their existing audit is preserved.
-- Other worker types (DataDoc bill, tracking proof, Outlook) are untouched.
--
-- If a future operator explicitly chooses to re-enable carrier automation,
-- implement a separate, reviewed migration; never re-enable implicitly.

create or replace function public.oms_claim_approved_tracking(
  p_worker_name text, p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
    raise exception 'Tracking worker identity is required';
  end if;
  -- Manual-only transport workflow. No queued job is ever claimed.
  return;
end;
$$;
revoke all on function public.oms_claim_approved_tracking(text,uuid) from public,anon,authenticated;
grant execute on function public.oms_claim_approved_tracking(text,uuid) to service_role;

create or replace function public.oms_claim_approved_shree_maruti_batch(
  p_worker_name text, p_owner_id uuid, p_limit integer default 20
) returns setof public.oms_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner_id is null or length(trim(coalesce(p_worker_name,''))) not between 3 and 100 then
    raise exception 'Tracking worker identity is required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'Shree Maruti claim limit must be 1–20';
  end if;
  -- Manual-only transport workflow. No queued job is ever claimed.
  return;
end;
$$;
revoke all on function public.oms_claim_approved_shree_maruti_batch(text,uuid,integer)
 from public,anon,authenticated;
grant execute on function public.oms_claim_approved_shree_maruti_batch(text,uuid,integer)
 to service_role;
