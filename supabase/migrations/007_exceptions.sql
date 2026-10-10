-- Phase 3: independent OMS exception log; records are accessible only through process ownership or team role.
create table if not exists public.oms_exceptions(
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.oms_processes(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  category text not null check(category in ('document','carrier','address','return','rto','customer','other')),
  description text not null check(length(trim(description)) between 8 and 2000),
  status text not null default 'open' check(status in ('open','in_review','resolved')),
  resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oms_exception_resolution_required check(status<>'resolved' or length(trim(coalesce(resolution,'')))>=8)
);
create index if not exists oms_exceptions_process_state on public.oms_exceptions(process_id,status,created_at desc);
alter table public.oms_exceptions enable row level security;
create policy oms_exception_select on public.oms_exceptions for select to authenticated
using(exists(select 1 from public.oms_processes p where p.id=process_id
 and (p.user_id=auth.uid() or public.oms_has_role(p.team_id))));
create policy oms_exception_insert on public.oms_exceptions for insert to authenticated
with check(created_by=auth.uid() and status='open'
 and exists(select 1 from public.oms_processes p where p.id=process_id
 and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))));
create policy oms_exception_update on public.oms_exceptions for update to authenticated
using(exists(select 1 from public.oms_processes p where p.id=process_id
 and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))))
with check(exists(select 1 from public.oms_processes p where p.id=process_id
 and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))));
create or replace function public.oms_exception_guard()
returns trigger language plpgsql set search_path=''
as $$
begin
 if tg_op='UPDATE' then
  if new.process_id<>old.process_id or new.created_by<>old.created_by or new.category<>old.category then
   raise exception 'Exception process, reporter and category cannot be changed';
  end if;
  if old.status='resolved' and new.status<>'resolved' then
   raise exception 'Resolved exceptions cannot be reopened; create a new case';
  end if;
  if new.status='resolved' and old.status<>'resolved' then
   new.resolved_by:=auth.uid();new.resolved_at:=now();
  end if;
 else
  if new.created_by<>auth.uid() then raise exception 'Reporter must be signed-in user';end if;
 end if;
 new.updated_at:=now();
 return new;
end;$$;
drop trigger if exists oms_exception_guard_trigger on public.oms_exceptions;
create trigger oms_exception_guard_trigger before insert or update on public.oms_exceptions
for each row execute function public.oms_exception_guard();
