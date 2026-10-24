import {useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,Download,FileSpreadsheet,FileUp,ShieldCheck,X} from 'lucide-react';
import {cloud} from './cloud';
import {ops} from './unifiedOps';
import {filterStage,normalizedStage} from './workflowStages';
import {
 EMAIL_EXCEL_FIELDS,EMAIL_EXCEL_LIMIT,emailExcelChanges,
 mergeEmailExcelFields,previewEmailExcelImport,
 type EmailExcelPreview,type EmailExcelReady
} from './emailExcelImport.ts';

type Props={records:any[];authenticated:boolean;busy:boolean;userId:string;onImported:()=>Promise<void>};
const TEXT_COLUMNS=new Set([1,3,4,5,9]);
const cleanExcel=(value:unknown)=>{
 const s=String(value??'');
 return /^[=+\-@\t\r\n]/.test(s)?"'"+s:s;
};
const fullDate=(date:Date)=>date.toISOString().slice(0,10);

async function saveWorkbook(records:any[]|null){
 const ExcelJS=(await import('exceljs')).default;
 const wb=new ExcelJS.Workbook();
 wb.creator='PJS Operations';
 const sheet=wb.addWorksheet('Email to Client');
 sheet.columns=EMAIL_EXCEL_FIELDS.map(([field,label],i)=>({
  header:label,key:field,width:i===1?35:i===11?28:i===12?27:field==='lr'?25:field==='transporter'?23:field==='credit'?22:19
 }));
 sheet.getRow(1).height=30;
 sheet.getRow(1).eachCell(c=>{
  c.font={bold:true,color:{argb:'FFFFFFFF'},size:10};
  c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF264D83'}};
  c.alignment={vertical:'middle',wrapText:true};
 });
 for(const n of TEXT_COLUMNS)sheet.getColumn(n).numFmt='@';
 sheet.views=[{state:'frozen',ySplit:1}];
 const rows=records||[];
 if(records)for(const r of rows){
  const values:any={};
  for(const [field] of EMAIL_EXCEL_FIELDS)values[field]=cleanExcel(r?.[field]);
  sheet.addRow(values);
 }
 // The template deliberately has no example rows that could be imported accidentally.
 sheet.autoFilter='A1:N1';
 if(sheet.rowCount>1)for(let r=2;r<=sheet.rowCount;r++){
  sheet.getRow(r).height=21;
  if(r%2===0)sheet.getRow(r).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F8FE'}};
  sheet.getRow(r).eachCell(cell=>{cell.alignment={vertical:'middle'};});
 }
 const help=wb.addWorksheet('Instructions');
 help.getColumn(1).width=34;help.getColumn(2).width=100;
 [
  ['Email to Client Excel','Fill the Email to Client tab, then import it through PJS OMS.'],
  ['Required header','Process No. Columns can be rearranged. All other fields are optional and can be added later.'],
  ['New processes','Only a valid Process No. is required. Party Name, SO, Sales Person, Credit / Non-Credit, invoice and tracking fields can be added later; status is Pending Details.'],
  ['Existing processes','Only those already in Email to Client can be updated. Uploaded nonblank values replace matching email fields after explicit review.'],
  ['Protected process fields','Process No. cannot change; Party Name and SO No. conflicts are rejected.'],
  ['Other stages','An existing process in DataDoc, Dispatch Tracking or any other stage is never moved or edited by Excel import.'],
  ['Private attachments','Existing documents and process workflow statuses remain unchanged. No email is drafted or sent.'],
  ['Dates','Use YYYY-MM-DD or DD/MM/YYYY for PO Date, Invoice Date and Courier Date.'],
  ['Tracking / LR No.','Tracking ID from the 4-column tracking template also maps to this field. Set identifiers to Text to preserve leading zeros.'],
  ['Maximum rows',String(EMAIL_EXCEL_LIMIT)],
  ['Security','Preview and confirm changes; other owners and shared-team records cannot be edited by this personal bulk import.'],
  ['Unchanged values','Blank Excel fields never clear existing information.']
 ].forEach(v=>help.addRow(v));
 help.getColumn(1).font={bold:true};
 const buffer=await wb.xlsx.writeBuffer();
 return buffer;
}
function downloadBuffer(buffer:any,name:string){
 const file=new Blob([buffer as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(file);
 const a=document.createElement('a');a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function snapshotFields(record:any){
 return Object.fromEntries(EMAIL_EXCEL_FIELDS.map(([field])=>[field,String(record?.[field]??'').trim()]));
}
export default function EmailExcelTools({records,authenticated,busy,userId,onImported}:Props){
 const ref=useRef<HTMLInputElement>(null);
 const [preview,setPreview]=useState<EmailExcelPreview|null>(null);
 const [previous,setPrevious]=useState<Record<string,{id:string;fields:Record<string,string>}>>({});
 const [name,setName]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [working,setWorking]=useState(false);
 const [progress,setProgress]=useState('');
 const [error,setError]=useState('');
 const stageRecords=filterStage(records,'Email to Client');
 const ready=(preview?.created.length||0)+(preview?.updated.length||0);
 async function exportExcel(template=false){
  setError('');
  setWorking(true);
  try{
   const buffer=await saveWorkbook(template?null:stageRecords);
   downloadBuffer(buffer,template?'PJS_Email_to_Client_Template.xlsx':'PJS_Email_to_Client_'+new Date().toISOString().slice(0,10)+'.xlsx');
  }catch(e:any){setError('Excel download failed: '+String(e?.message||'Please retry'))}
  finally{setWorking(false)}
 }
 async function inspect(file?:File){
  if(!file)return;
  setPreview(null);setPrevious({});setConfirmed(false);setError('');setProgress('');setName(file.name);
  if(!/\.xlsx$/i.test(file.name)){setError('Select an .xlsx workbook; download the Excel template if needed.');return}
  if(file.size<1||file.size>3*1024*1024){setError('Workbook must be 3 MB or smaller.');return}
  setWorking(true);
  try{
   const ExcelJS=(await import('exceljs')).default;
   const wb=new ExcelJS.Workbook();
   await wb.xlsx.load(new Uint8Array(await file.arrayBuffer()) as any);
   const sheet=wb.getWorksheet('Email to Client')||wb.worksheets[0];
   if(!sheet)throw Error('Workbook has no worksheet.');
   if(sheet.rowCount>EMAIL_EXCEL_LIMIT+16)throw Error('Too many rows; import at most '+EMAIL_EXCEL_LIMIT+' records at once.');
   const matrix:string[][]=[];
   for(let r=1;r<=sheet.rowCount;r++){
    const row:string[]=[];
    for(let c=1;c<=Math.min(24,Math.max(EMAIL_EXCEL_FIELDS.length,sheet.columnCount));c++){
     const cell=sheet.getRow(r).getCell(c);
     const value=cell.value as any;
     if(value&&typeof value==='object'&&('formula' in value||'sharedFormula' in value))
      throw Error('Formula detected at row '+r+', column '+c+'. Convert formulas to plain values before importing.');
     if(typeof value==='number'&&!Number.isSafeInteger(value)&&TEXT_COLUMNS.has(c))
      throw Error('Unsafe numeric identifier at row '+r+', column '+c+'. Format identifier cells as Text.');
     if(value instanceof Date)row.push(fullDate(value));
     else if(value===null||value===undefined)row.push('');
     else if(typeof value==='object'&&('text' in value)&&typeof value.text==='string')row.push(value.text.trim());
     else if(typeof value==='object')row.push('');
     else row.push(String(value).trim());
    }
    matrix.push(row);
   }
   const review=previewEmailExcelImport(matrix,records,userId);
   const snapshots:Record<string,{id:string;fields:Record<string,string>}>={};
   for(const item of review.updated){
    const existing=records.find(r=>String(r.process)===item.process);
    if(existing)snapshots[item.process]={id:existing.id,fields:snapshotFields(existing)};
   }
   setPrevious(snapshots);setPreview(review);
  }catch(e:any){setError('Import preview failed: '+String(e?.message||'Invalid workbook'))}
  finally{setWorking(false)}
 }
 async function writeRow(row:EmailExcelReady){
  const latest=await cloud.findByProcess(row.process);
  if(row.action==='create'){
   if(latest)throw Error('Process already exists. Re-export and review; not overwritten.');
   return await cloud.save({
    ...row.data,process:row.process,party:row.data.party||'',so:row.data.so||'',
    stage:'Email to Client',status:'Pending Details',team_id:null,
    emailExcelImportedAt:new Date().toISOString(),emailExcelSource:name
   });
  }
  const snapshot=previous[row.process];
  if(!latest||!snapshot||latest.id!==snapshot.id)
   throw Error('Process has changed or is missing; re-import after refreshing.');
  if(latest.owner_id!==userId||latest.team_id||normalizedStage(latest)!=='Email to Client')
   throw Error('Owner, workspace or stage changed; record was not modified.');
  // Guard against concurrent edits between upload preview and saving.
  for(const [field] of EMAIL_EXCEL_FIELDS){
   if(snapshot.fields[field]!==String(latest[field]??'').trim())
    throw Error('Process fields changed after preview; refresh and review again.');
  }
  if(row.data.party&&latest.party&&row.data.party.toLowerCase()!==String(latest.party).trim().toLowerCase())
   throw Error('Saved Party Name does not match spreadsheet.');
  if(row.data.so&&latest.so&&row.data.so!==String(latest.so).trim())
   throw Error('Saved SO No. does not match spreadsheet.');
  if(!emailExcelChanges(latest,row.data).length)throw Error('Nothing to update after refresh.');
  const merged=mergeEmailExcelFields(latest,row.data);
  return await cloud.save({...merged,emailExcelImportedAt:new Date().toISOString(),emailExcelSource:name});
 }
 async function commit(){
  if(!preview||!confirmed||!ready||working||busy||!authenticated)return;
  setWorking(true);setError('');setProgress('Saving reviewed email-stage processes…');
  let created=0,updated=0,auditWarnings=0;
  const failures:string[]=[];
  for(const row of [...preview.created,...preview.updated]){
   try{
    const saved=await writeRow(row);
    if(row.action==='create')created++;else updated++;
    try{
     await ops.audit(saved,'Email to Client Excel '+(row.action==='create'?'created':'updated'),{
      source:name,fieldsChanged:row.fieldsChanged,sourceRow:row.line,automationUsed:false,emailSent:false
     });
    }catch{auditWarnings++}
   }catch(e:any){failures.push('Row '+row.line+' · '+row.process+': '+String(e?.message||'Save failed').slice(0,130))}
   setProgress('Saved '+(created+updated)+' of '+ready+' reviewed changes…');
  }
  try{await onImported()}catch(e:any){failures.push('Refresh error: '+String(e?.message||'Please refresh'))}
  setPreview(null);setPrevious({});setConfirmed(false);setWorking(false);
  setProgress('Import complete: '+created+' created (Pending Details), '+updated+' updated, '+(preview.unchanged+preview.rejected.length)+' skipped. Add missing details before sending Outlook email. No emails were sent.');
  if(auditWarnings||failures.length){
   setError([...(auditWarnings?[auditWarnings+' audit log write(s) need review.']:[]),...failures.slice(0,8)].join(' '));
  }
 }
 return <section className='ux-email-excel' aria-label='Email to Client Excel import and export'>
  <div className='ux-email-excel-toolbar'>
   <div className='ux-email-excel-heading'><FileSpreadsheet size={19}/><div><strong>Excel process register</strong><small>Export email-stage records, or import reviewed changes. No email automation.</small></div></div>
   <div className='ux-email-excel-actions'>
    <button type='button' onClick={()=>void exportExcel(true)} disabled={working}><Download size={15}/> Template</button>
    <button type='button' onClick={()=>void exportExcel()} disabled={working}><Download size={15}/> Export Excel</button>
    <button type='button' className='primary' onClick={()=>ref.current?.click()} disabled={working||busy||!authenticated}><FileUp size={15}/> Import Excel</button>
    <input ref={ref} hidden type='file' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     onChange={e=>{void inspect(e.target.files?.[0]);e.target.value=''}}/>
   </div>
  </div>
  {progress&&<p className='ux-email-excel-progress' role='status'><CheckCircle2 size={15}/>{progress}</p>}
  {error&&<p className='ux-email-excel-error' role='alert'><AlertTriangle size={15}/>{error}<button type='button' aria-label='Dismiss Excel error' onClick={()=>setError('')}><X size={14}/></button></p>}
  {preview&&<div className='ux-email-excel-review'>
   <div className='ux-email-excel-review-title'><strong>Review Excel import · {name}</strong><button type='button' disabled={working} onClick={()=>{setPreview(null);setPrevious({});setConfirmed(false)}} aria-label='Close preview'><X size={16}/></button></div>
   <div className='ux-email-excel-stats'>
    <span><CheckCircle2 size={14}/> New: {preview.created.length}</span>
    <span><CheckCircle2 size={14}/> Update: {preview.updated.length}</span>
    <span><AlertTriangle size={14}/> Skipped: {preview.rejected.length+preview.unchanged}</span>
   </div>
   {preview.created.length>0&&<p className='ux-email-excel-progress'><CheckCircle2 size={15}/> New processes need only a valid Process No. Missing Party Name, SO No., invoice and other details can be entered later. New records stay Pending Details until reviewed.</p>}
   {!!ready&&<div className='ux-email-excel-table-wrap'><table><thead><tr><th>Process No.</th><th>Action</th><th>Party</th><th>Fields to change</th></tr></thead><tbody>
    {[...preview.created,...preview.updated].slice(0,12).map(row=><tr key={row.line}><td>{row.process}</td><td>{row.action==='create'?'Create':'Update'}</td><td>{row.data.party||(row.action==='create'?'Add later':'Keep saved party')}</td><td>{row.fieldsChanged.map(f=>EMAIL_EXCEL_FIELDS.find(([key])=>key===f)?.[1]||f).join(', ')}</td></tr>)}
   </tbody></table>{ready>12&&<small>First 12 of {ready} eligible changes shown.</small>}</div>}
   {preview.rejected.length>0&&<div className='ux-email-excel-rejected'>{preview.rejected.slice(0,9).map(r=><p key={r.line}>Row {r.line} · {r.process||'—'}: {r.reason}</p>)}</div>}
   {preview.unchanged>0&&<small>{preview.unchanged} row(s) match saved process details and need no changes.</small>}
   {!!ready&&<label className='ux-email-excel-confirm'><input type='checkbox' checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    I checked these process details and authorize {preview.created.length} new record(s) and {preview.updated.length} field update(s). Existing populated email fields listed above may be replaced. New processes are saved as Pending Details for manual completion. Existing attachments, status and other stages stay unchanged.</label>}
   <div className='ux-email-excel-review-actions'>
    <button type='button' disabled={!confirmed||!ready||working||busy||!authenticated} onClick={()=>void commit()}><ShieldCheck size={15}/> {working?'Importing…':'Confirm & Import ('+ready+')'}</button>
   </div>
  </div>}
 </section>;
}
