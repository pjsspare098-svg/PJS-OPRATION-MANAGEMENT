import {useEffect,useRef,useState} from 'react';
import {X,Upload,FileText,Check,ChevronDown,FileCheck2,Settings2,ExternalLink,AlertTriangle,Trash2} from 'lucide-react';
import {cloud} from './cloud';
import {displayField} from './documentFields';
import {salesPeople,productNames} from './processOptions';
import {transferDestinations,stageDisplayNames,processTransferIssues} from './processTransfer.ts';
import {normalizedStage,type WorkflowStage} from './workflowStages.ts';
import {mergeDocumentScans,safeUpdates,type Candidate,type ScannedDocument} from './documentMerge';
export const blankProcess=()=>({process:'',party:'',so:'',productName:'',stage:'Universal Process',status:'Review',invoice:'',invoiceDate:'',credit:'Credit',amount:'',sales:'',ready:'',po:'',poDate:'',payment:'',einvoice:'',ebill:'',transporter:'',lr:'',courierDate:'',weight:'',trackingStatus:'',exceptionReason:'',documents:[]});
const sections:{label:string;fields:[string,string,string?][]}[]=[
 {label:'Dispatch & invoice (complete before Email)',fields:[['sales','Sales Person'],['ready','Ready for Dispatch','date'],['invoice','Invoice No.'],['invoiceDate','Invoice Date','date'],['amount','Invoice Amount (₹)','number'],['credit','Credit / Non-Credit','credit'],['po','PO No.'],['poDate','PO Date','date'],['payment','Payment Terms']]},
 {label:'Documents & carrier',fields:[['einvoice','E-Invoice No.'],['ebill','E-Way Bill No.'],['weight','Box Weight (Kgs)'],['transporter','Courier / Transporter'],['lr','Doc No. / LR / Docket No.'],['courierDate','Courier Date','date'],['trackingStatus','Tracking Result'],['exceptionReason','Exception Reason']]}
];
export const documentKinds:[string,string][]= [['pickDoc','Pick Slip'],['invoiceDoc','Invoice'],['einvoiceDoc','E-Invoice'],['ebillDoc','E-Way Bill'],['lrDoc','LR / Docket'],['emailDoc','Outlook Email (.eml)'],['proofDoc','Delivery Proof'],['trackingShotDoc','Tracking Search Screenshots']];
export default function UnifiedDialog({record,sourceFile,importIssue='',demo,userId,jobs=[],exceptions=[],onDelete,onAttachmentChanged,onClose,onSave}:{record:any;sourceFile:File|null;importIssue?:string;demo:boolean;userId:string;jobs?:any[];exceptions?:any[];onDelete:(r:any)=>Promise<void>;onAttachmentChanged?:()=>Promise<void>|void;onClose:()=>void;onSave:(data:any,files:Record<string,File>,transferTo?:WorkflowStage)=>Promise<void|{saved:any;failed:string[];details:string;transferFailed?:string}>}){
 const scrollRef=useRef<HTMLDivElement>(null);
 const [draft,setDraft]=useState<any>({...blankProcess(),...record});
 const [files,setFiles]=useState<Record<string,File>>({});
 const [attachmentBusy,setAttachmentBusy]=useState('');
 const [attachmentNotice,setAttachmentNotice]=useState('');
 const [showDeletedAttachments,setShowDeletedAttachments]=useState(false);
 const [deletedAttachments,setDeletedAttachments]=useState<{id:string;kind:string;name:string;deleted_at:string}[]>([]);
 const [transferTo,setTransferTo]=useState<WorkflowStage|''>('');
 const [sourcePending,setSourcePending]=useState(Boolean(sourceFile));
 const [deleteOpen,setDeleteOpen]=useState(false);
 const [deleteInput,setDeleteInput]=useState('');
 useEffect(()=>{if(deleteOpen)scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'})},[deleteOpen]);
 const [expanded,setExpanded]=useState(Boolean(record?.id));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [scanBusy,setScanBusy]=useState(''),[scanInfo,setScanInfo]=useState('');
 const [scanProgress,setScanProgress]=useState('');
 const [scanCandidates,setScanCandidates]=useState<Candidate[]>([]);
 const [scanFailures,setScanFailures]=useState<string[]>([]);
 const extractable=['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'];
 function presentScans(scans:ScannedDocument[],failures:string[]){
  const review=mergeDocumentScans(scans);
  const {changes,skipped}=safeUpdates(draft,review);
  setDraft((current:any)=>({...current,...safeUpdates(current,review).changes}));
  setScanCandidates(review.candidates);
  setScanFailures(failures);
  setExpanded(true);
  const count=Object.keys(changes).length;
  const warnings=[...review.conflicts,...skipped,...failures];
  const head=review.candidates.length?review.candidates.length+' suggested field values read; '+count+' empty field(s) filled.':'No labelled values found in the selected documents.';
  setScanInfo(head+(warnings.length?' '+warnings.length+' item(s) need review below.':'')+' Review document fields, then click Save process & documents. Outlook messages are never scanned for email addresses.');
 }
 async function scan(kind:string,file?:File,doc?:any){
  if(!file&&!doc)return;
  setScanBusy(kind);setScanInfo('');setScanFailures([]);setScanCandidates([]);setError('');
  try{
   const parsed=doc?await cloud.inspectStored(draft.id,doc.id,kind):await cloud.inspectAttachment(file!,kind);
   presentScans([{name:file?.name||doc?.name||'Document',kind,fields:parsed.fields,emails:parsed.emails}],[]);
  }catch(e:any){
   setScanInfo('Could not extract '+(file?.name||doc?.name||'document')+'.');
   setScanFailures([String(e?.message||'PDF extraction failed.')]);
  }finally{setScanBusy('')}
 }
 async function scanAll(){
  const selections:{kind:string;name:string;file?:File;doc?:any}[]=[];
  for(const kind of extractable){
   for(const document of (draft.documents||[]).filter((d:any)=>d.kind===kind)){
    selections.push({kind,name:document.name||kind,doc:document});
   }
   if(files[kind])selections.push({kind,name:files[kind].name,file:files[kind]});
  }
  if(!selections.length){setScanInfo('No Invoice, E-Invoice, E-Way Bill or LR/Docket documents available to extract.');return}
  setScanBusy('all');setScanInfo('');setScanFailures([]);setScanCandidates([]);setError('');
  const scans:ScannedDocument[]=[],failures:string[]=[];
  try{
   for(let i=0;i<selections.length;i++){
    const item=selections[i];
    setScanProgress('Reading document '+(i+1)+' of '+selections.length+': '+item.name);
    try{
     const parsed=item.file?await cloud.inspectAttachment(item.file,item.kind):await cloud.inspectStored(draft.id,item.doc.id,item.kind);
     scans.push({kind:item.kind,name:item.name,fields:parsed.fields,emails:parsed.emails});
    }catch(e:any){failures.push(item.name+': '+(e?.message||'Could not read document'))}
   }
   presentScans(scans,failures);
  }finally{setScanProgress('');setScanBusy('')}
 }
 const previewSelected=(file:File)=>{
  const url=URL.createObjectURL(file);
  const tab=window.open(url,'_blank','noopener,noreferrer');
  if(!tab)setError('Your browser blocked the file preview. Allow pop-ups for OMS.');
  window.setTimeout(()=>URL.revokeObjectURL(url),45000);
 };
 const choose=(kind:string,file?:File)=>{
  if(!file)return;
  setFiles(old=>({...old,[kind]:file}));
  if(['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(kind))void scan(kind,file);
 };
 async function submit(destination?:WorkflowStage){
  if(destination){
   const issues=processTransferIssues(draft,destination,jobs,exceptions);
   if(issues.length){setError(issues.join('. '));return}
   if(!window.confirm('Save and transfer Process '+draft.process+' from '+normalizedStage(draft)+' to '+destination+'? This only moves the record: it will NOT submit to DataDoc, send email or start carrier tracking.'))return;
  }
  // Imported Email to Client records start as Pending Details. Existing
  // entries must remain editable even if the Sales Register does not contain SO.
  // Transfers still require complete identity fields.
  const pendingEmailEdit=Boolean(draft.id&&!destination&&normalizedStage(draft)==='Email to Client'&&draft.status==='Pending Details');
  if(!draft.process?.trim()||(!pendingEmailEdit&&(!draft.party?.trim()||!draft.so?.trim()))){
    const missing=[!draft.process?.trim()?'Process No.':!pendingEmailEdit&&!draft.party?.trim()?'Party Name':'',!pendingEmailEdit&&!draft.so?.trim()?'SO No.':''].filter(Boolean).join(', ');
    setError('Please complete '+missing+' above before saving.');
    scrollRef.current?.scrollTo({top:0,behavior:'smooth'});return;
  }
  setBusy(true);setError('');
  try{
    const result=await onSave(draft,sourcePending&&sourceFile?{...files,pickDoc:sourceFile}:files,destination);
    if(result?.transferFailed){
      // The process and attachments are saved, but routing was rejected;
      // leave the editor open and never upload those files a second time.
      setFiles({});setSourcePending(false);
      setDraft((old:any)=>({...old,id:result.saved.id,team_id:result.saved.team_id,stage:result.saved.stage||old.stage,status:result.saved.status||old.status}));
      setError('Process data and attachments saved, but transfer was not completed: '+result.transferFailed+'. Reopen the process after checking the issue.');
      return;
    }
    if(result&&result.failed.length){
      setDraft((old:any)=>({...old,id:result.saved.id,team_id:result.saved.team_id,stage:old.stage,status:old.status,documents:result.saved.documents||old.documents}));
      setFiles(old=>Object.fromEntries(Object.entries(old).filter(([kind])=>result.failed.includes(kind))));
      setSourcePending(result.failed.includes('pickDoc'));
      setError('Process saved, but these documents still need uploading: '+result.details+'. Click Save again to retry only failed files.');
      scrollRef.current?.scrollTo({top:0,behavior:'smooth'});
    }
  }catch(e:any){setError(e?.message||'Save failed. Please try again.');scrollRef.current?.scrollTo({top:0,behavior:'smooth'})}
  finally{setBusy(false)}
 }
 async function toggleDeletedAttachments(){
  if(showDeletedAttachments){setShowDeletedAttachments(false);return}
  if(!draft.id||demo)return;
  setAttachmentBusy('loading');setError('');
  try{
   const docs=await cloud.listTrashedDocuments(draft.id);
   setDeletedAttachments(docs);
   setShowDeletedAttachments(true);
  }catch(e:any){setError('Could not read Deleted attachments: '+String(e?.message||'Unknown error'))}
  finally{setAttachmentBusy('')}
 }
 async function changeAttachment(d:{id:string;kind:string;name:string},restore:boolean){
  if(!draft.id||demo||attachmentBusy||busy||scanBusy)return;
  const name=String(d.name||d.kind||'attachment');
  if(!restore&&!window.confirm('Move "'+name+'" from Process '+draft.process+' to Deleted attachments?\n\nOnly this file is affected. Its original bytes and audit history are preserved and it can be restored. Files used by active jobs or recorded evidence cannot be removed.'))return;
  setAttachmentBusy(d.id);setError('');setAttachmentNotice('');
  let applied=false;
  try{
   await cloud.setDocumentTrash(draft.id,d.id,restore);
   applied=true;
   setScanInfo('');setScanCandidates([]);setScanFailures([]);
   // Keep any unsaved field edits in the editor; refresh attachments only.
   const fresh=await cloud.findByProcess(String(draft.process||''));
   if(fresh&&fresh.id===draft.id)setDraft((old:any)=>({...old,documents:fresh.documents||[]}));
   else if(!restore)setDraft((old:any)=>({...old,documents:(old.documents||[]).filter((x:any)=>x.id!==d.id)}));
   if(showDeletedAttachments||restore){
    try{setDeletedAttachments(await cloud.listTrashedDocuments(draft.id))}
    catch{setAttachmentNotice('Attachment updated. Refresh the Deleted attachments list if needed.')}
   }
   setAttachmentNotice((restore?'Restored ':'Moved to Deleted attachments: ')+name+
     '. Process '+draft.process+' and the other files are unchanged.');
   try{await onAttachmentChanged?.()}
   catch{setAttachmentNotice('Attachment changed successfully, but page refresh failed. Close and reopen this process; do not repeat the action.')}
  }catch(e:any){
   setError((applied?'Attachment changed, but refresh failed: ':'Could not change attachment: ')+
     String(e?.message||'Unknown error')+(applied?' Do not retry without refreshing.':''));
  }finally{setAttachmentBusy('')}
 }
 async function deleteProcess(){
  if(deleteInput!==String(draft.process||''))return;
  setBusy(true);setError('');
  try{await onDelete(draft)}
  catch(e:any){setError(e?.message||'Unable to delete process.');scrollRef.current?.scrollTo({top:0,behavior:'smooth'})}
  finally{setBusy(false)}
 }
 const canDelete=Boolean(!demo&&draft.id&&draft.owner_id===userId&&!draft.team_id);
 const currentStage=normalizedStage(draft);
 const transferIssues=transferTo?processTransferIssues(draft,transferTo,jobs,exceptions):[];
 const transferAllowed=Boolean(transferTo&&!transferIssues.length);
 const deletionBlockers=(jobs||[]).filter((job:any)=>job.process_id===draft.id&&['queued','running'].includes(job.status));
 const deleteReason=demo?'Sign in to delete cloud processes.':draft.team_id?'Shared team processes cannot be deleted here; ask a team administrator.':draft.id&&draft.owner_id!==userId?'Only the process owner can delete this record.':'';

 return <div className='ux-overlay' onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className='ux-drawer' role='dialog' aria-modal='true' aria-label='Process editor'>
 <header className='ux-drawer-header'><div><div className='ux-kicker dark'>UNIVERSAL PROCESS</div><h2>{draft?.id?'Edit process '+draft.process:'Create new process'}</h2><p>One verified master record for the complete dispatch journey.</p></div><button className='ux-icon-button' aria-label='Close editor' onClick={onClose}><X size={20}/></button></header>
 <div className='ux-drawer-scroll' ref={scrollRef}>
 {sourceFile&&<div className='ux-doc-banner'><FileCheck2 size={20}/><div><strong>{sourceFile.name}</strong><small>{importIssue?'Reading needs attention — complete the missing fields below.':'Process No., Party Name and SO No. extracted. Please verify against the PDF.'}</small></div></div>}
 {Boolean(draft.id&&draft.status==='Pending Details'&&normalizedStage(draft)==='Email to Client')&&<div className='ux-preview-warning'>Pending Details: You may save invoice, courier, and attachments without an SO No. Missing Party Name and SO No. must still be completed before transfer or manually confirming Outlook dispatch.</div>}
 {importIssue&&<div className='ux-import-warning' role='alert'><AlertTriangle size={17}/><span>{importIssue}</span></div>}
 <section className='ux-drawer-section'><div className='ux-section-title'><b>01</b><strong>Process identity</strong></div><div className='ux-field-grid'>
 {([['process','Process No.'],['party','Party Name'],['so','SO No.']] as const).map(([key,label])=><label className='ux-field' key={key}>{label} <span className='ux-required'>*</span><input aria-invalid={Boolean(error&&!String(draft[key]??'').trim())} value={draft[key]??''} placeholder={key==='process'?'e.g. 292184':key==='so'?'e.g. 26270964':'Customer / party'} disabled={key==='process'&&Boolean(draft?.id)} onChange={e=>setDraft((old:any)=>({...old,[key]:e.target.value}))}/></label>)}
 <label className='ux-field'>Product Name
  <select value={draft.productName||''} onChange={e=>setDraft((old:any)=>({...old,productName:e.target.value}))}>
   <option value=''>Select Product Name</option>
   {draft.productName&&!productNames.includes(draft.productName)&&<option value={draft.productName}>{draft.productName} (existing value)</option>}
   {productNames.map(name=><option key={name} value={name}>{name}</option>)}
  </select>
 </label></div></section>
 <button className='ux-expand-button' onClick={()=>setExpanded(!expanded)}><Settings2 size={17}/>{expanded?'Hide additional fields':'Add invoice, carrier and dispatch details'}<ChevronDown size={17}/></button>
 {expanded&&sections.map((section,i)=><section className='ux-drawer-section' key={section.label}><div className='ux-section-title'><b>0{i+2}</b><strong>{section.label}</strong></div><div className='ux-field-grid'>{section.fields.map(([key,label,kind])=><label className='ux-field' key={key}>{label}{kind==='credit'?<select value={draft.credit||'Credit'} onChange={e=>setDraft({...draft,credit:e.target.value})}><option>Credit</option><option>Non Credit</option></select>:key==='sales'?<select value={draft.sales||''} onChange={e=>setDraft((old:any)=>({...old,sales:e.target.value}))}>
 <option value=''>Select Sales Person</option>
 {draft.sales&&!salesPeople.includes(draft.sales)&&<option value={draft.sales}>{draft.sales} (existing value)</option>}
 {salesPeople.map(name=><option key={name} value={name}>{name}</option>)}
 </select>:<input type={kind||'text'} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</label>)}</div></section>)}
 <section className='ux-drawer-section'>
  <div className='ux-section-title'><b><FileText size={15}/></b><strong>Private attachments — open, download or extract details</strong></div>
  <div className='ux-extraction-controls'>
   <button type='button' className='ux-extract-all' disabled={demo||busy||Boolean(scanBusy)||!draft.id} onClick={()=>void scanAll()}>
    <FileText size={17}/>{scanBusy==='all'?'Reading saved documents…':'Extract All Documents'}
   </button>
   <small>Extracts labelled invoice, E-Invoice, E-Way Bill and LR/Docket fields only. Outlook .eml conversations stay attached for Reply All; their addresses are never extracted.</small>
  </div>
  {scanProgress&&<p className='ux-extraction-progress' role='status'>{scanProgress}</p>}
  {scanInfo&&<div className='ux-import-warning' role='status'><FileText size={17}/><span>{scanInfo}</span></div>}
  {scanCandidates.length>0&&<div className='ux-field-review'>
   <div className='ux-field-review-title'><strong>Extracted document values</strong><button type='button' onClick={()=>{setExpanded(true);scrollRef.current?.scrollTo({top:0,behavior:'smooth'})}}>Review fields in form</button></div>
   {scanCandidates.map((item,i)=>{
    const current=String(draft[item.key]||'').trim();
    const applied=current===item.value;
    const conflict=item.kind==='conflict';
    return <div className='ux-extracted-row' key={item.key+'-'+item.value+'-'+i}>
     <span><strong>{item.label}</strong><small title={item.source}>{item.source}</small></span>
     <code>{item.value}</code>
     {applied?<span className='ux-extracted-ok'>In form</span>:<button type='button' className='ux-extracted-apply' disabled={Boolean(scanBusy)||busy} onClick={()=>{setDraft((p:any)=>({...p,[item.key]:item.value}));setExpanded(true)}}>{conflict?'Use this value':'Use value'}</button>}
    </div>;
   })}
   <small>Fields marked “Use value” require your confirmation before replacing an existing value. OCR/PDF extraction can be incorrect.</small>
  </div>}
  {scanFailures.length>0&&<div className='ux-extraction-failures' role='alert'><strong>Files requiring attention</strong>{scanFailures.map((x,i)=><p key={i}>{x}</p>)}</div>}
  <div className='ux-upload-grid'>{documentKinds.map(([kind,label])=>{
   const existing=(draft.documents||[]).filter((d:any)=>d.kind===kind);
   const canExtract=['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(kind);
   return <div className='ux-attachment-item' key={kind}>
    <label className='ux-upload'><Upload size={17}/><strong>{label}</strong>
     <small>{files[kind]?.name||(kind==='pickDoc'&&sourcePending&&sourceFile?.name)||(existing.length?existing.length+' saved':'Choose file')}</small>
     <input type='file' disabled={busy||Boolean(scanBusy)} accept={kind==='emailDoc'?'.eml,message/rfc822':'.pdf,.png,.jpg,.jpeg'} onChange={e=>{choose(kind,e.target.files?.[0]);e.target.value=''}}/>
    </label>
    {kind==='emailDoc'&&<small className='ux-recipient-count'>Reference copy only. Open Outlook and Reply All manually; PJS OMS does not create drafts or send emails.</small>}
    {files[kind]&&<div className='ux-attachment-pending'><button className='ux-preview-selected' type='button' onClick={()=>previewSelected(files[kind])}><ExternalLink size={14}/> Preview selected file (before save)</button><button type='button' className='ux-attachment-delete' disabled={busy||Boolean(scanBusy)||Boolean(attachmentBusy)} onClick={()=>setFiles(old=>{const next={...old};delete next[kind];return next})}><Trash2 size={14}/> Remove selected</button></div>}
    {scanBusy===kind&&<small className='ux-scanning'>Reading the document…</small>}
    {existing.map((d:any)=><div key={d.id} className='ux-saved-file'>
     <span title={d.name}>{d.name}</span>
     <div>
      <button type='button' disabled={demo} onClick={()=>void cloud.open(draft.id,d.id).catch((e:any)=>setError(e?.message||'Could not open file.'))}><ExternalLink size={13}/> Open</button>
      <button type='button' disabled={demo} onClick={()=>void cloud.download(draft.id,d.id).catch((e:any)=>setError(e?.message||'Could not download file.'))}>Download</button>
      {canExtract&&<button type='button' disabled={demo||Boolean(scanBusy)||Boolean(attachmentBusy)} onClick={()=>void scan(kind,undefined,d)}>Extract</button>}
      <button type='button' className='ux-attachment-delete' disabled={!canDelete||busy||Boolean(scanBusy)||Boolean(attachmentBusy)} title={canDelete?'Move this file to Deleted attachments':'Only the owner of a personal process can remove saved attachments'} onClick={()=>void changeAttachment(d,false)}><Trash2 size={13}/>{attachmentBusy===d.id?'Moving…':'Delete'}</button>
     </div>
    </div>)}
   </div>;
  })}</div>
  {Boolean(draft.id)&&<div className='ux-done-attachments'><b>Previously attached Done Pick List photos</b>{(draft.documents||[]).filter((d:any)=>d.kind==='donePickDoc').length?(draft.documents||[]).filter((d:any)=>d.kind==='donePickDoc').map((d:any)=><div className='ux-saved-file' key={d.id}>
    <span>{d.name||'Done Pick List'}</span><div>
     <button type='button' disabled={demo} onClick={()=>void cloud.open(draft.id,d.id).catch((e:any)=>setError(e?.message||'Could not open photo.'))}>Open</button>
     <button type='button' disabled={demo} onClick={()=>void cloud.download(draft.id,d.id).catch((e:any)=>setError(e?.message||'Could not download photo.'))}>Download</button>
     <button type='button' className='ux-attachment-delete' disabled={!canDelete||busy||Boolean(scanBusy)||Boolean(attachmentBusy)} title='Move this photo to Deleted attachments' onClick={()=>void changeAttachment(d,false)}><Trash2 size={13}/>{attachmentBusy===d.id?'Moving…':'Delete'}</button>
    </div>
   </div>):<small>Not yet uploaded. Open the Done Pick List page to add multiple photos under a Process No.</small>}</div>}
  {draft.id&&!demo&&<div className='ux-attachment-trash-panel'>
   <button type='button' className='ux-attachment-trash-toggle'
    disabled={busy||Boolean(attachmentBusy)||Boolean(scanBusy)}
    onClick={()=>void toggleDeletedAttachments()}>
    <Trash2 size={14}/>{showDeletedAttachments?'Hide Deleted attachments':'Deleted attachments · Restore files'}
   </button>
   {showDeletedAttachments&&<div className='ux-attachment-trash-list'>
    {deletedAttachments.length?deletedAttachments.map(d=><div key={d.id} className='ux-saved-file'>
     <span title={d.name}>{d.name}<small>{documentKinds.find(x=>x[0]===d.kind)?.[1]||d.kind} · Deleted {new Date(d.deleted_at).toLocaleDateString('en-IN')}</small></span>
     <div><button type='button' disabled={!canDelete||busy||Boolean(attachmentBusy)||Boolean(scanBusy)}
      onClick={()=>void changeAttachment(d,true)}>{attachmentBusy===d.id?'Restoring…':'Restore'}</button></div>
    </div>):<small>No deleted attachments for this process.</small>}
   </div>}
  </div>}
  {attachmentNotice&&<div className='ux-attachment-notice' role='status'>{attachmentNotice}</div>}
  <p className='ux-footnote'>Files up to 5 MB. Invoice, E-Invoice and E-Way Bill are optional for moving to Email. DataDoc work is performed manually during the current base redesign.</p>
 </section>
 {deleteOpen&&canDelete&&<div className='ux-master-delete' role='alertdialog' aria-label='Confirm Delete Process'>
  <div><Trash2 size={20}/><strong>Delete Process {draft.process}?</strong></div>
  <p>This moves your personal master process into Trash and preserves attached files and history. This action does not send an email or execute any automation. Historical jobs remain in Audit & Reports.</p>
  {deletionBlockers.length>0&&<div className='ux-delete-blockers' role='alert'>
    <strong>Cannot delete while a legacy job remains recorded as queued or running.</strong>
    {deletionBlockers.map((job:any)=><div key={job.id}>Process job: {job.job_type.replace(/_/g,' ')} — {job.status}</div>)}
    <small>Review historical jobs in Audit &amp; Reports. The office worker must be stopped separately; these records cannot be silently deleted.</small>
  </div>}
  <label className='ux-field'>Type Process No. {draft.process} to confirm
   <input value={deleteInput} onChange={e=>setDeleteInput(e.target.value.trim())} placeholder='Exact Process No.' autoComplete='off'/>
  </label>
  <div className='ux-master-delete-actions'>
   <button type='button' className='ux-secondary' onClick={()=>{setDeleteOpen(false);setDeleteInput('')}} disabled={busy}>Cancel</button>
   <button type='button' className='ux-master-delete-confirm' onClick={()=>void deleteProcess()} disabled={busy||deletionBlockers.length>0||deleteInput!==String(draft.process||'')}><Trash2 size={15}/>{busy?'Moving…':'Confirm Delete Process'}</button>
  </div>
 </div>}
 {demo&&<div className='ux-preview-warning'>No-login local mode: only process fields are saved on this browser. Original PDFs and other document files are not stored.</div>}
 {error&&<div className='ux-auth-error' role='alert'>{error}</div>}
 </div><footer className='ux-drawer-footer'>
 {Boolean(draft.id)&&!canDelete&&<span className='ux-deletion-unavailable'>{deleteReason||'Deletion unavailable for this record.'}</span>}
 {canDelete&&<button className='ux-master-delete-button' disabled={busy} onClick={()=>{setDeleteOpen(true);setDeleteInput('')}}><Trash2 size={15}/> Delete Process</button>}
 <div className='ux-transfer-footer'>
  <label htmlFor='process-transfer-destination'>Transfer Process
   <select id='process-transfer-destination' aria-label='Transfer Process to workflow page' value={transferTo} disabled={busy||Boolean(scanBusy)} onChange={e=>setTransferTo(e.target.value as WorkflowStage|'')}>
    <option value=''>Choose destination…</option>
    {transferDestinations.map(stage=><option key={stage} value={stage} disabled={stage===currentStage}>{stageDisplayNames[stage]}{stage===currentStage?' (current)':''}</option>)}
   </select>
  </label>
  <button type='button' className='ux-transfer-action' disabled={busy||Boolean(scanBusy)||!transferAllowed} onClick={()=>void submit(transferTo as WorkflowStage)}>Save &amp; Transfer</button>
  {transferTo&&transferIssues.length>0&&<small className='ux-transfer-warning' role='status'>{transferIssues.join('. ')}</small>}
 </div>
 <button className='ux-secondary' onClick={onClose} disabled={busy}>Cancel</button>
 <button className='ux-primary' disabled={busy||Boolean(scanBusy)} onClick={()=>void submit()}><Check size={17}/>{busy?'Saving…':demo?'Save locally':'Save process & documents'}</button>
 </footer>
 </section></div>
}
