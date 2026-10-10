import {useRef,useState} from 'react';
import {X,Upload,FileText,Check,ChevronDown,FileCheck2,Settings2,ExternalLink,AlertTriangle} from 'lucide-react';
import {cloud} from './cloud';
export const blankProcess=()=>({process:'',party:'',so:'',stage:'Universal Process',status:'Review',invoice:'',invoiceDate:'',credit:'Credit',amount:'',sales:'',ready:'',po:'',poDate:'',payment:'',einvoice:'',ebill:'',transporter:'',lr:'',clientEmail:'',weight:'',trackingStatus:'',exceptionReason:'',documents:[]});
const sections:{label:string;fields:[string,string,string?][]}[]=[
 {label:'Dispatch & invoice (optional for Email)',fields:[['sales','Sales Person'],['ready','Ready for Dispatch','date'],['invoice','Invoice No.'],['invoiceDate','Invoice Date','date'],['amount','Invoice Amount (₹)','number'],['credit','Credit / Non-Credit','credit'],['po','PO No.'],['poDate','PO Date','date'],['payment','Payment Terms']]},
 {label:'Documents & carrier',fields:[['einvoice','E-Invoice No.'],['ebill','E-Way Bill No.'],['weight','Weight'],['transporter','Transporter'],['lr','LR / Docket No.'],['clientEmail','Client Email'],['trackingStatus','Tracking Result'],['exceptionReason','Exception Reason']]}
];
export const documentKinds:[string,string][]= [['pickDoc','Pick Slip'],['invoiceDoc','Invoice'],['einvoiceDoc','E-Invoice'],['ebillDoc','E-Way Bill'],['lrDoc','LR / Docket'],['emailDoc','Outlook Email (.eml)'],['proofDoc','Delivery Proof']];
export default function UnifiedDialog({record,sourceFile,importIssue='',demo,onClose,onSave}:{record:any;sourceFile:File|null;importIssue?:string;demo:boolean;onClose:()=>void;onSave:(data:any,files:Record<string,File>)=>Promise<void|{saved:any;failed:string[];details:string}>}){
 const scrollRef=useRef<HTMLDivElement>(null);
 const [draft,setDraft]=useState<any>({...blankProcess(),...record});
 const [files,setFiles]=useState<Record<string,File>>({});
 const [sourcePending,setSourcePending]=useState(Boolean(sourceFile));
 const [expanded,setExpanded]=useState(Boolean(record?.id));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [scanBusy,setScanBusy]=useState(''),[scanInfo,setScanInfo]=useState('');
 const [mailSuggestions,setMailSuggestions]=useState<string[]>([]);
 async function scan(kind:string,file?:File,doc?:any){
  if(!file&&!doc)return;
  setScanBusy(kind);setScanInfo('');setError('');
  try{
   const parsed=doc?await cloud.inspectStored(draft.id,doc.id,kind):await cloud.inspectAttachment(file!,kind);
   const conflicts:string[]=[];
   const updates:any={...draft};
   for(const [key,value] of Object.entries(parsed.fields)){
    if(!value)continue;
    if(String(updates[key]||'').trim()&&String(updates[key]).trim()!==String(value)){
     conflicts.push(key+' differs from saved form; check PDF.');continue;
    }
    updates[key]=value;
   }
   setDraft(updates);
   setMailSuggestions(parsed.emails||[]);
   setExpanded(true);
   setScanInfo((parsed.notes||[]).join(' ')+(conflicts.length?' '+conflicts.join(' '):'')+' The original documents are not changed.');
  }catch(e:any){setScanInfo('Could not read '+(file?.name||doc?.name||'document')+': '+(e?.message||'Extraction unavailable')+'. Check original manually.')}
  finally{setScanBusy('')}
 }
 const choose=(kind:string,file?:File)=>{
  if(!file)return;
  setFiles(old=>({...old,[kind]:file}));
  if(['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc','emailDoc'].includes(kind))void scan(kind,file);
 };
 async function submit(moveToEmail=false){
  if(!draft.process?.trim()||!draft.party?.trim()||!draft.so?.trim()){
    const missing=[!draft.process?.trim()?'Process No.':'',!draft.party?.trim()?'Party Name':'',!draft.so?.trim()?'SO No.':''].filter(Boolean).join(', ');
    setError('Please complete '+missing+' above before saving.');
    scrollRef.current?.scrollTo({top:0,behavior:'smooth'});return;
  }
  setBusy(true);setError('');
  try{
    const payload=moveToEmail?{...draft,stage:'Email to Client',status:'Ready for Email'}:draft;
    const result=await onSave(payload,sourcePending&&sourceFile?{...files,pickDoc:sourceFile}:files);
    if(result&&result.failed.length){
      setDraft((old:any)=>({...old,id:result.saved.id,team_id:result.saved.team_id,stage:moveToEmail?'Email to Client':old.stage,status:moveToEmail?'Ready for Email':old.status,documents:result.saved.documents||old.documents}));
      setFiles(old=>Object.fromEntries(Object.entries(old).filter(([kind])=>result.failed.includes(kind))));
      setSourcePending(result.failed.includes('pickDoc'));
      setError('Process saved, but these documents still need uploading: '+result.details+'. Click Save again to retry only failed files.');
      scrollRef.current?.scrollTo({top:0,behavior:'smooth'});
    }
  }catch(e:any){setError(e?.message||'Save failed. Please try again.');scrollRef.current?.scrollTo({top:0,behavior:'smooth'})}
  finally{setBusy(false)}
 }
 return <div className='ux-overlay' onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className='ux-drawer' role='dialog' aria-modal='true' aria-label='Process editor'>
 <header className='ux-drawer-header'><div><div className='ux-kicker dark'>UNIVERSAL PROCESS</div><h2>{draft?.id?'Edit process '+draft.process:'Create new process'}</h2><p>One verified master record for the complete dispatch journey.</p></div><button className='ux-icon-button' aria-label='Close editor' onClick={onClose}><X size={20}/></button></header>
 <div className='ux-drawer-scroll' ref={scrollRef}>
 {sourceFile&&<div className='ux-doc-banner'><FileCheck2 size={20}/><div><strong>{sourceFile.name}</strong><small>{importIssue?'Reading needs attention — complete the missing fields below.':'Process No., Party Name and SO No. extracted. Please verify against the PDF.'}</small></div></div>}
 {importIssue&&<div className='ux-import-warning' role='alert'><AlertTriangle size={17}/><span>{importIssue}</span></div>}
 <section className='ux-drawer-section'><div className='ux-section-title'><b>01</b><strong>Process identity</strong></div><div className='ux-field-grid'>
 {([['process','Process No.'],['party','Party Name'],['so','SO No.']] as const).map(([key,label])=><label className='ux-field' key={key}>{label} <span className='ux-required'>*</span><input aria-invalid={Boolean(error&&!String(draft[key]??'').trim())} value={draft[key]??''} placeholder={key==='process'?'e.g. 292184':key==='so'?'e.g. 26270964':'Customer / party'} disabled={key==='process'&&Boolean(draft?.id)} onChange={e=>setDraft((old:any)=>({...old,[key]:e.target.value}))}/></label>)}</div></section>
 <button className='ux-expand-button' onClick={()=>setExpanded(!expanded)}><Settings2 size={17}/>{expanded?'Hide additional fields':'Add invoice, carrier and dispatch details'}<ChevronDown size={17}/></button>
 {expanded&&sections.map((section,i)=><section className='ux-drawer-section' key={section.label}><div className='ux-section-title'><b>0{i+2}</b><strong>{section.label}</strong></div><div className='ux-field-grid'>{section.fields.map(([key,label,kind])=><label className='ux-field' key={key}>{label}{kind==='credit'?<select value={draft.credit||'Credit'} onChange={e=>setDraft({...draft,credit:e.target.value})}><option>Credit</option><option>Non Credit</option></select>:<input type={kind||'text'} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</label>)}</div></section>)}
 <section className='ux-drawer-section'><div className='ux-section-title'><b><FileText size={15}/></b><strong>Private attachments</strong></div><div className='ux-upload-grid'>{documentKinds.map(([kind,label])=><label className='ux-upload' key={kind}><Upload size={17}/><strong>{label}</strong><small>{files[kind]?.name||(kind==='pickDoc'&&sourcePending&&sourceFile?.name)||draft.documents?.filter((d:any)=>d.kind===kind).map((d:any)=>d.name).join(', ')||'Choose file'}</small><input type='file' accept={kind==='emailDoc'?'.eml,message/rfc822':'.pdf,.png,.jpg,.jpeg'} onChange={e=>choose(kind,e.target.files?.[0])}/></label>)}</div>{Boolean(draft.id)&&<div className='ux-done-attachments'><b>Done Pick List photos</b>{(draft.documents||[]).filter((d:any)=>d.kind==='donePickDoc').length?(draft.documents||[]).filter((d:any)=>d.kind==='donePickDoc').map((d:any)=><button key={d.id} disabled={demo} onClick={()=>{void cloud.open(draft.id,d.id).catch((e:any)=>setError(e?.message||'Could not open photo.'))}}><FileCheck2 size={15}/><span>{d.name||'Done Pick List'}</span><ExternalLink size={14}/></button>):<small>Not yet uploaded. Use Data Store → Upload Done Pick List to OCR-match and attach a photo.</small>}</div>}<p className='ux-footnote'>Files up to 5 MB. Done Pick List images are attached only after Process No. matching in Data Store.</p></section>
 {demo&&<div className='ux-preview-warning'>No-login local mode: only process fields are saved on this browser. Original PDFs and other document files are not stored.</div>}
 {error&&<div className='ux-auth-error' role='alert'>{error}</div>}
 </div><footer className='ux-drawer-footer'><button className='ux-secondary' onClick={onClose}>Cancel</button><button className='ux-primary' disabled={busy} onClick={()=>void submit()}><Check size={17}/>{busy?'Saving…':demo?'Save locally':'Save process & documents'}</button></footer>
 </section></div>
}
