import {useEffect,useMemo,useState} from 'react';
import {
 Activity,Archive,CheckCircle2,Download,FileClock,RefreshCw,
 RotateCcw,ShieldAlert,Trash2,XCircle
} from 'lucide-react';
import {supabase} from './independentClient';
import {ops,showDate,type Job} from './unifiedOps';
import {
 auditEventVisible,auditJobVisible,isStaleTrackingJob,mayTrashAuditProcess,
 type AuditScope
} from './auditCleanupRules';
import {Button,Empty,Heading,Panel,Tone} from './UnifiedKit';
import './audit-cleanup.css';

const filters=['All','Active','Successful','Errors','Cancelled'] as const;
type Filter=typeof filters[number];
const isActive=(status:string)=>status==='queued'||status==='running';
const filterBy=(job:Job,filter:Filter)=>filter==='All'
 ||filter==='Active'&&isActive(job.status)
 ||filter==='Successful'&&job.status==='completed'
 ||filter==='Errors'&&job.status==='failed'
 ||filter==='Cancelled'&&job.status==='cancelled';

export default function AuditCleanupPage({p}:{p:any}){
 const {records=[],events=[],jobs=[],authenticated=false,busy=false,demo=false}=p;
 const [statusFilter,setStatusFilter]=useState<Filter>('All');
 const [processSearch,setProcessSearch]=useState('');
 const [scopes,setScopes]=useState<AuditScope[]>([]);
 const [workerLastSeen,setWorkerLastSeen]=useState('');
 const [runningReason,setRunningReason]=useState('');
 const [runningAck,setRunningAck]=useState(false);
 const [expandedJob,setExpandedJob]=useState<string|null>(null);
 const [pending,setPending]=useState(false);
 const [localError,setLocalError]=useState('');
 const [localNotice,setLocalNotice]=useState('');
 const [loadingScope,setLoadingScope]=useState(false);

 async function loadControls(){
  if(!authenticated||!supabase){setScopes([]);setWorkerLastSeen('');return}
  setLoadingScope(true);
  try{
   const [scopeData,trackingWorker]=await Promise.all([
    ops.auditScopes(),
    supabase.from('oms_tracking_workers').select('last_seen_at').eq('owner_id',p.userId).maybeSingle(),
   ]);
   if(trackingWorker.error)throw trackingWorker.error;
   setScopes(scopeData);
   setWorkerLastSeen(trackingWorker.data?.last_seen_at||'');
  }catch(e:any){setLocalError('Cleanup controls unavailable: '+String(e?.message||'Refresh and try again'))}
  finally{setLoadingScope(false)}
 }
 useEffect(()=>{
  let cancelled=false;
  if(!authenticated||!supabase){setScopes([]);setWorkerLastSeen('');return}
  void Promise.all([
   ops.auditScopes(),
   supabase.from('oms_tracking_workers').select('last_seen_at').eq('owner_id',p.userId).maybeSingle()
  ]).then(([rows,worker])=>{
   if(cancelled)return;
   if(worker.error)throw worker.error;
   setScopes(rows);setWorkerLastSeen(worker.data?.last_seen_at||'');
  }).catch((e:any)=>{if(!cancelled)setLocalError('Unable to read audit controls: '+String(e?.message||'Refresh'))});
  return ()=>{cancelled=true};
 },[authenticated,p.userId]);

 const searched=processSearch.trim();
 const selectedScope=searched||'*';
 const exactScope=!searched||/^\d{5,10}$/.test(searched);
 const recordsForProcess=records.filter((r:any)=>String(r.process||'')===searched);
 const ownProcess=recordsForProcess.find((r:any)=>r.owner_id===p.userId&&!r.team_id);
 const activeForProcess=jobs.filter((j:Job)=>String(j.process_no)===searched&&isActive(j.status));
 const canTrash=Boolean(ownProcess&&mayTrashAuditProcess(ownProcess,jobs,p.userId));
 const archivedHere=scopes.some(s=>s.scope===selectedScope);
 const visibleEvents=useMemo(()=>events.filter((e:any)=>auditEventVisible(e,scopes)
  &&(!searched||String(e.process_no||'').includes(searched))),[events,scopes,searched]);
 const visibleJobs=useMemo(()=>jobs.filter((j:Job)=>auditJobVisible(j,scopes)
  &&(!searched||String(j.process_no||'').includes(searched))),[jobs,scopes,searched]);
 const chosenJobs=visibleJobs.filter((j:Job)=>filterBy(j,statusFilter));

 async function changed(fn:()=>Promise<unknown>,message:string){
  if(pending||busy||!authenticated)return;
  setLocalError('');setLocalNotice('');setPending(true);
  try{
   await fn();
   await p.onRefresh?.();
   await loadControls();
   setLocalNotice(message);
  }catch(e:any){setLocalError(String(e?.message||'Unable to complete requested action.'))}
  finally{setPending(false)}
 }
 function clearDisplay(){
  if(!exactScope||!authenticated||pending)return;
  const scopeLabel=searched?'Process '+searched:'ALL processes';
  if(!window.confirm('Clear OLD audit events and FINISHED jobs from YOUR Audit & Reports display for '+scopeLabel+'?\n\nThis does not delete any database history. Queued and Running jobs remain visible. You can restore the display later.'))return;
  void changed(()=>ops.archiveAuditView(selectedScope),
   'Audit view cleared for '+scopeLabel+'. Original events and job records remain stored.');
 }
 function restoreDisplay(){
  void changed(()=>ops.restoreAuditView(selectedScope),
   'Previously hidden audit history is visible again for '+(searched?'Process '+searched:'all processes')+'.');
 }
 function cancelQueued(job:Job){
  if(!window.confirm('Cancel the QUEUED '+job.job_type.replaceAll('_',' ')+' request for Process '+job.process_no+'?\n\nOnly jobs not yet claimed by a worker can be cancelled. The original job and audit history will remain.'))return;
  void changed(()=>ops.cancelQueuedJob(job),
   'Queued job for Process '+job.process_no+' was cancelled and preserved in the audit history.');
 }
 async function reconcile(job:Job){
  if(!runningAck||runningReason.trim().length<12||runningReason.trim().length>500)return;
  if(!window.confirm('Process '+job.process_no+': You confirm the Windows carrier worker is STOPPED and that you checked its last carrier result.\n\nMark this STALE tracking job FAILED for review? This cannot undo a carrier lookup and will not run another job automatically.'))return;
  await changed(()=>ops.reconcileStaleTrackingJob(job,runningReason,runningAck),
   'Stale Tracking job for Process '+job.process_no+' marked Failed for manual review; no carrier result was invented.');
  setExpandedJob(null);setRunningReason('');setRunningAck(false);
 }
 function trashProcess(){
  if(!ownProcess||!canTrash)return;
  if(!window.confirm('Move your Process '+searched+' to Deleted Processes?\n\nThis is a recoverable move, NOT permanent deletion. Original files and audit records remain. You can restore the process from Data Store.'))return;
  void changed(()=>p.onDeleteProcess(ownProcess),
   'Process '+searched+' moved to Deleted Processes; history and original documents were preserved.');
 }
 return <>
  <Heading eyebrow='OPERATIONS INTELLIGENCE' title='Audit & Reports'
   description='Review automation history, cancel waiting jobs, reconcile stale tracking requests, and clean the visible audit list without deleting evidence.'
   actions={<Button onClick={p.onExport}><Download size={16}/> Export CSV</Button>}/>
  <section className='ux-audit-manager' aria-label='Audit and job cleanup controls'>
   <div className='ux-audit-manager-title'>
    <div><h2><ShieldAlert size={19}/> Process & job cleanup</h2>
     <p>Process deletion is recoverable. Clearing audit history only hides older entries from your view; database evidence remains intact.</p></div>
    <button type='button' onClick={()=>{void p.onRefresh?.();void loadControls()}} disabled={pending||busy||loadingScope}><RefreshCw size={15}/> Refresh</button>
   </div>
   <div className='ux-audit-manager-scope'>
    <label>Filter by Process No. (leave empty for all processes)
     <input value={processSearch} onChange={e=>{setProcessSearch(e.target.value.slice(0,30));setExpandedJob(null)}}
      placeholder='All processes, or enter Process No.' inputMode='numeric'/>
    </label>
    <div className='ux-audit-manager-buttons'>
     <button type='button' onClick={clearDisplay} disabled={!authenticated||busy||pending||!exactScope}>
      <Archive size={15}/> {searched?'Clear process audit view':'Clear displayed audit history'}
     </button>
     <button type='button' onClick={restoreDisplay}
      disabled={!authenticated||busy||pending||!archivedHere||!exactScope}>
      <RotateCcw size={15}/> Restore history
     </button>
     <button type='button' className='is-danger' onClick={trashProcess}
      disabled={!authenticated||busy||pending||!canTrash}>
      <Trash2 size={15}/> Move process to trash
     </button>
    </div>
   </div>
   {searched&&exactScope&&ownProcess&&activeForProcess.length>0&&
    <p className='ux-audit-manager-hint'>Process {searched} has {activeForProcess.length} queued or Running job(s). Cancel queued jobs or safely reconcile Running tracking jobs before moving it to Deleted Processes.</p>}
   {searched&&exactScope&&!ownProcess&&
    <p className='ux-audit-manager-hint'>Process deletion is available only for an existing personal process you own. Historical audit views can still be managed separately.</p>}
   {scopes.length>0&&<small className='ux-audit-manager-archive-note'>
    {scopes.length} personal audit display filter(s) active. Queued and Running jobs remain visible; nothing has been erased from Supabase.
   </small>}
   {!authenticated&&<p className='ux-audit-manager-hint'>Sign in to manage audit displays and queue jobs.</p>}
   {localError&&<p className='ux-audit-manager-error' role='alert'>{localError}</p>}
   {localNotice&&<p className='ux-audit-manager-success' role='status'>{localNotice}</p>}
  </section>
  <div className='ux-two-col'>
   <Panel title='Recent workflow activity'
    subtitle={demo?'Cloud audit unavailable in local mode.':'Cloud events retained for audit. Older events may be hidden from this personal view.'}>
    {visibleEvents.length?<div className='ux-event-list'>{visibleEvents.slice(0,35).map((e:any)=>
      <div className='ux-event' key={e.id}><span><CheckCircle2 size={15}/></span><div>
       <strong>{e.action}</strong><small>Process {e.process_no||'—'} · {showDate(e.created_at)}</small>
      </div></div>)}</div>
      :<Empty icon={FileClock} title='No visible activity'
       help='Use Restore history above if you previously cleared your audit display.'/>}
   </Panel>
   <Panel title='Automation history'
    subtitle='Active jobs remain visible. Finished and failed jobs are retained even when hidden from this list.'
    actions={<span className='ux-offline'>AUDIT HISTORY</span>}>
    <div className='ux-tabs' role='group' aria-label='Filter audit jobs'>
     {filters.map(filter=><button type='button' key={filter} className={statusFilter===filter?'selected':''}
       aria-pressed={statusFilter===filter} onClick={()=>setStatusFilter(filter)}>{filter}
       <b>{visibleJobs.filter((j:Job)=>filterBy(j,filter)).length}</b>
      </button>)}
    </div>
    {chosenJobs.length?<div className='ux-job-list'>{chosenJobs.slice(0,100).map((j:Job)=>{
     const stale=isStaleTrackingJob(j,workerLastSeen);
     return <div className='ux-job ux-audit-job' key={j.id}>
      <div><strong>{String(j.job_type).replaceAll('_',' ')}</strong>
       <small>Process {j.process_no||'—'} · {new Date(j.updated_at||j.created_at).toLocaleString('en-IN')}</small></div>
      <Tone value={j.status}/>
      {j.error_message&&<small className='ux-warning'>{j.error_message}</small>}
      {typeof j.result?.detail==='string'&&j.result.detail&&<small>{j.result.detail}</small>}
      {j.status==='queued'&&authenticated&&<div className='ux-audit-job-actions'>
       <button type='button' disabled={busy||pending} onClick={()=>cancelQueued(j)}>
        <XCircle size={14}/> Cancel queued job
       </button>
      </div>}
      {j.status==='running'&&<div className='ux-audit-job-running'>
       <small>{j.job_type!=='tracking'
        ?'Running external automation cannot be deleted here. Verify the portal and stop its worker before reconciliation.'
        :stale
        ?'Tracking job appears stale. Resolve only after stopping the Windows carrier worker and checking its real status.'
        :'Running tracking job: wait for completion. Reconciliation requires a 15-minute-old job and a worker heartbeat older than 5 minutes.'}</small>
       {j.job_type==='tracking'&&stale&&authenticated&&<div className='ux-audit-job-actions'>
        <button type='button' disabled={busy||pending} onClick={()=>{
         setExpandedJob(expandedJob===j.id?null:j.id);setRunningAck(false);setRunningReason('');
        }}><ShieldAlert size={14}/> Resolve stale tracking job</button>
       </div>}
       {expandedJob===j.id&&stale&&<div className='ux-audit-reconcile'>
        <label>Manual reconciliation notes (required, 12–500 characters)
         <textarea rows={3} maxLength={500} value={runningReason} onChange={e=>setRunningReason(e.target.value)}
          placeholder='What did you verify on the official carrier site and Windows worker?'/>
        </label>
        <label className='ux-audit-reconcile-check'>
         <input type='checkbox' checked={runningAck} onChange={e=>setRunningAck(e.target.checked)}/>
         I have stopped the Windows tracking worker and checked that this job did not record a confirmed result.
        </label>
        <div className='ux-audit-reconcile-actions'>
         <button type='button' disabled={pending||busy} onClick={()=>setExpandedJob(null)}>Keep Running</button>
         <button type='button' className='is-danger' disabled={pending||busy||!runningAck||runningReason.trim().length<12}
          onClick={()=>void reconcile(j)}>Mark Failed for Review</button>
        </div>
       </div>}
      </div>}
     </div>})}</div>
      :<Empty icon={Activity} title='No matching automation jobs'
        help='Change the filter or restore hidden history to inspect finished jobs.'/>}
   </Panel>
  </div>
 </>;
}
