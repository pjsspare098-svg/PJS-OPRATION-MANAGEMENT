-- Limit file uploads to an actual process the signed-in user can edit.
drop policy if exists oms_files_insert on storage.objects;
create policy oms_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id='oms-documents'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.oms_processes p
    where p.id::text=(storage.foldername(name))[2]
      and (p.user_id=auth.uid() or public.oms_has_role(p.team_id,array['admin','operator']))
  )
);