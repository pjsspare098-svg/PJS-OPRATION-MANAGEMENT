import {useState} from 'react';
import {AlertTriangle,CheckCircle2,FileCheck2,Mail,ShieldCheck,X} from 'lucide-react';
import {checkEmailSend,defaultEmailSendDocs,documentOptions,type EmailSendDocs} from './emailSend';
import {requestEmailSend} from './emailSendApi';
import {dispatchEmailRows} from './emailWorkflow';

type Props={
 record:any; busy:boolean;onEdit:(record:any)=>void;
 onClose:()=>void;onQueued:()=>Promise<void>;
};
export default function EmailSendReview({record,busy,onEdit,onClose,onQueued}:Props){
 const [selected,setSelected]=useState<EmailSendDocs>(()=>defaultEmailSendDocs(record));
 const [phrase,setPhrase]=useState('');
 const [checked,setChecked]=useState(false);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const readiness=checkEmailSend(record,selected);
 const expected='SEND '+record.process;
 const maySend=!busy&&!working&&readiness.ready&&checked&&phrase===expected;
 async function approve(){
  if(!maySend)return;
  if(!window.confirm('CONFIRM REAL EMAIL SEND for Process '+record.process+
   '\n\nThe Windows Python agent will find the attached original conversation by Message-ID, use Outlook Reply All recipients, attach the selected Invoice + LR PDFs, and invoke Send ONCE when live execution is enabled.'+
   '\n\nYou must verify the original email and recipient list in Outlook. This cannot be undone. Continue?'))return;
  setWorking(true);setError('');
  let approved=false;
  try{
   await requestEmailSend(record,selected,phrase);
   approved=true;
   await onQueued();
  }catch(e:any){
   setError((approved?'Request was queued, but refresh failed. Refresh and check status; do not request again. ':'Approval was not accepted: ')+
    String(e?.message||'Unknown error'));
  }finally{setWorking(false)}
 }
 const docs=[
  {slot:'original' as const,kind:'emailDoc',label:'Original Outlook conversation (.eml)'},
  {slot:'invoice' as const,kind:'invoiceDoc',label:'Invoice PDF'},
  {slot:'lr' as const,kind:'lrDoc',label:'Courier LR / Docket PDF'},
 ];
 return <div className='ux-email-send-review' role='region' aria-label={'Approve real Outlook Reply All send for process '+record.process}>
  <div className='ux-email-send-title'><div><strong><ShieldCheck size={16}/> Review before real email sending · {record.process}</strong>
   <small>Nothing will send until you explicitly approve and enable the separate Windows Python worker.</small></div>
   <button type='button' aria-label='Close email send review' onClick={onClose} disabled={working}><X size={16}/></button></div>
  <div className='ux-email-send-dispatch'>
   {dispatchEmailRows(record).map(row=><div key={row.label}><small>{row.label}</small><strong>{row.value}</strong></div>)}
  </div>
  <div className='ux-email-send-files'>
   {docs.map(({slot,kind,label})=>{
    const options=documentOptions(record,kind);
    return <label key={slot}><strong><FileCheck2 size={14}/>{label}</strong>
     <select value={selected[slot]} disabled={working||busy} onChange={e=>setSelected(prev=>({...prev,[slot]:e.target.value}))}>
      <option value=''>Select verified {label}</option>
      {options.map((d:any)=><option value={d.id} key={d.id}>{d.name}</option>)}
     </select></label>;
   })}
  </div>
  {readiness.missing.length>0&&<div className='ux-email-send-missing'><strong><AlertTriangle size={14}/> Complete these items before sending:</strong>
   <p>{readiness.missing.join(' · ')}</p>
   <button type='button' onClick={()=>onEdit(record)}>Edit process & upload files</button></div>}
  {readiness.ready&&<div className='ux-email-send-confirm'>
   <label><input type='checkbox' checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={working}/>
    I verified the attached original Outlook conversation, intended Reply All recipients, exact dispatch information, and Invoice/LR files. This request will send a real email after the Windows worker is enabled. No automatic retry is allowed.</label>
   <label className='ux-email-send-phrase'>Type <code>{expected}</code> to approve:
    <input type='text' autoComplete='off' spellCheck={false} value={phrase} onChange={e=>setPhrase(e.target.value)}
     placeholder={expected} disabled={working}/></label>
  </div>}
  {error&&<div className='ux-email-send-error' role='alert'><AlertTriangle size={15}/>{error}</div>}
  <div className='ux-email-send-footer'>
   <button type='button' onClick={onClose} disabled={working}>Cancel</button>
   <button type='button' className='ux-email-send-approve' disabled={!maySend} onClick={()=>void approve()}>
    {working?'Approving…':<><Mail size={15}/> Approve & Queue Send Email</>}</button>
  </div>
  <small className='ux-email-send-footnote'><CheckCircle2 size={12}/> Outlook's Send command submits mail to the sending account; customer delivery is not guaranteed. Any uncertain result requires manual checks in Outlook Sent Items/Outbox.</small>
 </div>;
}
