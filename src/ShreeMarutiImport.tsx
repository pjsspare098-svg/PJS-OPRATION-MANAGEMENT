import {useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,Download,FileSpreadsheet,FileUp} from 'lucide-react';
import {cloud} from './cloud';
import {ops} from './unifiedOps';
import {
 TRACKING_EXCEL_HEADERS,TRACKING_EXCEL_LIMIT,previewShreeMarutiImport,
 type TrackingExcelPreview
} from './trackingExcelImport';

type Props={
 records:any[];authenticated:boolean;busy:boolean;teamId:string;
 onImported:()=>Promise<void>;
};
async function workbookTemplate(){
 const ExcelJS=(await import('exceljs')).default;
 const workbook=new ExcelJS.Workbook();
 workbook.creator='PJS OMS';
 const sheet=workbook.addWorksheet('Shree Maruti');
 sheet.addRow([...TRACKING_EXCEL_HEADERS]);
 sheet.columns=[{width:20},{width:26},{width:32},{width:29}];
 sheet.getColumn(1).numFmt='@';
 sheet.getColumn(4).numFmt='@';
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.autoFilter='A1:D1';
 sheet.getRow(1).height=27;
 sheet.getRow(1).eachCell(cell=>{
  cell.font={bold:true,color:{argb:'FFFFFFFF'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF315EA4'}};
 });
 const instructions=workbook.addWorksheet('Instructions');
 instructions.getColumn(1).width=32;
 instructions.getColumn(2).width=77;
 instructions.addRow(['PJS OMS Shree Maruti import','Enter rows on the Shree Maruti tab, below the headers.']);
 instructions.addRow(['Required fields','Process No., Credit / Non-Credit, Sales Person Name, Tracking ID']);
 instructions.addRow(['Credit','Use Credit or Non Credit.']);
 instructions.addRow(['Tracking ID','Set this column to Text before pasting. Do not lose leading zeroes.']);
 instructions.addRow(['Example (do not import)','292184 | Non Credit | Sales Person | 001234567890']);
 instructions.addRow(['Duplicate Process No.','Existing processes are skipped; nothing is overwritten.']);
 instructions.addRow(['Import action','Creates Dispatch Tracking records only; does NOT queue tracking automatically.']);
 instructions.addRow(['Maximum rows',String(TRACKING_EXCEL_LIMIT)]);
 return workbook.xlsx.writeBuffer();
}
export default function ShreeMarutiImport({records,authenticated,busy,teamId,onImported}:Props){
 const fileRef=useRef<HTMLInputElement>(null);
 const [preview,setPreview]=useState<TrackingExcelPreview|null>(null);
 const [fileName,setFileName]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [working,setWorking]=useState(false);
 const [progress,setProgress]=useState('');
 const [error,setError]=useState('');
 async function downloadTemplate(){
  try{
   setError('');
   const buffer=await workbookTemplate();
   const url=URL.createObjectURL(new Blob([buffer as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const a=document.createElement('a');a.href=url;a.download='PJS_Shree_Maruti_Tracking_Template.xlsx';
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e:any){setError(e?.message||'Unable to create Excel template.')}
 }
 async function inspect(file?:File){
  if(!file)return;
  setPreview(null);setError('');setProgress('');setConfirmed(false);setFileName(file.name);
  if(!/\.xlsx$/i.test(file.name)){setError('Select an Excel .xlsx file (download the template if needed).');return}
  if(file.size===0||file.size>2*1024*1024){setError('Excel file must be between 1 byte and 2 MB.');return}
  setWorking(true);
  try{
   const ExcelJS=(await import('exceljs')).default;
   const workbook=new ExcelJS.Workbook();
   await workbook.xlsx.load(new Uint8Array(await file.arrayBuffer()) as any);
   const sheet=workbook.getWorksheet('Shree Maruti')||workbook.worksheets[0];
   if(!sheet)throw Error('Excel workbook contains no worksheet.');
   if(sheet.rowCount>TRACKING_EXCEL_LIMIT+16)throw Error('Use up to '+TRACKING_EXCEL_LIMIT+' rows, without thousands of formatted empty rows.');
   const table:string[][]=[];
   for(let row=1;row<=sheet.rowCount;row++){
    const values:string[]=[];
    for(let col=1;col<=Math.min(16,Math.max(sheet.columnCount,4));col++){
     const cell=sheet.getRow(row).getCell(col);
     const raw=cell.value;
     // Formula cells and imprecise Excel numbers must never become IDs.
     if(raw&&typeof raw==='object'&&('formula' in raw||'sharedFormula' in raw))values.push('');
     else if(typeof raw==='number'&&!Number.isSafeInteger(raw))values.push('');
     else values.push(cell.text.trim());
    }
    table.push(values);
   }
   setPreview(previewShreeMarutiImport(table,records.map(r=>String(r.process))));
  }catch(e:any){setError(e?.message||'Unable to read the tracking workbook.')}
  finally{setWorking(false)}
 }
 async function importReviewed(){
  if(!preview||!preview.valid.length||!confirmed||working||busy||!authenticated)return;
  setWorking(true);setError('');setProgress('Saving reviewed tracking records…');
  const known=new Set(records.map(r=>String(r.process)));
  let created=0,auditWarnings=0,skipped=0;
  const failures:string[]=[];
  try{
   for(const row of preview.valid){
    if(known.has(row.process)){skipped++;continue}
    try{
     const saved=await cloud.save({
      process:row.process,party:'',so:'',credit:row.credit,sales:row.sales,
      transporter:'SHREE MARUTI',lr:row.lr,stage:'Dispatch Tracking',status:'Pending',
      team_id:teamId||null,trackingExcelImportedAt:new Date().toISOString(),
      trackingExcelSource:fileName,trackingImportedWithoutDispatchDocuments:true
     });
     known.add(row.process);created++;
     try{
      await ops.audit(saved,'Shree Maruti tracking Excel imported',{
       source:fileName,trackingId:row.lr,credit:row.credit,salesPerson:row.sales,
       note:'Tracking identity only; client dispatch and delivery unverified'
      });
     }catch{auditWarnings++}
    }catch(e:any){failures.push('Row '+row.line+' ('+row.process+'): '+String(e?.message||'Save failed').slice(0,95))}
    setProgress('Created '+created+' / '+preview.valid.length+' eligible processes…');
   }
   try{await onImported()}catch(e:any){failures.push('Refresh: '+String(e?.message||'Please refresh manually'))}
   setPreview(null);setConfirmed(false);
   setProgress('Imported '+created+' process(es). Skipped '+(preview.rejected.length+skipped)+'.'+(auditWarnings?' '+auditWarnings+' audit entry failure(s).':'')+' No tracking jobs were queued.');
   if(failures.length)setError(failures.slice(0,6).join('; '));
  }finally{setWorking(false)}
 }
 return <section className='ux-shree-import' aria-label='Shree Maruti Excel import'>
  <div className='ux-shree-import-head'>
   <div><h3><FileSpreadsheet size={18}/> Import tracking from Excel</h3>
    <p>Creates Shree Maruti tracking processes from four required columns. Review first; no existing process is changed.</p></div>
   <div className='ux-shree-import-buttons'>
    <button type='button' onClick={()=>void downloadTemplate()} disabled={working}><Download size={15}/> Excel template</button>
    <button type='button' className='primary' onClick={()=>fileRef.current?.click()} disabled={working||busy||!authenticated}><FileUp size={15}/> Upload Excel</button>
    <input ref={fileRef} type='file' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' hidden onChange={e=>{void inspect(e.target.files?.[0]);e.target.value=''}}/>
   </div>
  </div>
  <p className='ux-shree-import-columns'><b>Columns:</b> Process No. · Credit / Non-Credit · Sales Person Name · Tracking ID</p>
  {preview&&<div className='ux-shree-import-preview'>
   <strong>{fileName} · {preview.total} row(s)</strong>
   <div className='ux-shree-import-summary'><span><CheckCircle2 size={15}/> Ready: {preview.valid.length}</span><span><AlertTriangle size={15}/> Skipped: {preview.rejected.length}</span></div>
   {!!preview.valid.length&&<div className='ux-shree-preview-table'><table><thead><tr><th>Process</th><th>Credit</th><th>Sales person</th><th>Tracking ID</th></tr></thead><tbody>
    {preview.valid.slice(0,8).map(r=><tr key={r.line}><td>{r.process}</td><td>{r.credit}</td><td>{r.sales}</td><td>{r.lr}</td></tr>)}
   </tbody></table>{preview.valid.length>8&&<small>Showing first 8 of {preview.valid.length} valid rows.</small>}</div>}
   {!!preview.rejected.length&&<div className='ux-shree-import-errors'>{preview.rejected.slice(0,8).map(r=><p key={r.line}>Row {r.line} · {r.process||'—'}: {r.reason}</p>)}</div>}
   {!!preview.valid.length&&<label className='ux-shree-confirm'><input type='checkbox' checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    I reviewed these rows. Create {preview.valid.length} new Dispatch Tracking process(es); existing records will not be overwritten and no carrier lookups are started.</label>}
   {!!preview.valid.length&&<button type='button' className='ux-shree-import-submit' disabled={!confirmed||working||busy||!authenticated} onClick={()=>void importReviewed()}>{working?'Importing…':'Import '+preview.valid.length+' reviewed process(es)'}</button>}
  </div>}
  {progress&&<p className='ux-shree-import-progress' role='status'>{progress}</p>}
  {error&&<p className='ux-shree-import-error' role='alert'>{error}</p>}
  {!authenticated&&<p className='ux-shree-import-error'>Sign in to import tracking processes.</p>}
 </section>;
}
