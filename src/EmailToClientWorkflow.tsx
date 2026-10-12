import {filterStage} from './workflowStages';
import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,ClipboardCheck,Download,FileText,Mail,RefreshCw,ShieldCheck,Upload,XCircle} from 'lucide-react';
import {Button,Empty,Heading} from './UnifiedKit';
import {cloud} from './cloud';
import {supabase} from './independentClient';
import {dispatchEmailRows,dispatchEmailNotes,emailDraftReadiness,originalOutlookMessages} from './emailWorkflow';

type OutlookStatus={worker_name:string;status:string;last_seen_at:string;details:any}|null;
export default function EmailToClientWorkflow({p}:{p:any}){
 const {results,jobs,onEdit,onAttach,onQueue,onDraftEmail,busy}=p;
 const [worker,setWorker]=useState<OutlookStatus>(null);
 const [workerError,setWorkerError]=useState('');
 const [checking,setChecking]=useState(false);
 const [expanded,setExpanded]=useState<string[]>([]);
 const [localError,setLocalError]=useState('');
 const [selectedOriginal,setSelectedOriginal]=useState<Record<string,string>>({});
 const loadWorker=useCallback(async()=>{
  if(!supabase||!p.authenticated){setWorker(null);return}
  setChecking(true);
  try{
   const {data:user,error:authError}=await supabase.auth.getUser();
   if(authError||!user.user)throw new Error('Sign in to read worker status');
   const {data,error}=await supabase.from('oms_outlook_workers')
     .select('worker_name,status,last_seen_at,details').eq('owner_id',user.user.id).maybeSingle();
   if(error)throw error;
   setWorker(data||null);setWorkerError('');
  }catch(e:any){setWorker(null);setWorkerError(e?.message||'Worker status unavailable')}
  finally{setChecking(false)}
 },[p.authenticated]);
 useEffect(()=>{void loadWorker();const timer=setInterval(()=>void loadWorker(),30000);return ()=>clearInterval(timer)},[loadWorker]);
 const lastSeen=worker?.last_seen_at?Date.parse(worker.last_seen_at):0;
 const connected=Boolean(lastSeen&&Date.now()-lastSeen<90000);
 const online=Boolean(connected&&['ready','idle','busy'].includes(worker?.status||''));
 const rows=filterStage(results,'Email to Client');
 const toggle=(id:string)=>setExpanded(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id]);
 return <div className='ux-email-workflow'>
  <Heading eyebrow='STAGE 04 · CLIENT COMMUNICATION' title='Email to Client'
    description='Use the original attached Outlook conversation to prepare a Reply All draft with the correct dispatch details.'
    actions={<Button disabled={checking} onClick={()=>{void loadWorker();void p.onRefresh?.()}}><RefreshCw size={15}/> Refresh status</Button>}/>
  <div className='ux-outlook-steps' aria-label='Dispatch workflow'>
   <span><b>1</b> Attach original .eml</span><span><b>2</b> Check dispatch details</span>
   <span><b>3</b> Queue Reply All draft</span><span><b>4</b> Review &amp; send in Outlook</span>
  </div>
  <div className='ux-outlook-worker'>
   <div className={'ux-outlook-worker-dot '+(online?'is-online':'')}/>
   <div><strong>Outlook desktop worker: {online?(worker?.status==='busy'?'Preparing a draft':'Connected'):connected?'Connected — paused':'Not connected'}</strong>
    <small>{online?'Classic Outlook is reporting an active worker session. Sending still requires review.':'Requests can be queued and will wait. A paused worker needs its local draft setting enabled; an offline worker needs an authorized Windows session.'}</small>
    {workerError&&<small>Connection status unavailable: {workerError}</small>}
   </div>
   <a href='https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/blob/main/docs/OUTLOOK_AUTOMATION_SETUP.md' target='_blank' rel='noreferrer'>Worker setup guide</a>
  </div>
  {localError&&<div className='ux-import-warning' role='alert'><AlertTriangle size={16}/>{localError}<button onClick={()=>setLocalError('')} aria-label='Dismiss error'><XCircle size={16}/></button></div>}
  <div className='ux-card-list'>{rows.length?rows.map((r:any)=>{
   const docs=originalOutlookMessages(r);
   const originalId=selectedOriginal[r.id]||(docs.length===1?docs[0].id:'');
   const selected=docs.find((doc:any)=>doc.id===originalId);
   const draftRecord={...r,selected_email_document_id:originalId,current_user_id:p.userId};
   const readiness=emailDraftReadiness(draftRecord,jobs);
   const {latest,active}=readiness;
   const isOpen=expanded.includes(r.id);
   const attachments=(r.documents||[]).filter((d:any)=>['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(d.kind));
   const jobStatus=active?.status||latest?.status||'not_queued';
   const statusText=jobStatus==='running'?'Draft being prepared':jobStatus==='queued'?'Waiting for Outlook worker':jobStatus==='completed'?'Draft prepared — not sent':jobStatus==='failed'?'Needs review':jobStatus==='cancelled'?'Request cancelled':'Not queued';
   return <article className='ux-process-card ux-outlook-process' key={r.id}>
    <div className='ux-process-card-title'>
     <div><strong>{r.process} · {r.party}</strong><small>SO {r.so||'—'} · {r.productName||'Product not set'} · Invoice {r.invoice||'Missing'}</small></div>
     <span className={'ux-email-job-status status-'+jobStatus.replace(/[^a-z]/g,'')}>{statusText}</span>
    </div>
    <div className='ux-outlook-card-grid'>
     <div className='ux-outlook-subpanel'>
      <strong><Mail size={16}/> Original Outlook conversation</strong>
      {docs.length===0?<small>No original email attached. Upload the original .eml file.</small>:<>
        {docs.length>1?<label className='ux-outlook-select-label'>Choose the original Outlook conversation
         <select value={originalId} onChange={e=>setSelectedOriginal(old=>({...old,[r.id]:e.target.value}))}>
          <option value=''>Select an original .eml</option>
          {docs.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
         </select></label>:null}
        {selected&&<><span className='ux-email-filename'>{selected.name}</span>
         <Button disabled={busy} onClick={()=>void cloud.download(r.id,selected.id).catch((e:any)=>setLocalError(e?.message||'Download failed'))}><Download size={14}/> Download original .eml</Button></>}
      </>}
     </div>
     <div className='ux-outlook-subpanel'>
      <strong><FileText size={16}/> Dispatch details and files</strong>
      <small>{r.invoice?'Invoice '+r.invoice:'Invoice number missing'} · {r.transporter||'Transporter pending'} · {r.lr||'LR pending'}</small>
      <small>Invoice PDF: {attachments.some((d:any)=>d.kind==='invoiceDoc'&&/\.pdf$/i.test(d.name||''))?'Attached':'Missing'} · Courier receipt PDF: {attachments.some((d:any)=>d.kind==='lrDoc'&&/\.pdf$/i.test(d.name||''))?'Attached':'Missing'}</small>
      <Button onClick={()=>toggle(r.id)}><FileText size={14}/>{isOpen?'Hide preview':'Review dispatch preview'}</Button>
     </div>
    </div>
    {isOpen&&<div className='ux-outlook-preview'>
      <strong>PressureJet — Reply All message preview</strong>
      <small>Outlook preserves the original conversation, subject and recipients. The following dispatch message will be inserted above that thread. Review all values before queuing.</small>
      <div className='ux-pressurejet-email'>
       <p>Dear Sir,</p>
       <p>This is with reference to your below-mentioned purchase order.</p>
       <p>Please note that we have dispatched your spares/pump as per the details below:</p>
       <table className='ux-pressurejet-email-table'><tbody>
        {dispatchEmailRows(r).map(item=><tr key={item.label}><th scope='row'>{item.label}</th><td>{item.value}</td></tr>)}
       </tbody></table>
       <ul>{dispatchEmailNotes.map(note=><li key={note}>{note.includes('http://pressurejet.com/')?
         <>{note.split('http://pressurejet.com/')[0]}<a href='http://pressurejet.com/ManageVideo/Default.aspx' target='_blank' rel='noreferrer'>http://pressurejet.com/ManageVideo/Default.aspx</a></>
         :note}</li>)}</ul>
       <p>Kindly confirm upon receipt of the material.</p>
       <p>Regards,</p>
       <div className='ux-pressurejet-signature'><strong>CHETAN SOLANKI</strong>
        <span>PressureJet Systems Pvt. Ltd.</span>
        <span>21-24 Panchratna Industrial Estate,</span>
        <span>Ode-Pirana Road, Paldi Kankaj,</span>
        <span>Ahmedabad – 382427, Gujarat, India</span>
        <span>Mobile: +91-9376022359</span>
        <span>E-Mail: <a href='mailto:Dispatch@pressurejet.com'>Dispatch@pressurejet.com</a></span>
        <span>Website: <a href='https://www.pressurejet.com/' target='_blank' rel='noreferrer'>www.pressurejet.com</a></span>
       </div>
      </div>
      <Button onClick={()=>onDraftEmail(r)}><ClipboardCheck size={15}/> Copy formatted dispatch text</Button>
    </div>}
    {readiness.missing.length>0&&<div className='ux-outlook-warning'><AlertTriangle size={15}/><div><strong>Complete before queueing:</strong> {readiness.missing.join(' · ')}</div></div>}
    {latest?.error_message&&latest.status==='failed'&&<div className='ux-outlook-warning'><AlertTriangle size={15}/><div>{latest.error_message}</div></div>}
    {readiness.legacy&&<div className='ux-outlook-warning'><AlertTriangle size={15}/><div>This is an older Outlook request. Cancel it before queueing a new draft-only request.</div></div>}
    {latest?.status==='completed'&&<div className='ux-outlook-note'><CheckCircle2 size={15}/> A Reply All draft was prepared in office Outlook. This is NOT confirmation that an email was sent.</div>}
    <div className='ux-row-actions'>
     <label className='ux-button secondary ux-file-button'><Upload size={15}/> Upload .eml<input type='file' accept='.eml,message/rfc822' onChange={e=>{onAttach(r,'emailDoc',e.target.files?.[0]);e.target.value=''}}/></label>
     <Button onClick={()=>onEdit(r)}>Edit dispatch</Button>
     <Button variant='primary' disabled={busy||!p.authenticated||!readiness.ready||Boolean(active)} onClick={()=>onQueue(draftRecord,'email_reply')}><Mail size={15}/> Queue Reply All draft</Button>
     {active?.status==='queued'&&<Button disabled={busy} onClick={()=>void p.onCancelEmailJob?.(active)}><XCircle size={15}/> Cancel queued request</Button>}
     {latest?.status==='completed'&&<Button variant='mint' disabled={busy} onClick={()=>void p.onConfirmEmailSent?.(r)}><ShieldCheck size={15}/> Confirm sent &amp; track</Button>}
    </div>
    <small className='ux-outlook-footnote'>Draft creation is automated only with the connected Classic Outlook worker. No recipients are extracted, and no email is sent automatically.</small>
   </article>;
  }):<Empty icon={Mail} title='No email-ready processes' help='Move a process to Email to Client from Universal Process or DataDoc.'/>}</div>
 </div>;
}
