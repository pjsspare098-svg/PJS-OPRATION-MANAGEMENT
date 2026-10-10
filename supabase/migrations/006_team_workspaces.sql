-- PJS OMS independent project only. Introduce opt-in team workspaces without exposing existing personal data.
create table if not exists public.oms_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 3 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.oms_team_members (
  team_id uuid not null references public.oms_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','operator','viewer')),
  joined_at timestamptz not null default now(),
  primary key(team_id,user_id)
);
create table if not exists public.oms_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.oms_teams(id) on delete cascade,
  email text not null,
  role text not null check(role in ('operator','viewer')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '14 days'),
  accepted_at timestamptz
);
create unique index if not exists oms_pending_team_invite_unique
  on public.oms_team_invites(team_id,lower(email)) where accepted_at is null;
create index if not exists oms_members_user on public.oms_team_members(user_id,team_id);
alter table public.oms_processes add column if not exists team_id uuid references public.oms_teams(id);
create unique index if not exists oms_process_team_number_unique
  on public.oms_processes(team_id,process_no) where team_id is not null;

create or replace function public.oms_has_role(p_team uuid,p_allowed text[] default array['admin','operator','viewer'])
returns boolean
language sql stable security definer set search_path=''
as $$
  select p_team is not null and auth.uid() is not null
    and exists(select 1 from public.oms_team_members m
      where m.team_id=p_team and m.user_id=auth.uid() and m.role=any(p_allowed));
$$;
revoke all on function public.oms_has_role(uuid,text[]) from public;
grant execute on function public.oms_has_role(uuid,text[]) to authenticated;

alter table public.oms_teams enable row level security;
alter table public.oms_team_members enable row level security;
alter table public.oms_team_invites enable row level security;
drop policy if exists oms_teams_read on public.oms_teams;
create policy oms_teams_read on public.oms_teams for select to authenticated
 using (public.oms_has_role(id));
drop policy if exists oms_team_members_read on public.oms_team_members;
create policy oms_team_members_read on public.oms_team_members for select to authenticated
 using (user_id=auth.uid() or public.oms_has_role(team_id,array['admin']));
drop policy if exists oms_team_invites_read on public.oms_team_invites;
create policy oms_team_invites_read on public.oms_team_invites for select to authenticated
 using (public.oms_has_role(team_id,array['admin'])
   or (lower(email)=lower(coalesce(auth.jwt()->>'email','')) and accepted_at is null and expires_at>now()));

