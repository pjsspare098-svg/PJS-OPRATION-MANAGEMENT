-- PJS OMS: recoverable "Delete Process" actions and OCR verification of Done Pick List photos.
-- Existing data is retained; nothing is purged in this migration.
alter table public.oms_done_pick_albums add column if not exists deleted_at timestamptz;
alter table public.oms_processes add column if not exists deleted_at timestamptz;
alter table public.oms_done_pick_photos add column if not exists ocr_process_no text;
alter table public.oms_done_pick_photos add column if not exists ocr_confidence numeric;
alter table public.oms_done_pick_photos add column if not exists verification_method text not null default 'legacy';
alter table public.oms_done_pick_photos drop constraint if exists oms_done_pick_photo_verification_check;
alter table public.oms_done_pick_photos add constraint oms_done_pick_photo_verification_check
check (verification_method in ('legacy','ocr_match','manual_review') and
 (ocr_confidence is null or (ocr_confidence between 0 and 100)));

create or replace function public.oms_verify_done_pick_photo()
returns trigger language plpgsql set search_path=''
as $$
declare v_process text;
begin
 select process_no into v_process from public.oms_done_pick_albums
 where id=new.album_id and user_id=new.user_id and deleted_at is null;
 if v_process is null then raise exception 'Done Pick List process does not exist or is in Trash'; end if;
 if new.verification_method='ocr_match' and new.ocr_process_no is distinct from v_process then
    raise exception 'OCR Process No. must match the saved Process No.';
 end if;
 if new.verification_method='manual_review' and new.ocr_process_no is not null then
    raise exception 'A conflicting OCR Process No. requires another photo, not manual override';
 end if;
 if new.verification_method not in ('ocr_match','manual_review') then
    raise exception 'New photos must be OCR-verified or manually reviewed';
 end if;
 return new;
end;$$;
drop trigger if exists oms_done_pick_photo_verifier on public.oms_done_pick_photos;
create trigger oms_done_pick_photo_verifier before insert on public.oms_done_pick_photos
for each row execute function public.oms_verify_done_pick_photo();

create or replace function public.oms_set_done_pick_trash(p_album uuid,p_process text,p_restore boolean default false)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_changed int;
begin
 if v_uid is null then raise exception 'Sign in first'; end if;
 if p_restore then
  update public.oms_done_pick_albums set deleted_at=null
   where id=p_album and process_no=p_process and user_id=v_uid and deleted_at is not null;
 else
  update public.oms_done_pick_albums set deleted_at=now()
   where id=p_album and process_no=p_process and user_id=v_uid and deleted_at is null;
 end if;
 get diagnostics v_changed=row_count;
 if v_changed<>1 then raise exception 'Entry not found, not owned, or already moved'; end if;
end;$$;
revoke execute on function public.oms_set_done_pick_trash(uuid,text,boolean) from public,anon;
grant execute on function public.oms_set_done_pick_trash(uuid,text,boolean) to authenticated;

create or replace function public.oms_set_process_trash(p_process uuid,p_number text,p_restore boolean default false)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_changed int;
begin
 if v_uid is null then raise exception 'Sign in first';end if;
 if not p_restore and exists(
  select 1 from public.oms_jobs j
  where j.process_id=p_process and j.status in ('queued','running')
 ) then raise exception 'Process has queued/running automation jobs; resolve those before deletion'; end if;
 if p_restore then
  update public.oms_processes set deleted_at=null,updated_at=now()
   where id=p_process and process_no=p_number and user_id=v_uid and team_id is null
    and deleted_at is not null;
 else
  update public.oms_processes set deleted_at=now(),updated_at=now()
   where id=p_process and process_no=p_number and user_id=v_uid and team_id is null
    and deleted_at is null;
 end if;
 get diagnostics v_changed=row_count;
 if v_changed<>1 then raise exception 'Only your own personal processes can be deleted/restored'; end if;
end;$$;
revoke execute on function public.oms_set_process_trash(uuid,text,boolean) from public,anon;
grant execute on function public.oms_set_process_trash(uuid,text,boolean) to authenticated;

create index if not exists oms_done_pick_active on public.oms_done_pick_albums(user_id,created_at desc) where deleted_at is null;
create index if not exists oms_process_active on public.oms_processes(user_id,created_at desc) where deleted_at is null;