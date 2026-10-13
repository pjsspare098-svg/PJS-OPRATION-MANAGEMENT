import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,RefreshCw,ShieldAlert,Trash2} from 'lucide-react';
import {supabase} from './independentClient';
import {Button} from './UnifiedKit';

type Preview={
 scope:'personal_only';process_count:number;trashed_count:number;
 document_count:number;photo_count:number;album_count:number;
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
 const allowed=Boolean(preview&&preview.process_count>0&&
   preview.running_count===0&&typed.trim()===PHRASE&&ack&&!busy);
 async function execute(){
  if(!allowed||!preview||!supabase)return;
  if(!window.confirm('Permanently delete '+preview.process_count+' of YOUR personal processes, their attached files, photo albums, related job history and Trash? Queued jobs will be cancelled. This cannot be undone. Supabase-managed backups will NOT be deleted.'))return;
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
   setNotice('Reset completed: '+data.result.deleted_processes+' personal processes and their related records removed. Independent Supabase-managed backups remain unchanged.');
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
    Done Pick List albums/photos, related queue history and process events. Shared team records are protected.</p>
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
    <span><strong>{preview?.queued_count??'—'}</strong> Queued jobs (cancelled)</span>
   </div>
   {preview?.pending_cleanup&&<p className='sc-invalid' role='alert'>A previous deletion was interrupted. Confirm again to resume storage cleanup and finish deleting the personal records.</p>}
   {Boolean(preview?.running_count)&&<p className='sc-invalid' role='alert'>Running jobs exist. Wait for them to finish before deleting anything.</p>}
   {error&&<p className='sc-invalid' role='alert'>{error}</p>}
   {!preview&&<p className='sc-invalid' role='status'>Typing is locked until the server verifies the process count. Click Refresh count after reconnecting.</p>}
   {notice&&<p className='sc-reset-success' role='status'>{notice}</p>}
   <label className='ux-field'>Type <strong>{PHRASE}</strong> to enable permanent deletion
    <input autoComplete='off' spellCheck={false} placeholder={PHRASE} value={typed}
      onChange={e=>setTyped(e.target.value)} disabled={busy||!preview?.process_count}/>
   </label>
   <label className='sc-reset-checkbox'><input type='checkbox' checked={ack} onChange={e=>setAck(e.target.checked)}/>
    <span>I understand that this deletes my personal records and attachments, cancels queued jobs,
    and does not remove Supabase-managed backups or downloaded files.</span></label>
  </div>
  <div className='sc-actions'>
   <Button disabled={busy||!authenticated||demo} onClick={()=>void load()}><RefreshCw size={15}/>Refresh count</Button>
   <button className='sc-danger-button' type='button' disabled={!allowed} onClick={()=>void execute()}>
    <AlertTriangle size={16}/> Delete all my processes
   </button>
  </div>
 </section>;
}
