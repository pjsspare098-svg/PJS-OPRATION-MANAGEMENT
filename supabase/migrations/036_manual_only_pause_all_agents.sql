-- PJS OMS manual-only baseline (26 Oct 2026)
-- Keep all records, private files, history, existing job statuses and worker heartbeat tables.
-- NO DELETE/TRUNCATE, and NO updates to current queued/running jobs.
-- Existing running Windows actions cannot be interrupted by SQL; stop those processes on the PC.

create or replace function public.oms_manual_base_block_agent_insert()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'PJS OMS is in manual-only mode. All new agent/automation jobs are disabled until the workflows are redesigned.';
end;
$$;

drop trigger if exists oms_manual_block_jobs on public.oms_jobs;
create trigger oms_manual_block_jobs before insert on public.oms_jobs
  for each row execute function public.oms_manual_base_block_agent_insert();

drop trigger if exists oms_manual_block_email_send on public.oms_email_send_requests;
create trigger oms_manual_block_email_send before insert on public.oms_email_send_requests
  for each row execute function public.oms_manual_base_block_agent_insert();

drop trigger if exists oms_manual_block_agent_tasks on public.oms_agent_tasks;
create trigger oms_manual_block_agent_tasks before insert on public.oms_agent_tasks
  for each row execute function public.oms_manual_base_block_agent_insert();

-- Keep old agent RPC signatures intact for clients already running on office PCs.
-- Returning zero results instead of claiming jobs avoids triggering an external action.
create or replace function public.oms_claim_approved_office_bill(
 p_worker_name text,p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

create or replace function public.oms_claim_datadoc_tracking_proof(
 p_worker_name text,p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

create or replace function public.oms_claim_approved_tracking(
 p_worker_name text,p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

create or replace function public.oms_claim_approved_shree_maruti_batch(
 p_worker_name text,p_owner_id uuid,p_limit integer default 20
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

create or replace function public.oms_claim_outlook_draft(
 p_worker_name text,p_owner_id uuid
) returns setof public.oms_jobs
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

create or replace function public.oms_claim_email_send(
 p_owner_id uuid,p_worker_name text
) returns setof public.oms_email_send_requests
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

create or replace function public.oms_cloud_claim(p_worker text)
returns setof public.oms_cloud_jobs
language plpgsql security definer set search_path='' as $$
begin
 return;
end;
$$;

-- Scheduled agent reminders are stopped, while their existing history remains available.
create or replace function public.oms_agent_enqueue_due_reminders()
returns integer language plpgsql security definer set search_path='' as $$
begin
 return 0;
end;
$$;

-- Disable (not delete) the installed hourly/minutely job, preserving its schedule definition.
do $$
declare j record;
begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  for j in select jobid from cron.job where jobname='pjs-oms-agent-due-reminders' and active loop
   perform cron.alter_job(job_id:=j.jobid,active:=false);
  end loop;
 end if;
end;
$$;

comment on function public.oms_manual_base_block_agent_insert() is
 'Temporary manual-only OMS foundation: new jobs, email send requests, and agent reminders are blocked. Existing history is retained.';
