-- Independently owned PJS/OMS workflow queue and audit (apply to NEW OMS Supabase only).
create table if not exists public.oms_jobs(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 process_id uuid not null references public.oms_processes(id) on delete cascade,
 process_no text not null,
 job_type text not null check(job_type in ('bill_submit','datadoc_submit','tracking','delivery_proof_submit','email_reply')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 progress integer not null default 0 check(progress between 0 and 100),
 payload jsonb not null default '{}'::jsonb,
 result jsonb not null default '{}'::jsonb,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists oms_jobs_owner_created on public.oms_jobs(user_id,created_at desc);
create index if not exists oms_jobs_status_created on public.oms_jobs(status,created_at);
alter table public.oms_jobs enable row level security;
drop policy if exists oms_jobs_read on public.oms_jobs;
create policy oms_jobs_read on public.oms_jobs for select to authenticated using(auth.uid()=user_id);
drop policy if exists oms_jobs_queue on public.oms_jobs;
create policy oms_jobs_queue on public.oms_jobs for insert to authenticated with check(auth.uid()=user_id and status='queued' and progress=0 and exists(select 1 from public.oms_processes p where p.id=process_id and p.user_id=auth.uid() and p.process_no=process_no));
-- Do not create user UPDATE policy for job status. Only trusted workers report results.
create table if not exists public.oms_events(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 process_id uuid references public.oms_processes(id) on delete set null,
 process_no text not null,
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists oms_events_owner_created on public.oms_events(user_id,created_at desc);
alter table public.oms_events enable row level security;
drop policy if exists oms_events_read on public.oms_events;
create policy oms_events_read on public.oms_events for select to authenticated using(auth.uid()=user_id);
drop policy if exists oms_events_insert on public.oms_events;
create policy oms_events_insert on public.oms_events for insert to authenticated with check(auth.uid()=user_id);
create table if not exists public.oms_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 ebill_threshold numeric not null default 50000,
 retrack_days integer not null default 3,
 reminder_days integer not null default 10,
 updated_at timestamptz not null default now()
);
alter table public.oms_preferences enable row level security;
drop policy if exists oms_preferences_owner on public.oms_preferences;
create policy oms_preferences_owner on public.oms_preferences for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);