import {filterStage} from './workflowStages';
import {useEffect,useMemo,useState} from 'react';
import {
 AlertTriangle,ChevronDown,ChevronRight,ClipboardCheck,Download,ExternalLink,
 FileText,Mail,RefreshCw,Search,Upload,XCircle
} from 'lucide-react';
import {Button,Empty,Heading} from './UnifiedKit';
import {cloud} from './cloud';
import {dispatchEmailRows,dispatchEmailNotes,originalOutlookMessages} from './emailWorkflow';
import EmailExcelTools from './EmailExcelTools';
import EmailSendReview from './EmailSendReview';
import {cancelEmailSend,emailWorkerActive,getEmailSendWorkerStatus,listEmailSendRequests,type EmailSendRequest,type EmailSendWorkerStatus} from './emailSendApi';

export default function EmailToClientWorkflow({p}:{p:any}){
 const {results,onEdit,onAttach,onDraftEmail,busy}=p;
 const [expanded,setExpanded]=useState<string[]>([]);
 const [previewed,setPreviewed]=useState<string[]>([]);
 const [query,setQuery]=useState('');
 const [localError,setLocalError]=useState('');
 const [sendReview,setSendReview]=useState<string|null>(null);
 const [emailRequests,setEmailRequests]=useState<EmailSendRequest[]>([]);
 const [emailWorker,setEmailWorker]=useState<EmailSendWorkerStatus|null>(null);
 const [sendBusy,setSendBusy]=useState(false);
 const [selectedOriginal,setSelectedOriginal]=useState<Record<string,string>>({});
 const emailRows=filterStage(results,'Email to Client');
 async function refreshEmailStatus(){
  if(!p.authenticated){setEmailRequests([]);setEmailWorker(null);return}
  const [requests,worker]=await Promise.all([listEmailSendRequests(),getEmailSendWorkerStatus()]);
  setEmailRequests(requests);setEmailWorker(worker);
 }
 useEffect(()=>{
  let active=true;
  if(p.authenticated){
   void Promise.all([listEmailSendRequests(),getEmailSendWorkerStatus()])
    .then(([requests,worker])=>{if(active){setEmailRequests(requests);setEmailWorker(worker)}})
    .catch(e=>{if(active)setLocalError('Email worker status could not load: '+String(e?.message||e))});
  }
  return ()=>{active=false};
 },[p.authenticated]);
 async function reload(){
  try{await Promise.all([p.onRefresh?.(),refreshEmailStatus()])}
  catch(e:any){setLocalError('Refresh failed: '+String(e?.message||e))}
 }
 async function cancelRequest(request:EmailSendRequest){
  if(request.status!=='queued'||sendBusy)return;
  if(!window.confirm('Cancel unsent email request for Process '+request.process_no+'? This can only cancel a request that the Windows worker has not claimed.'))return;
  setSendBusy(true);setLocalError('');
  try{await cancelEmailSend(request);await refreshEmailStatus()}
  catch(e:any){setLocalError(String(e?.message||'Cancellation failed. Check status before retrying.'))}
  finally{setSendBusy(false)}
 }
 const rows=useMemo(()=>{
  const q=query.toLowerCase().trim();
  return q?emailRows.filter((r:any)=>[r.process,r.party,r.so,r.invoice,r.po,r.transporter,r.lr,r.sales].some(value=>String(value||'').toLowerCase().includes(q))):emailRows;
 },[emailRows,query]);
 const toggle=(id:string)=>setExpanded(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id]);
 const togglePreview=(id:string)=>setPreviewed(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id]);
 return <div className='ux-email-workflow ux-email-register'>
  <Heading eyebrow='STAGE 04 · CLIENT COMMUNICATION' title='Email to Client'
   description='Open a process to review its dispatch details. Use Send Email for an explicitly approved Outlook Reply All via the Windows Python worker, or send manually.'
   actions={<Button onClick={()=>void reload()}><RefreshCw size={15}/> Refresh</Button>}/>
  <EmailExcelTools records={p.records||[]} authenticated={p.authenticated} busy={busy}
   userId={p.userId||''} onImported={reload}/>
  <div className='ux-email-send-worker-note'><Mail size={15}/><span>{emailWorkerActive(emailWorker)?'Email Send worker connected and enabled':'Email Send worker offline or paused'} · Sending remains per-process, explicitly approved, with no automatic retries.</span></div>
  <div className='ux-email-register-bar'>
   <div><strong><Mail size={17}/> Email processes</strong>
    <small>{rows.length} visible of {emailRows.length} in Email to Client · open a row for complete dispatch details</small></div>
   <label className='ux-email-register-search'><Search size={16}/><input type='search' value={query}
    onChange={e=>setQuery(e.target.value)} placeholder='Search process, party, SO, invoice…' aria-label='Search email processes'/></label>
  </div>
  {localError&&<div className='ux-import-warning' role='alert'><AlertTriangle size={16}/>{localError}<button onClick={()=>setLocalError('')} aria-label='Dismiss error'><XCircle size={16}/></button></div>}
  <div className='ux-email-entry-list'>{rows.length?rows.map((r:any)=>{
   const isOpen=expanded.includes(r.id);
   const hasPreview=previewed.includes(r.id);
   const existingRequest=emailRequests.find(req=>req.process_id===r.id&&req.status!=='cancelled');
   const sendIsOpen=sendReview===r.id;
   const docs=originalOutlookMessages(r);
   const originalId=selectedOriginal[r.id]||(docs.length===1?docs[0].id:'');
   const selected=docs.find((doc:any)=>doc.id===originalId);
   const attachments=(r.documents||[]).filter((d:any)=>['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(d.kind));
   return <article className={'ux-email-entry '+(isOpen?'is-expanded':'')} key={r.id}>
    <div className='ux-email-entry-main'>
     <button type='button' className='ux-email-entry-identity' onClick={()=>toggle(r.id)} aria-expanded={isOpen}
      aria-controls={'email-detail-'+r.id} title='Open full process details'>
      <span className='ux-email-entry-icon'><Mail size={18}/></span>
      <span><strong>{r.process} <span>· {r.party||'Party not recorded'}</span></strong>
       <small>SO {r.so||'—'} <i>·</i> Invoice {r.invoice||'Pending'} <i>·</i> {r.sales||'Sales person pending'}</small></span>
     </button>
     <div className='ux-email-entry-actions'>
      <button type='button' className={'ux-email-entry-expand '+(isOpen?'active':'')} onClick={()=>toggle(r.id)} aria-expanded={isOpen}
       aria-controls={'email-detail-'+r.id}>{isOpen?<ChevronDown size={15}/>:<ChevronRight size={15}/>} {isOpen?'Hide details':'Open details'}</button>
      <button type='button' onClick={()=>onEdit(r)}><FileText size={14}/> Edit</button>
      <button type='button' onClick={()=>onDraftEmail(r)}><ClipboardCheck size={14}/> Copy email</button>
      <button type='button' className='ux-email-entry-send' disabled={busy||sendBusy||!p.authenticated||Boolean(existingRequest)}
       onClick={()=>setSendReview(old=>old===r.id?null:r.id)}><Mail size={14}/>
       {existingRequest?(existingRequest.status==='queued'?'Send queued':existingRequest.status==='running'?'Sending…':existingRequest.status==='completed'?'Outlook submitted':'Needs review'):'Send Email'}</button>
      <button type='button' className='ux-email-entry-sent' disabled={busy||!p.authenticated||Boolean(existingRequest)}
       onClick={()=>void p.onConfirmEmailSent?.(r)}><Mail size={14}/> Sent · Track</button>
     </div>
    </div>
    {existingRequest&&<div className='ux-email-send-current'>
      <strong>{existingRequest.status==='queued'?'Waiting for Windows email worker':existingRequest.status==='running'?'Worker has claimed this send; check Outlook':existingRequest.status==='completed'?'Reply All submitted to Outlook': 'Email send needs manual review'}</strong>
      <small>{existingRequest.status==='completed'?'Submitted to Outlook, not guaranteed delivered. Refresh to see Dispatch Tracking.':existingRequest.status==='review_required'||existingRequest.status==='running'?'Do not send again. Inspect the authorized Outlook Sent Items / Outbox before resolving.':'You may cancel before the worker claims this email.'}</small>
      {existingRequest.status==='queued'&&<button type='button' onClick={()=>void cancelRequest(existingRequest)} disabled={sendBusy}>Cancel queued send</button>}
     </div>}
    {sendIsOpen&&!existingRequest&&<EmailSendReview record={r} busy={busy||sendBusy} onEdit={onEdit} onClose={()=>setSendReview(null)}
      onQueued={async()=>{setSendReview(null);await reload()}}/>}
    {isOpen&&<div className='ux-email-entry-details' id={'email-detail-'+r.id}>
     <div className='ux-email-entry-section-heading'><strong>Dispatch details</strong>
      <span>Review these values before replying to the customer</span></div>
     <div className='ux-email-entry-detail-grid'>
      <div className='ux-email-entry-fields'>
       {dispatchEmailRows(r).map(field=><div key={field.label}><small>{field.label}</small><strong>{field.value}</strong></div>)}
       <div><small>Product / Work</small><strong>{r.productName||'—'}</strong></div>
       <div><small>Sales person</small><strong>{r.sales||'—'}</strong></div>
      </div>
      <div className='ux-email-entry-documents'>
       <strong><Mail size={16}/> Original Outlook conversation</strong>
       {docs.length===0?<small>No original .eml attached. You can find the conversation directly in Outlook or upload it here for reference.</small>:<>
        {docs.length>1&&<label className='ux-outlook-select-label'>Choose original conversation
         <select value={originalId} onChange={e=>setSelectedOriginal(old=>({...old,[r.id]:e.target.value}))}>
          <option value=''>Select .eml</option>
          {docs.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
         </select></label>}
        {selected&&<><small className='ux-email-filename'>{selected.name}</small>
         <Button disabled={busy} onClick={()=>void cloud.download(r.id,selected.id).catch((e:any)=>setLocalError(e?.message||'Download failed'))}>
          <Download size={14}/> Download original email</Button></>}
       </>}
       <label className='ux-button secondary ux-file-button'><Upload size={14}/> Upload original .eml
        <input type='file' accept='.eml,message/rfc822' disabled={busy||!p.authenticated}
         onChange={e=>{onAttach(r,'emailDoc',e.target.files?.[0]);e.target.value=''}}/>
       </label>
       <div className='ux-email-entry-file-note'><strong><FileText size={15}/> Saved dispatch documents</strong>
        <small>Invoice PDF: {attachments.some((d:any)=>d.kind==='invoiceDoc'&&/\.pdf$/i.test(d.name||''))?'Attached':'Missing'} · Courier receipt PDF: {attachments.some((d:any)=>d.kind==='lrDoc'&&/\.pdf$/i.test(d.name||''))?'Attached':'Missing'}</small>
        <button type='button' onClick={()=>onEdit(r)}><ExternalLink size={13}/> Open documents in Process Editor</button>
       </div>
      </div>
     </div>
     <div className='ux-email-entry-details-actions'>
      <button type='button' onClick={()=>togglePreview(r.id)}><FileText size={14}/> {hasPreview?'Hide Reply All preview':'Preview complete Reply All message'}</button>
      <button type='button' onClick={()=>onDraftEmail(r)}><ClipboardCheck size={14}/> Copy dispatch text</button>
      <button type='button' className='ux-email-entry-sent' disabled={busy||!p.authenticated}
       onClick={()=>void p.onConfirmEmailSent?.(r)}><Mail size={14}/> I sent this in Outlook · Track</button>
     </div>
     {hasPreview&&<div className='ux-outlook-preview'>
      <strong>PressureJet — Reply All message preview</strong>
      <small>Copy the message into the original Outlook thread. Verify recipients and attach the invoice and LR manually.</small>
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
       <p>Kindly confirm upon receipt of the material.</p><p>Regards,</p>
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
      <Button onClick={()=>onDraftEmail(r)}><ClipboardCheck size={15}/> Copy dispatch text</Button>
     </div>}
     <p className='ux-outlook-footnote'>For manual sending, confirm Sent · Track only after sending Reply All yourself. For Python sending, use the separate Send Email approval, then verify status in Outlook. Customer delivery is never guaranteed.</p>
    </div>}
   </article>;
  }):<Empty icon={Mail} title={query?'No matching email processes':'No email-ready processes'}
    help={query?'Change your search or clear its text.':'Import Email to Client records from Excel or move a process here from DataDoc/Universal Process.'}/>}</div>
 </div>;
}
