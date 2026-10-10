-- Independent OMS: standalone Done Pick List albums, one per Process No. per user.
-- These records do not require an invoice, SO or a master oms_processes row.
create table if not exists public.oms_done_pick_albums(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 process_no text not null check (process_no ~ '^[0-9]{5,9}$' and process_no !~ '^0+$'),
 created_at timestamptz not null default now(),
 unique(user_id,process_no),
 unique(id,user_id)
);
create index if not exists oms_done_pick_albums_user_created on public.oms_done_pick_albums(user_id,created_at desc);
create table if not exists public.oms_done_pick_photos(
 id uuid primary key default gen_random_uuid(),
 album_id uuid not null,
 user_id uuid not null,
 name text not null,
 path text not null unique,
 content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 created_at timestamptz not null default now(),
 foreign key (album_id,user_id) references public.oms_done_pick_albums(id,user_id) on delete cascade
);
create index if not exists oms_done_pick_photos_album on public.oms_done_pick_photos(album_id,created_at desc);
alter table public.oms_done_pick_albums enable row level security;
alter table public.oms_done_pick_photos enable row level security;
drop policy if exists oms_done_pick_album_select on public.oms_done_pick_albums;
create policy oms_done_pick_album_select on public.oms_done_pick_albums for select to authenticated using (user_id=auth.uid());
drop policy if exists oms_done_pick_album_insert on public.oms_done_pick_albums;
create policy oms_done_pick_album_insert on public.oms_done_pick_albums for insert to authenticated with check (user_id=auth.uid());
drop policy if exists oms_done_pick_photo_select on public.oms_done_pick_photos;
create policy oms_done_pick_photo_select on public.oms_done_pick_photos for select to authenticated using (user_id=auth.uid());
drop policy if exists oms_done_pick_photo_insert on public.oms_done_pick_photos;
create policy oms_done_pick_photo_insert on public.oms_done_pick_photos for insert to authenticated
 with check (user_id=auth.uid() and exists (
  select 1 from public.oms_done_pick_albums a where a.id=album_id and a.user_id=auth.uid()
 ));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('oms-done-pick-photos','oms-done-pick-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists oms_done_photo_storage_insert on storage.objects;
create policy oms_done_photo_storage_insert on storage.objects for insert to authenticated
 with check (
 bucket_id='oms-done-pick-photos'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists (
  select 1 from public.oms_done_pick_albums a
  where a.id::text=(storage.foldername(name))[2] and a.user_id=auth.uid()
 ));
drop policy if exists oms_done_photo_storage_select on storage.objects;
create policy oms_done_photo_storage_select on storage.objects for select to authenticated
 using (
 bucket_id='oms-done-pick-photos'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists (
  select 1 from public.oms_done_pick_photos p
  where p.path=storage.objects.name and p.user_id=auth.uid()
 ));
drop policy if exists oms_done_photo_storage_delete on storage.objects;
create policy oms_done_photo_storage_delete on storage.objects for delete to authenticated
 using (bucket_id='oms-done-pick-photos' and (storage.foldername(name))[1]=auth.uid()::text);
