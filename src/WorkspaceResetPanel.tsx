import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,RefreshCw,ShieldAlert,Trash2} from 'lucide-react';
import {supabase} from './independentClient';
import {Button} from './UnifiedKit';

type Preview={
 scope:'personal_only';process_count:number;trashed_count:number;
 document_count:number;photo_count:number;album_count:number;
 queued_count:number;running_count:number;job_history_count:number;
 email_request_count:number;pending_cleanup:boolean;
 managed_backups_removed:false;
};
const PHRASE='DELETE ALL MY PROCESSES';
async function readableResetError(error:any):Promise<string>{
 const response=error?.context;
 if(response&&typeof response.json==='function'){
  try{
   const data=await response.json();
   if(typeof data?.error==='string'&&data.error.length<280)return data.error;
  }catch{/* Body may be unavailable; use generic text below. */}
 }
 return 'The protected reset preview could not be loaded. No changes were made. Click Refresh count or sign in again.';
}

export default function WorkspaceResetPanel({authenticated,demo,onChanged}:{
 authenticated:boolean;demo:boolean;onChanged:()=>Promise<void>|void
}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [typed,setTyped]=useState('');
 const [ack,setAck]=useState(false);
 const [workersStopped,setWorkersStopped]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!supabase||!authenticated||demo)return;
  setBusy(true);
  try{
   const {data,error}=await supabase.functions.invoke('oms-personal-workspace-reset',{body:{action:'preview'}});
   if(error)throw error;
   if(data?.error)throw Error(data.error);
   setPreview(data as Preview);setError('');
  }catch(e:any){setError(await readableResetError(e));setPreview(null)}
  finally{setBusy(false)}
 },[authenticated,demo]);
 useEffect(()=>{void load()},[load]);
 const legacyRunning=preview?.running_count||0;
 const allowed=Boolean(preview&&preview.process_count>0&&
   typed.trim()===PHRASE&&ack&&(legacyRunning===0||workersStopped)&&!busy);
 async function execute(){
  if(!allowed||!preview||!supabase)return;
  if(!window.confirm(
    'FINAL DELETION CONFIRMATION\n\nPermanently delete '+preview.process_count+
    ' of YOUR personal processes (including Trash), '+preview.document_count+
    ' documents, '+preview.photo_count+' photos and '+preview.job_history_count+
    ' agent jobs plus '+preview.email_request_count+' email-send requests?\n\nOld queued/running job records will be cancelled and removed, regardless of their previous status. This does NOT stop an external Windows worker or undo a sent email. Your login, settings, other users\' records and Supabase-managed backups are retained.\n\nThis action CANNOT BE UNDONE.'
   ))return;
  const count=preview.process_count;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.functions.invoke('oms-personal-workspace-reset',{
    body:{action:'execute',confirm:PHRASE,expected_count:count,
     workers_stopped:legacyRunning===0||workersStopped}
   });
   if(error)throw error;
   if(data?.error)throw Error(data.error);
   if(!data?.ok)throw Error('Server did not confirm completed reset.');
   setPreview(null);setTyped('');setAck(false);setWorkersStopped(false);
   setNotice('Reset completed: '+data.result.deleted_processes+' personal processes, '+
    (data.result.deleted_jobs+data.result.deleted_cloud_jobs+data.result.deleted_email_requests)+
    ' related job/email-request records, and linked documents/photos removed. Supabase-managed backups, your login and settings remain unchanged.');
   await onChanged();
   await load();
  }catch(e:any){
   setError((await readableResetError(e))+
    ' Check the preview again. If cleanup is pending, retry; do not assume all files were deleted.');
   await load();
  }finally{setBusy(false)}
 }
 return <section className='sc-card'>
  <div className='sc-section-head'><div>
   <h2><Trash2 size={17} style={{verticalAlign:'middle',marginRight:8}}/>Delete all my processes</h2>
   <p>Permanently remove your personal processes, including Trash, attached documents,
    Done Pick List albums/photos, related agent/job history, Outlook send requests and process events — including entries in Trash. Shared team records, your login and settings are protected.</p>
  </div><span className='sc-chip'>DANGER ZONE</span></div>
  <div className='sc-reset-body'>
   <div className='sc-note'><ShieldAlert size={18}/>
    <div>This action cannot be undone. <strong>It does not delete Supabase-managed database backups,
     existing downloaded CSV files, or the original PJS project.</strong> It also doesn't erase data
     already submitted to external DataDoc, transporters or recipients.</div>
   </div>
   <div className='sc-reset-stats'>
    <span><strong>{preview?.process_count??'—'}</strong> Personal processes</span>
    <span><strong>{preview?.trashed_count??'—'}</strong> In Trash</span>
    <span><strong>{preview?.document_count??'—'}</strong> Document files</span>
    <span><strong>{preview?.photo_count??'—'}</strong> Photos</span>
    <span><strong>{preview?.job_history_count??'—'}</strong> Agent jobs (all statuses)</span>
    <span><strong>{preview?.email_request_count??'—'}</strong> Email-send requests</span>
   </div>
   {preview?.pending_cleanup&&<p className='sc-invalid' role='alert'>A previous deletion was interrupted. Confirm again to resume storage cleanup and finish deleting the personal records.</p>}
   {legacyRunning>0&&<div className='sc-note' role='alert'>
     <ShieldAlert size={18}/>
     <div><strong>{legacyRunning} old job record(s) still show Running.</strong>
       This no longer blocks your reset. The website can cancel and delete those job records,
       but it cannot stop an office Python/Outlook program that is already executing.
       Stop the old PJS worker programs in Windows before confirming the reset.</div>
    </div>}
   {error&&<p className='sc-invalid' role='alert'>{error}</p>}
   {!preview&&<p className='sc-invalid' role='status'>Typing is locked until the server verifies the process count. Click Refresh count after reconnecting.</p>}
   {notice&&<p className='sc-reset-success' role='status'>{notice}</p>}
   <label className='ux-field'>Type <strong>{PHRASE}</strong> to enable permanent deletion
    <input autoComplete='off' spellCheck={false} placeholder={PHRASE} value={typed}
      onChange={e=>setTyped(e.target.value)} disabled={busy||!preview?.process_count}/>
   </label>
   {legacyRunning>0&&<label className='sc-reset-checkbox'>
    <input type='checkbox' checked={workersStopped} onChange={e=>setWorkersStopped(e.target.checked)} disabled={busy}/>
    <span>I have stopped all old PJS Python/Outlook/office agents on the Windows PC.
     I understand that deleting their stored job records cannot interrupt any external action already in progress.</span>
   </label>}
   <label className='sc-reset-checkbox'><input type='checkbox' checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy}/>
    <span>I authorize permanent deletion of my personal process entries (including Trash), uploaded documents,
    Done Pick List photos, related agent job history, Outlook send requests, and process events.
    I understand Supabase-managed backups and already downloaded files are not deleted.</span></label>
  </div>
  <div className='sc-actions'>
   <Button disabled={busy||!authenticated||demo} onClick={()=>void load()}><RefreshCw size={15}/>Refresh count</Button>
   <button className='sc-danger-button' type='button' disabled={!allowed} onClick={()=>void execute()}>
    <AlertTriangle size={16}/> Delete all my processes
   </button>
  </div>
 </section>;
}
