import {useEffect,useId,useState} from 'react';
import {AlertTriangle,RefreshCw,ShieldCheck,Trash2,X} from 'lucide-react';
import {ops,type CarrierTrashPreview,type CarrierTrashResult} from './unifiedOps';

type Props={
 carrier:string;
 onClose:()=>void;
 onCompleted:(result:CarrierTrashResult)=>Promise<void>|void;
};
export default function CarrierBulkTrashDialog({carrier,onClose,onCompleted}:Props){
 const [preview,setPreview]=useState<CarrierTrashPreview|null>(null);
 const [confirmation,setConfirmation]=useState('');
 const [loading,setLoading]=useState(true);
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState('');
 const [finished,setFinished]=useState(false);
 const titleId=useId();
 const phrase='DELETE '+carrier;

 async function loadPreview(){
  setPreview(null);setConfirmation('');setError('');setLoading(true);
  try{setPreview(await ops.previewDispatchCarrierTrash(carrier))}
  catch(e:any){setError('Unable to preview: '+String(e?.message||'Refresh and try again.'))}
  finally{setLoading(false)}
 }
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setPreview(null);setConfirmation('');
  void ops.previewDispatchCarrierTrash(carrier).then(result=>{if(active)setPreview(result)})
   .catch(e=>{if(active)setError('Unable to preview: '+String(e?.message||'Refresh and try again.'))})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[carrier]);

 async function confirmMove(){
  if(submitting||loading||!preview||preview.eligible<=0||confirmation!==phrase||finished)return;
  if(!window.confirm('Move '+preview.eligible+' personal '+carrier+' process(es) from Dispatch Tracking to Deleted Processes?\n\n'
    +'This is recoverable, but it removes the selected processes from all active workflow screens. '
    +'Their documents and audit history stay stored. '+preview.blocked+' blocked and '+preview.shared+' shared record(s) remain untouched.'))return;
  setSubmitting(true);setError('');
  try{
   const result=await ops.moveDispatchCarrierToTrash(preview,confirmation);
   setFinished(true);
   try{await onCompleted(result)}
   catch{setError('Processes were moved successfully, but page refresh failed. Refresh the website; do NOT submit again.')}
  }catch(e:any){
   setError('Nothing was moved, or the result needs review: '+String(e?.message||'Please reload the preview.'));
   // The backend refuses stale previews and rolls back the entire update.
   // Do not silently resubmit the same fingerprint.
   setPreview(null);setConfirmation('');
  }finally{setSubmitting(false)}
 }
 return <div className='ux-tracking-overlay' role='presentation'>
  <section className='ux-carrier-trash-dialog' role='dialog' aria-modal='true'
   aria-labelledby={titleId}>
   <header className='ux-carrier-trash-header'>
    <div><small>DISPATCH TRACKING · CARRIER CLEANUP</small>
     <h3 id={titleId}><Trash2 size={21}/> Move {carrier} processes to trash</h3></div>
    <button type='button' aria-label='Close carrier cleanup' disabled={submitting} onClick={onClose}><X size={19}/></button>
   </header>
   <div className='ux-carrier-trash-warning'>
    <AlertTriangle size={18}/>
    <span>All eligible personal <b>{carrier}</b> processes currently in Dispatch Tracking
     will be moved, <b>not just rows matching your search or status filter</b>.
     This is recoverable in Data Store → Deleted Processes, not permanent deletion.</span>
   </div>
   {loading?<div className='ux-carrier-trash-loading'><RefreshCw size={16} className='ux-spin'/> Checking latest processes and jobs…</div>:null}
   {preview&&!loading&&<>
    <div className='ux-carrier-trash-counts'>
     <div><b>{preview.total_owned}</b><span>Your matching records</span></div>
     <div className='eligible'><b>{preview.eligible}</b><span>Can move to trash</span></div>
     <div className='blocked'><b>{preview.blocked}</b><span>Blocked by jobs</span></div>
     <div><b>{preview.shared}</b><span>Shared — protected</span></div>
    </div>
    {preview.blocked>0&&<div className='ux-carrier-trash-blocked'>
     <AlertTriangle size={16}/> {preview.blocked} process(es) have a queued or Running job and
     will stay active. Resolve them individually in Audit &amp; Reports.
     {preview.blocked_processes?.length>0&&<span>Blocked Process Nos.: {preview.blocked_processes.slice(0,10).join(', ')}
      {preview.blocked_processes.length>10?' and more':''}</span>}
    </div>}
    {preview.shared>0&&<p className='ux-carrier-trash-note'>Shared-team processes are excluded and cannot be moved using this control.</p>}
    {preview.eligible>0&&!finished&&<label className='ux-carrier-trash-confirm'>
     <span>To confirm moving <strong>{preview.eligible}</strong> process(es), type <code>{phrase}</code></span>
     <input autoComplete='off' spellCheck={false} placeholder={phrase}
      value={confirmation} onChange={e=>setConfirmation(e.target.value)}
      disabled={submitting} aria-label='Type transporter deletion confirmation'/>
    </label>}
    {preview.eligible===0&&<div className='ux-carrier-trash-note'>No personal processes can be moved for this carrier. Nothing has changed.</div>}
   </>}
   {error&&<div role='alert' className='ux-carrier-trash-error'>{error}</div>}
   {finished&&<div role='status' className='ux-carrier-trash-done'><ShieldCheck size={17}/> Cleanup completed. Check Deleted Processes in Data Store.</div>}
   <footer className='ux-carrier-trash-footer'>
    <button type='button' onClick={()=>void loadPreview()} disabled={submitting||loading||finished}><RefreshCw size={15}/> Refresh preview</button>
    <button type='button' onClick={onClose} disabled={submitting}>{finished?'Close':'Cancel'}</button>
    {!finished&&<button type='button' className='danger' disabled={submitting||loading||!preview||preview.eligible<=0||confirmation!==phrase}
     onClick={()=>void confirmMove()}><Trash2 size={15}/>{submitting?'Moving…':'Move '+(preview?.eligible||0)+' to Deleted Processes'}</button>}
   </footer>
  </section>
 </div>;
}