create or replace function public.oms_create_team(p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_team uuid;
begin
 if v_uid is null then raise exception 'Sign in first';end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 100 then raise exception 'Team name should be 3 to 100 characters';end if;
 insert into public.oms_teams(name,created_by) values(trim(p_name),v_uid) returning id into v_team;
 insert into public.oms_team_members(team_id,user_id,role) values(v_team,v_uid,'admin');
 return v_team;
end;$$;
revoke all on function public.oms_create_team(text) from public;
grant execute on function public.oms_create_team(text) to authenticated;

create or replace function public.oms_invite_member(p_team uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_invite uuid;v_email text:=lower(trim(coalesce(p_email,'')));
begin
 if not public.oms_has_role(p_team,array['admin']) then raise exception 'Only team admins may invite members';end if;
 if length(v_email)>254 or v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Enter a valid email address';end if;
 if p_role not in ('operator','viewer') then raise exception 'Invite role must be Operator or Viewer';end if;
 insert into public.oms_team_invites(team_id,email,role,created_by)
 values(p_team,v_email,p_role,auth.uid())
 on conflict (team_id,lower(email)) where accepted_at is null
 do update set role=excluded.role,created_by=excluded.created_by,created_at=now(),expires_at=now()+interval '14 days'
 returning id into v_invite;
 return v_invite;
end;$$;
revoke all on function public.oms_invite_member(uuid,text,text) from public;
grant execute on function public.oms_invite_member(uuid,text,text) to authenticated;

create or replace function public.oms_accept_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_email text;v_invite public.oms_team_invites%rowtype;
begin
 if v_uid is null then raise exception 'Sign in first';end if;
 select lower(email) into v_email from auth.users
   where id=v_uid and email_confirmed_at is not null;
 if v_email is null then raise exception 'A verified email account is required';end if;
 select * into v_invite from public.oms_team_invites
   where id=p_invite and lower(email)=v_email and accepted_at is null and expires_at>now() for update;
 if not found then raise exception 'No valid invitation for this verified email';end if;
 insert into public.oms_team_members(team_id,user_id,role)
   values(v_invite.team_id,v_uid,v_invite.role)
   on conflict (team_id,user_id) do nothing;
 update public.oms_team_invites set accepted_at=now() where id=p_invite;
 return v_invite.team_id;
end;$$;
revoke all on function public.oms_accept_invite(uuid) from public;
grant execute on function public.oms_accept_invite(uuid) to authenticated;

create or replace function public.oms_adopt_processes(p_team uuid,p_ids uuid[])
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if not public.oms_has_role(p_team,array['admin']) then raise exception 'Only a team admin can share their personal processes';end if;
 if p_ids is null or array_length(p_ids,1) is null or array_length(p_ids,1)>500
 then raise exception 'Select between 1 and 500 processes';end if;
 update public.oms_processes set team_id=p_team,updated_at=now()
 where id=any(p_ids) and user_id=auth.uid() and team_id is null;
 get diagnostics v_count=row_count;
 return v_count;
end;$$;
revoke all on function public.oms_adopt_processes(uuid,uuid[]) from public;
grant execute on function public.oms_adopt_processes(uuid,uuid[]) to authenticated;

-- Prevent direct API callers from stealing records or moving them between teams.
create or replace function public.oms_protect_process_identity()
returns trigger language plpgsql set search_path=''
as $$
begin
 if current_user='authenticated' then
  if new.user_id is distinct from old.user_id or new.team_id is distinct from old.team_id then
   raise exception 'Record ownership and workspace cannot be changed directly';
  end if;
  if new.process_no is distinct from old.process_no then
   raise exception 'Process No. cannot be changed after record creation';
  end if;
 end if;
 return new;
end;$$;
drop trigger if exists oms_process_ownership_guard on public.oms_processes;
create trigger oms_process_ownership_guard before update on public.oms_processes
 for each row execute function public.oms_protect_process_identity();

drop policy if exists oms_processes_owner on public.oms_processes;
create policy oms_processes_select on public.oms_processes for select to authenticated
 using (user_id=auth.uid() or public.oms_has_role(team_id));
create policy oms_processes_insert on public.oms_processes for insert to authenticated
 with check (user_id=auth.uid() and (team_id is null or public.oms_has_role(team_id,array['admin','operator'])));
create policy oms_processes_update on public.oms_processes for update to authenticated
 using (user_id=auth.uid() or public.oms_has_role(team_id,array['admin','operator']))
 with check (user_id=auth.uid() or public.oms_has_role(team_id,array['admin','operator']));
create policy oms_processes_delete on public.oms_processes for delete to authenticated
 using (user_id=auth.uid() and team_id is null);

drop policy if exists oms_documents_owner on public.oms_documents;
create policy oms_documents_select on public.oms_documents for select to authenticated
 using (user_id=auth.uid() or exists(
  select 1 from public.oms_processes p where p.id=process_id
    and (p.user_id=auth.uid() or public.oms_has_role(p.team_id))));
create policy oms_documents_insert on public.oms_documents for insert to authenticated
 with check (user_id=auth.uid() and exists(
  select 1 from public.oms_processes p where p.id=process_id
    and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))));
-- Only original uploader can delete their attachments.
create policy oms_documents_delete on public.oms_documents for delete to authenticated
 using (user_id=auth.uid());

drop policy if exists oms_events_read on public.oms_events;
create policy oms_events_read on public.oms_events for select to authenticated
 using (user_id=auth.uid() or exists(
   select 1 from public.oms_processes p where p.id=process_id and public.oms_has_role(p.team_id)));
drop policy if exists oms_events_insert on public.oms_events;
create policy oms_events_insert on public.oms_events for insert to authenticated
 with check (user_id=auth.uid() and (process_id is null or exists(
   select 1 from public.oms_processes p where p.id=process_id
     and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator'])))));

drop policy if exists oms_jobs_read on public.oms_jobs;
create policy oms_jobs_read on public.oms_jobs for select to authenticated
 using (user_id=auth.uid() or exists(
   select 1 from public.oms_processes p where p.id=process_id and public.oms_has_role(p.team_id)));
drop policy if exists oms_jobs_queue on public.oms_jobs;
create policy oms_jobs_queue on public.oms_jobs for insert to authenticated
 with check (user_id=auth.uid() and status='queued' and progress=0 and exists(
   select 1 from public.oms_processes p where p.id=process_id and p.process_no=process_no
   and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))));
create unique index if not exists oms_active_job_per_process_kind
  on public.oms_jobs(process_id,job_type) where status in ('queued','running');

-- A member can view private storage objects only if the file is registered
-- as a document of a process that they may access. Uploads remain user-prefixed.
drop policy if exists oms_files_read on storage.objects;
create policy oms_files_read on storage.objects for select to authenticated
using (bucket_id='oms-documents' and (
  (storage.foldername(name))[1]=auth.uid()::text
  or exists(
    select 1 from public.oms_documents d
    join public.oms_processes p on p.id=d.process_id
    where d.path=storage.objects.name
      and (p.user_id=auth.uid() or public.oms_has_role(p.team_id))
  )
));
