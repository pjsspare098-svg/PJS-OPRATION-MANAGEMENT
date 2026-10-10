import {useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Copy,LockKeyhole,Plus,RefreshCw,ShieldCheck,Users,UserPlus} from 'lucide-react';
import {teamsApi,type TeamChoice,type TeamInvite} from './teamOps';
import {Button,Panel} from './UnifiedKit';
import './team-workspace.css';

export default function TeamWorkspace({userId,records,selectedTeam,onTeamSelect,onChanged}:{userId:string;records:any[];selectedTeam:string;onTeamSelect:(id:string)=>void;onChanged:()=>Promise<void>}){
 const [teams,setTeams]=useState<TeamChoice[]>([]);
 const [invites,setInvites]=useState<TeamInvite[]>([]);
 const [teamName,setTeamName]=useState('PJS Operations');
 const [inviteEmail,setInviteEmail]=useState('');
 const [inviteRole,setInviteRole]=useState<'operator'|'viewer'>('operator');
 const [chosen,setChosen]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const active=teams.find(t=>t.team_id===selectedTeam);
 const personal=useMemo(()=>records.filter(r=>!r.team_id&&r.owner_id===userId),[records,userId]);
 async function reload(){
  const [all,pending]=await Promise.all([teamsApi.list(),teamsApi.pendingInvites()]);
  setTeams(all);setInvites(pending);
  if(!selectedTeam&&all.length===1)onTeamSelect(all[0].team_id);
 }
 useEffect(()=>{void reload().catch(e=>setError(e.message))},[userId]);
 async function run(work:()=>Promise<void>,success:string){
  setBusy(true);setError('');setMessage('');
  try{await work();await reload();await onChanged();setMessage(success)}
  catch(e:any){setError(e?.message||'Could not update the team workspace')}
  finally{setBusy(false)}
 }
 return <div className='tw-workspace'>
  <Panel title='PJS Team Workspace' subtitle='Share records with authorized staff. Existing personal processes remain private until explicitly shared.' actions={<Button disabled={busy} onClick={()=>void reload()}><RefreshCw size={15}/> Refresh</Button>}>
   <div className='tw-content'>
    {error&&<p className='tw-error' role='alert'>{error}</p>}
    {message&&<p className='tw-success' role='status'>{message}</p>}
    <div className='tw-row'><label className='ux-field'>Default workspace for new processes
     <select value={selectedTeam} onChange={e=>onTeamSelect(e.target.value)}>
      <option value=''>Personal (private to me)</option>
      {teams.filter(t=>t.role!=='viewer').map(t=><option key={t.team_id} value={t.team_id}>{t.name} — {t.role}</option>)}
     </select>
    </label><span className='tw-access'><ShieldCheck size={17}/> {active?active.role.toUpperCase():'PERSONAL ACCESS'}</span></div>
    <div className='tw-info'>Viewer: read documents and processes. Operator: create/edit and queue workflow requests. Admin: manage invitations and choose which personal processes to share.</div>
    {invites.length>0&&<div className='tw-invites'><strong>Invitations for your verified email</strong>{invites.map(i=><div key={i.id}><span>{i.name} · {i.role} · expires {new Date(i.expires_at).toLocaleDateString('en-IN')}</span><Button disabled={busy} onClick={()=>void run(()=>teamsApi.accept(i.id),'Invitation accepted. Team records are now accessible.')}>Join team</Button></div>)}</div>}
    <div className='tw-create'><label className='ux-field'>Create a new team workspace
      <input value={teamName} onChange={e=>setTeamName(e.target.value.slice(0,100))} maxLength={100} placeholder='Company team name'/>
     </label><Button disabled={busy||teamName.trim().length<3} onClick={()=>void run(async()=>{const id=await teamsApi.create(teamName);onTeamSelect(id)},'Your team workspace is ready. You are its administrator.')}><Plus size={15}/> Create team</Button></div>
   </div>
  </Panel>
  {active?.role==='admin'&&<>
    <Panel title='Invite an authorized colleague' subtitle='Invitation is saved in Supabase; the colleague logs in with the same verified email to accept it.'>
     <div className='tw-content tw-grid'>
      <label className='ux-field'>Colleague's verified email<input type='email' value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder='operator@company.com'/></label>
      <label className='ux-field'>Permission<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as 'operator'|'viewer')}><option value='operator'>Operator — work on processes</option><option value='viewer'>Viewer — read only</option></select></label>
      <div className='tw-full'><Button disabled={busy||!inviteEmail.includes('@')} onClick={()=>void run(()=>teamsApi.invite(active.team_id,inviteEmail,inviteRole),'Invitation created. Ask your colleague to sign in and open Settings → Team Workspace to accept.')}><UserPlus size={15}/> Create invitation</Button></div>
     </div>
    </Panel>
    <Panel title='Share selected personal processes' subtitle='Existing records are never moved automatically. Review and select exactly which processes should become visible to the team.'>
     <div className='tw-content'>
       <div className='tw-info'><LockKeyhole size={15}/> Select only records you are authorized to share. Original documents remain in private storage; team members get access through record permissions.</div>
       {personal.length?<><div className='tw-choices'>{personal.slice(0,150).map(r=><label key={r.id}><input type='checkbox' checked={chosen.includes(r.id)} onChange={e=>setChosen(x=>e.target.checked?[...x,r.id]:x.filter(id=>id!==r.id))}/><span><b>{r.process}</b> · {r.party||'No party'} · SO {r.so||'—'}</span></label>)}</div><p className='tw-footnote'>Selected: {chosen.length} / {personal.length}. Other records remain private.</p><Button disabled={busy||!chosen.length} onClick={()=>void run(async()=>{const count=await teamsApi.adopt(active.team_id,chosen);setChosen([]);setMessage(count+' process(es) shared with '+active.name)},'Selected personal processes shared successfully.')}><Users size={15}/> Share {chosen.length} process(es) with team</Button></>:<p className='tw-muted'>No personal processes to share. New processes can be saved directly to this team using the workspace selector above.</p>}
     </div>
    </Panel>
  </>}
 </div>;
}
