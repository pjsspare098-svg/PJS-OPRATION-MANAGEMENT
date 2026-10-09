import {useState} from 'react';
import {X,Upload,FileText,Check,ChevronDown,FileCheck2,Settings2} from 'lucide-react';
export const blankProcess=()=>({process:'',party:'',so:'',stage:'Universal Process',status:'Review',invoice:'',invoiceDate:'',credit:'Credit',amount:'',sales:'',ready:'',po:'',poDate:'',payment:'',einvoice:'',ebill:'',transporter:'',lr:'',clientEmail:'',weight:'',trackingStatus:'',exceptionReason:'',documents:[]});
const sections:{label:string;fields:[string,string,string?][]}[]=[
 {label:'Dispatch & invoice',fields:[['sales','Sales Person'],['ready','Ready for Dispatch','date'],['invoice','Invoice No.'],['invoiceDate','Invoice Date','date'],['amount','Invoice Amount (₹)','number'],['credit','Credit / Non-Credit','credit'],['po','PO No.'],['poDate','PO Date','date'],['payment','Payment Terms']]},
 {label:'Documents & carrier',fields:[['einvoice','E-Invoice No.'],['ebill','E-Way Bill No.'],['weight','Weight'],['transporter','Transporter'],['lr','LR / Docket No.'],['clientEmail','Client Email'],['trackingStatus','Tracking Result'],['exceptionReason','Exception Reason']]}
];
export const documentKinds:[string,string][]= [['pickDoc','Pick Slip'],['invoiceDoc','Invoice'],['einvoiceDoc','E-Invoice'],['ebillDoc','E-Way Bill'],['lrDoc','LR / Docket'],['emailDoc','Outlook Email (.eml)'],['proofDoc','Delivery Proof']];
export default function UnifiedDialog({record,sourceFile,demo,onClose,onSave}:{record:any;sourceFile:File|null;demo:boolean;onClose:()=>void;onSave:(data:any,files:Record<string,File>)=>Promise<void>}){
 const [draft,setDraft]=useState<any>({...blankProcess(),...record});
 const [files,setFiles]=useState<Record<string,File>>({});
 const [expanded,setExpanded]=useState(Boolean(record?.id));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const choose=(kind:string,file?:File)=>{if(file)setFiles(x=>({...x,[kind]:file}))};
 async function submit(){if(!draft.process?.trim()||!draft.party?.trim()||!draft.so?.trim()){setError('Process No., Party Name and SO No. are required.');return}setBusy(true);setError('');try{await onSave(draft,sourceFile?{...files,pickDoc:sourceFile}:files)}catch(e:any){setError(e?.message||'Save failed. Please try again.')}finally{setBusy(false)}}
 return <div className='ux-overlay' onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className='ux-drawer' role='dialog' aria-modal='true' aria-label='Process editor'>
 <header className='ux-drawer-header'><div><div className='ux-kicker dark'>UNIVERSAL PROCESS</div><h2>{record?.id?'Edit process '+record.process:'Create new process'}</h2><p>One verified master record for the complete dispatch journey.</p></div><button className='ux-icon-button' aria-label='Close editor' onClick={onClose}><X size={20}/></button></header>
 <div className='ux-drawer-scroll'>
 {sourceFile&&<div className='ux-doc-banner'><FileCheck2 size={20}/><div><strong>{sourceFile.name}</strong><small>Uploaded Pick Slip · Review the three extracted fields.</small></div></div>}
 <section className='ux-drawer-section'><div className='ux-section-title'><b>01</b><strong>Process identity</strong></div><div className='ux-field-grid'>
 {([['process','Process No.'],['party','Party Name'],['so','SO No.']] as const).map(([key,label])=><label className='ux-field' key={key}>{label} <span className='ux-required'>*</span><input value={draft[key]??''} placeholder={key==='process'?'e.g. 292184':key==='so'?'e.g. 26270964':'Customer / party'} disabled={key==='process'&&Boolean(record?.id)} onChange={e=>setDraft((old:any)=>({...old,[key]:e.target.value}))}/></label>)}</div></section>
 <button className='ux-expand-button' onClick={()=>setExpanded(!expanded)}><Settings2 size={17}/>{expanded?'Hide additional fields':'Add invoice, carrier and dispatch details'}<ChevronDown size={17}/></button>
 {expanded&&sections.map((section,i)=><section className='ux-drawer-section' key={section.label}><div className='ux-section-title'><b>0{i+2}</b><strong>{section.label}</strong></div><div className='ux-field-grid'>{section.fields.map(([key,label,kind])=><label className='ux-field' key={key}>{label}{kind==='credit'?<select value={draft.credit||'Credit'} onChange={e=>setDraft({...draft,credit:e.target.value})}><option>Credit</option><option>Non Credit</option></select>:<input type={kind||'text'} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</label>)}</div></section>)}
 <section className='ux-drawer-section'><div className='ux-section-title'><b><FileText size={15}/></b><strong>Private attachments</strong></div><div className='ux-upload-grid'>{documentKinds.map(([kind,label])=><label className='ux-upload' key={kind}><Upload size={17}/><strong>{label}</strong><small>{files[kind]?.name||(kind==='pickDoc'&&sourceFile?.name)||draft.documents?.filter((d:any)=>d.kind===kind).map((d:any)=>d.name).join(', ')||'Choose file'}</small><input type='file' accept={kind==='emailDoc'?'.eml,message/rfc822':'.pdf,.png,.jpg,.jpeg'} onChange={e=>choose(kind,e.target.files?.[0])}/></label>)}</div><p className='ux-footnote'>Files up to 5 MB. Verify all extracted fields before saving.</p></section>
 {demo&&<div className='ux-preview-warning'>Design preview: data stays in this browser, and no attachment bytes are stored.</div>}
 {error&&<div className='ux-auth-error' role='alert'>{error}</div>}
 </div><footer className='ux-drawer-footer'><button className='ux-secondary' onClick={onClose}>Cancel</button><button className='ux-primary' disabled={busy} onClick={()=>void submit()}><Check size={17}/>{busy?'Saving…':'Save process & documents'}</button></footer>
 </section></div>
}
