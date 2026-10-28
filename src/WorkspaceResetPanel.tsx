import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,RefreshCw,ShieldAlert,Trash2} from 'lucide-react';
import {supabase} from './independentClient';
import {Button} from './UnifiedKit';

type Preview={
 scope:'personal_only';process_count:number;trashed_count:number;
 document_count:number;photo_count:number;album_count:number;
 job_count:number;cloud_job_count:number;email_request_count:number;
 agent_message_count:number;agent_notification_count:number;agent_task_count:number;
 queued_count:number;running_count:number;pending_cleanup:boolean;
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
 const hasDeletableData=Boolean(preview&&(
   preview.process_count>0||preview.album_count>0||
   preview.job_count>0||preview.cloud_job_count>0||preview.email_request_count>0||
   preview.agent_message_count>0||preview.agent_notification_count>0||
   preview.agent_task_count>0||preview.pending_cleanup
 ));
 const allowed=Boolean(authenticated&&!demo&&hasDeletableData&&
   typed.trim()===PHRASE&&ack&&!busy);
 async function execute(){
  if(!allowed||!preview||!supabase)return;
  const countJobs=preview.job_count+preview.cloud_job_count+preview.email_request_count;
  if(!window.confirm(
   'PERMANENT PERSONAL REGISTER RESET\n\n'+
   'Delete '+preview.process_count+' personal processes (including '+preview.trashed_count+' in Trash), '+
   preview.document_count+' documents, '+preview.photo_count+' photos, and '+
   countJobs+' process-linked job requests, plus all personal agent chat/tasks/notifications?\n\n'+
   'Historical Running/Queued jobs will be cancelled in the database and removed, even if they never finished. '+
   'This does NOT stop a Windows program already executing or undo an external submission.\n\n'+
   'Shared team records, login, account settings, database backups and the website remain untouched.\n\n'+
   'THIS CANNOT BE UNDONE.\n\nProceed?'
  ))return;
  const count=preview.process_count;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.functions.invoke('oms-personal-workspace-reset',{
    body:{action:'execute',confirm:PHRASE,expected_count:count}
   });
   if(error)throw error;
   if(data?.error)throw Error(data.error);
   if(!data?.ok)throw Error('Server did not confirm completed reset.');
   setPreview(null);setTyped('');setAck(false);
   setNotice('Reset completed: '+data.result.deleted_processes+
     ' personal processes, '+data.result.deleted_documents+' documents, '+
     data.result.deleted_photos+' photos and '+
     (data.result.deleted_jobs+data.result.deleted_cloud_jobs+data.result.deleted_email_requests)+
     ' related job records erased. Personal agent chat, tasks and alerts cleared. Login and shared records preserved.');
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
   <h2><Trash2 size={17} style={{verticalAlign:'middle',marginRight:8}}/>Delete all personal process & agent data</h2>
   <p>Start a completely blank personal process register: remove entries in every stage and Trash,
    private process attachments, Done Pick List albums/photos, tracking results, process events,
    and historical agent jobs, chat, tasks and notifications. Shared team records stay protected.</p>
  </div><span className='sc-chip'>DANGER ZONE</span></div>
  <div className='sc-reset-body'>
   <div className='sc-note'><ShieldAlert size={18}/>
    <div>This action cannot be undone. <strong>It keeps your website, login, account settings,
     shared team records, Supabase-managed backups and previously downloaded files.</strong>
     It cannot undo external DataDoc entries, carrier records, Outlook messages or a currently executing Windows worker.</div>
   </div>
   <div className='sc-reset-stats'>
    <span><strong>{preview?.process_count??'—'}</strong> Personal processes</span>
    <span><strong>{preview?.trashed_count??'—'}</strong> In Trash</span>
    <span><strong>{preview?.document_count??'—'}</strong> Document files</span>
    <span><strong>{preview?.photo_count??'—'}</strong> Photos</span>
    <span><strong>{preview?preview.job_count+preview.cloud_job_count+preview.email_request_count:'—'}</strong> Agent/job records</span>
    <span><strong>{preview?preview.agent_message_count+preview.agent_task_count+preview.agent_notification_count:'—'}</strong> Agent chat / tasks / alerts</span>
    <span><strong>{preview?.running_count??'—'}</strong> Old Running jobs</span>
   </div>
   {preview?.pending_cleanup&&<p className='sc-invalid' role='alert'>A previous deletion was interrupted. Confirm again to resume storage cleanup and finish deleting the personal records.</p>}
   {Boolean(preview?.running_count)&&<p className='sc-invalid' role='alert'>
    {preview?.running_count} old job(s) are marked Running. They no longer block this reset.
    Reset cancels their database status and removes their history, but cannot stop a Windows worker already running.
    Stop office-side Python agents first, if any are still open.
   </p>}
   {error&&<p className='sc-invalid' role='alert'>{error}</p>}
   {!preview&&<p className='sc-invalid' role='status'>Typing is locked until the server verifies the process count. Click Refresh count after reconnecting.</p>}
   {notice&&<p className='sc-reset-success' role='status'>{notice}</p>}
   <label className='ux-field'>Type <strong>{PHRASE}</strong> to enable permanent deletion
    <input autoComplete='off' spellCheck={false} placeholder={PHRASE} value={typed}
      onChange={e=>setTyped(e.target.value)} disabled={busy||!hasDeletableData}/>
   </label>
   <label className='sc-reset-checkbox'><input type='checkbox' checked={ack} onChange={e=>setAck(e.target.checked)}/>
    <span>I understand this permanently deletes all my personal process entries, attachments,
    old running/queued job records, audit events and agent history. It cannot stop any worker currently
    executing outside this website or erase Supabase-managed backups.</span></label>
  </div>
  <div className='sc-actions'>
   <Button disabled={busy||!authenticated||demo} onClick={()=>void load()}><RefreshCw size={15}/>Refresh count</Button>
   <button className='sc-danger-button' type='button' disabled={!allowed} onClick={()=>void execute()}>
    <AlertTriangle size={16}/> Erase my personal process & agent data
   </button>
  </div>
 </section>;
}
