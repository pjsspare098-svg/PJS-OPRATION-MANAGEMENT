import {supabase} from './independentClient';
export type TeamRole='admin'|'operator'|'viewer';
export type TeamChoice={team_id:string;role:TeamRole;name:string};
export type TeamInvite={id:string;team_id:string;role:'operator'|'viewer';email:string;expires_at:string;name:string};
const signedIn=async()=>{
  if(!supabase)throw Error('Cloud login is required');
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)throw Error('Please sign in to manage workspaces');
  return data.user;
};
export const teamsApi={
 async list():Promise<TeamChoice[]>{
  const user=await signedIn();
  const {data,error}=await supabase!.from('oms_team_members')
    .select('team_id,role,oms_teams(id,name)').eq('user_id',user.id).order('joined_at');
  if(error)throw error;
  return (data||[]).map((row:any)=>({team_id:row.team_id,role:row.role,name:row.oms_teams?.name||'PJS Team'}));
 },
 async pendingInvites():Promise<TeamInvite[]>{
  const user=await signedIn();
  const email=(user.email||'').toLowerCase();
  const {data,error}=await supabase!.from('oms_team_invites')
    .select('id,team_id,role,email,expires_at,oms_teams(name)')
    .eq('email',email).is('accepted_at',null).gt('expires_at',new Date().toISOString());
  if(error)throw error;
  return (data||[]).map((r:any)=>({id:r.id,team_id:r.team_id,role:r.role,email:r.email,expires_at:r.expires_at,name:r.oms_teams?.name||'PJS Team'}));
 },
 async create(name:string):Promise<string>{
  await signedIn();
  const {data,error}=await supabase!.rpc('oms_create_team',{p_name:name.trim()});
  if(error)throw error;return String(data);
 },
 async invite(teamId:string,email:string,role:'operator'|'viewer'){
  await signedIn();
  const {error}=await supabase!.rpc('oms_invite_member',{p_team:teamId,p_email:email.trim().toLowerCase(),p_role:role});
  if(error)throw error;
 },
 async accept(inviteId:string){
  await signedIn();
  const {error}=await supabase!.rpc('oms_accept_invite',{p_invite:inviteId});
  if(error)throw error;
 },
 async adopt(teamId:string,ids:string[]):Promise<number>{
  await signedIn();
  if(!ids.length)throw Error('Select one or more personal processes first.');
  const {data,error}=await supabase!.rpc('oms_adopt_processes',{p_team:teamId,p_ids:ids});
  if(error)throw error;
  return Number(data||0);
 }
};
