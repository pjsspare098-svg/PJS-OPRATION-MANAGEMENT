-- Security hardening: Supabase default function privileges included direct anon grants.
revoke execute on function public.oms_create_team(text) from anon;
revoke execute on function public.oms_invite_member(uuid,text,text) from anon;
revoke execute on function public.oms_accept_invite(uuid) from anon;
revoke execute on function public.oms_adopt_processes(uuid,uuid[]) from anon;
revoke execute on function public.oms_has_role(uuid,text[]) from anon;
grant execute on function public.oms_create_team(text) to authenticated;
grant execute on function public.oms_invite_member(uuid,text,text) to authenticated;
grant execute on function public.oms_accept_invite(uuid) to authenticated;
grant execute on function public.oms_adopt_processes(uuid,uuid[]) to authenticated;
grant execute on function public.oms_has_role(uuid,text[]) to authenticated;