import {filterStage} from './workflowStages';
import {useState} from 'react';
import {AlertTriangle,ClipboardCheck,Download,FileText,Mail,RefreshCw,Upload,XCircle} from 'lucide-react';
import {Button,Empty,Heading} from './UnifiedKit';
import {cloud} from './cloud';
import {dispatchEmailRows,dispatchEmailNotes,originalOutlookMessages} from './emailWorkflow';

export default function EmailToClientWorkflow({p}:{p:any}){
 const {results,onEdit,onAttach,onDraftEmail,busy}=p;
 const [expanded,setExpanded]=useState<string[]>([]);
 const [localError,setLocalError]=useState('');
 const [selectedOriginal,setSelectedOriginal]=useState<Record<string,string>>({});
 const rows=filterStage(results,'Email to Client');
 const toggle=(id:string)=>setExpanded(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id]);
 return <div className='ux-email-workflow'>
  <Heading eyebrow='STAGE 04 · MANUAL CLIENT COMMUNICATION' title='Email to Client'
   description='No Outlook worker or email queue. Open your original conversation in Outlook, Reply All manually, and confirm only after actually sending.'
   actions={<Button onClick={()=>void p.onRefresh?.()}><RefreshCw size={15}/> Refresh</Button>}/>
  <div className='ux-outlook-steps' aria-label='Manual dispatch workflow'>
   <span><b>1</b> Find original Outlook conversation</span>
   <span><b>2</b> Check and copy dispatch details</span>
   <span><b>3</b> Reply All and send manually</span>
   <span><b>4</b> Confirm sent to move to Tracking</span>
  </div>
  <div className='ux-outlook-worker'>
   <div className='ux-outlook-worker-dot'/>
   <div><strong>Manual Outlook workflow — no automation running</strong>
    <small>You control the actual recipients, attachments, Reply All and Send in Outlook. PJS OMS records your manual confirmation only.</small>
   </div>
  </div>
  {localError&&<div className='ux-import-warning' role='alert'><AlertTriangle size={16}/>{localError}<button onClick={()=>setLocalError('')} aria-label='Dismiss error'><XCircle size={16}/></button></div>}
  <div className='ux-card-list'>{rows.length?rows.map((r:any)=>{
   const docs=originalOutlookMessages(r);
   const originalId=selectedOriginal[r.id]||(docs.length===1?docs[0].id:'');
   const selected=docs.find((doc:any)=>doc.id===originalId);
   const isOpen=expanded.includes(r.id);
   const attachments=(r.documents||[]).filter((d:any)=>['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(d.kind));
   return <article className='ux-process-card ux-outlook-process' key={r.id}>
    <div className='ux-process-card-title'>
     <div><strong>{r.process} · {r.party||'Party not recorded'}</strong>
      <small>SO {r.so||'—'} · {r.productName||'Product not set'} · Invoice {r.invoice||'Missing'}</small></div>
     <span className='ux-email-job-status'>Manual Reply All</span>
    </div>
    <div className='ux-outlook-card-grid'>
     <div className='ux-outlook-subpanel'>
      <strong><Mail size={16}/> Original Outlook conversation</strong>
      {docs.length===0?<small>Optional: attach the original .eml for reference. Use Outlook to find the actual thread and recipients.</small>:<>
       {docs.length>1&&<label className='ux-outlook-select-label'>Choose original Outlook conversation
        <select value={originalId} onChange={e=>setSelectedOriginal(old=>({...old,[r.id]:e.target.value}))}>
         <option value=''>Select original .eml</option>
         {docs.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>}
       {selected&&<><span className='ux-email-filename'>{selected.name}</span>
        <Button disabled={busy} onClick={()=>void cloud.download(r.id,selected.id).catch((e:any)=>setLocalError(e?.message||'Download failed'))}>
         <Download size={14}/> Download original .eml</Button></>}
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
     <small>Copy these details into your own Reply All message in Outlook. Check actual recipients, original thread and attachments before pressing Send.</small>
     <div className='ux-pressurejet-email'>
      <p>Dear Sir,</p>
      <p>This is with reference to your below-mentioned purchase order.</p>
      <p>Please note that we have dispatched your spares/pump as per the details below:</p>
      <table className='ux-pressurejet-email-table'><tbody>
       {dispatchEmailRows(r).map(item=><tr key={item.label}><th scope='row'>{item.label}</th><td>{item.value}</td></tr>)}
      </tbody></table>
      <ul>{dispatchEmailNotes.map(note=><li key={note}>{note.includes('http://pressurejet.com/')?
       <>{note.split('http://pressurejet.com/')[0]}<a href='http://pressurejet.com/ManageVideo/Default.aspx' target='_blank' rel='noreferrer'>http://pressurejet.com/ManageVideo/Default.aspx</a></>:note}</li>)}</ul>
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
    <div className='ux-row-actions'>
     <label className='ux-button secondary ux-file-button'><Upload size={15}/> Upload original .eml
      <input type='file' accept='.eml,message/rfc822' disabled={busy||!p.authenticated}
       onChange={e=>{onAttach(r,'emailDoc',e.target.files?.[0]);e.target.value=''}}/>
     </label>
     <Button onClick={()=>onEdit(r)}>Edit dispatch</Button>
     <Button onClick={()=>onDraftEmail(r)}><ClipboardCheck size={15}/> Copy dispatch text</Button>
     <Button variant='mint' disabled={busy||!p.authenticated} onClick={()=>void p.onConfirmEmailSent?.(r)}>
      <Mail size={15}/> I sent this in Outlook · Track
     </Button>
    </div>
    <small className='ux-outlook-footnote'>PJS OMS does not create drafts or send emails. Only confirm after your manual Outlook Reply All was actually sent. This is an operator confirmation, not Outlook delivery verification.</small>
   </article>;
  }):<Empty icon={Mail} title='No email-ready processes' help='Move a process to Email to Client from Universal Process or DataDoc.'/>}</div>
 </div>;
}
