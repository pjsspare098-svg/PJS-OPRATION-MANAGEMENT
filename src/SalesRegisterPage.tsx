import {useMemo,useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,Download,FileSpreadsheet,Plus,Search,Upload} from 'lucide-react';
import {Button,Empty,Heading,Tone} from './UnifiedKit';
import {creditCategory} from './siteNavigation';
import {cloud} from './cloud';
import {ops} from './unifiedOps';

const fields=[
 ['process','Process No.'],['invoice','Invoice No.'],['invoiceDate','Invoice Date'],
 ['party','Party Name'],['so','SO No.'],['sales','Sales Person'],['credit','Credit / Non-credit'],
 ['productName','Product'],['ready','Ready Date'],['amount','Total Amount'],
 ['transporter','Transporter'],['weight','Weight'],['lr','LR / Docket No.'],
 ['stage','Process Stage'],['status','Status']
] as const;
const importMap=[
 ['process',2],['invoice',3],['ready',5],['invoiceDate',6],
 ['party',8],['productName',9],['amount',12],['transporter',14],
 ['weight',15],['lr',16]
] as const;
type PreviewRow={line:number;process:string;changes:Record<string,string>;reason?:string};
function safeCell(v:unknown){const s=String(v??'');return /^[=+\-@\t\r\n]/.test(s)?"'"+s:s;}
function dateString(value:unknown):string{
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return [
  value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')
 ].join('-');
 const s=String(value??'').trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
 if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 return '';
}
function readCell(cell:any):string{
 const value=cell?.value;
 if(value===null||value===undefined)return '';
 if(value instanceof Date)return dateString(value);
 if(typeof value==='number')return Number.isFinite(value)?String(value):'';
 if(typeof value==='string')return value.trim();
 if(value&&typeof value==='object'){
  if('formula' in value||'sharedFormula' in value)throw Error('Contains a formula: convert to values before importing');
  if('text' in value)return String(value.text||'').trim();
  if(Array.isArray(value.richText))return value.richText.map((x:any)=>x.text||'').join('').trim();
 }
 return '';
}
function validProcess(s:string){return /^[0-9]{5,9}$/.test(s)&&!/^(0)+$/.test(s);}
function formatValue(key:string,val:string){
 if(key==='ready'||key==='invoiceDate')return dateString(val);
 return val.trim();
}
function download(buffer:any,name:string){
 const url=URL.createObjectURL(new Blob([buffer as BlobPart],{
  type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 }));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export default function SalesRegisterPage({p}:{p:any}){
 const {records=[],results=[],authenticated,demo,busy,onEdit,onNew,onRefresh,userId}=p;
 const [query,setQuery]=useState('');
 const [credit,setCredit]=useState('All');
 const [working,setWorking]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [preview,setPreview]=useState<PreviewRow[]|null>(null);
 const [filename,setFilename]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const picker=useRef<HTMLInputElement>(null);
 const rows=useMemo(()=>results.filter((r:any)=>
  (credit==='All'||creditCategory(r.credit)===credit)&&
  (!query.trim()||[r.process,r.invoice,r.party,r.so,r.sales,r.lr,r.transporter].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase().trim())))
 ),[results,credit,query]);
 async function exportXlsx(){
  setError('');setWorking(true);
  try{
   const ExcelJS=(await import('exceljs')).default;
   const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('PJS SALES REGISTER');
   sheet.columns=fields.map(([key,label])=>({header:label,key,width:key==='party'?35:key==='process'?18:23}));
   sheet.views=[{state:'frozen',ySplit:1}];
   sheet.getRow(1).height=28;
   sheet.getRow(1).eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF264B7D'}};
   });
   for(const r of records){
    const data:any={};
    for(const [key] of fields)data[key]=safeCell(r[key]);
    sheet.addRow(data);
   }
   for(const [key] of fields)if(['process','invoice','so','lr'].includes(key))sheet.getColumn(key).numFmt='@';
   sheet.autoFilter='A1:O1';
   const help=book.addWorksheet('Instructions');help.getColumn(1).width=30;help.getColumn(2).width=112;
   [
    ['Sales register','This export is a process register snapshot. It does NOT send emails or submit DataDoc.'],
    ['Source import','Import a Sales Register 26-27 worksheet where Process No. is column B; invoice no C; ready E; date F; party H; product I; amount L; transporter N; weight O; LR P.'],
    ['Safe matching','Only an existing personal process with exactly matching Process No. is eligible. No new process, stage transfer or document upload.'],
    ['Import behavior','Only empty fields are filled; existing non-empty values are never overwritten. Each import requires review and confirmation.'],
    ['Dates','Use Excel dates or YYYY-MM-DD; unknown dates are left unchanged.'],
    ['Scope','Shared team records and records belonging to another user are not modified.']
   ].forEach(r=>help.addRow(r));
   download(await book.xlsx.writeBuffer(),'PJS_Sales_Register_'+new Date().toISOString().slice(0,10)+'.xlsx');
  }catch(e:any){setError('Export failed: '+String(e?.message||e))}
  finally{setWorking(false)}
 }
 async function inspect(file?:File){
  if(!file)return;
  setError('');setNotice('');setPreview(null);setConfirmed(false);setFilename(file.name);
  if(!/\.(xlsx|xlsm)$/i.test(file.name)){setError('Choose a Sales Register .xlsx or .xlsm workbook');return}
  if(file.size>10*1024*1024||!file.size){setError('The workbook must be between 1 byte and 10 MB');return}
  setWorking(true);
  try{
   const ExcelJS=(await import('exceljs')).default;
   const book=new ExcelJS.Workbook();
   await book.xlsx.load(new Uint8Array(await file.arrayBuffer()) as any);
   const sheet=book.worksheets.find(w=>/sales[\s_-]*regist/i.test(w.name))||book.worksheets[0];
   if(!sheet||sheet.rowCount>4000)throw Error('Sales Register worksheet missing or over 4,000 rows');
   const pjsExport=String(sheet.getRow(1).getCell(1).value||'').trim().toLowerCase()==='process no.'
    &&String(sheet.getRow(1).getCell(2).value||'').trim().toLowerCase()==='invoice no.';
   if(!pjsExport&&!/sales[\s_-]*(regist|ragist)/i.test(sheet.name))
    throw Error('For external data use a SALES REGISTER sheet with Process No. in column B.');
   const selectedMap=pjsExport
    ? fields.map(([key],index)=>[key,index+1] as const).filter(([key])=>
       importMap.some(([allowed])=>allowed===key))
    :importMap;
   const processCol=pjsExport?1:2;
   const imported:PreviewRow[]=[];
   const seen=new Set<string>();
   for(let line=1;line<=sheet.rowCount;line++){
    const process=readCell(sheet.getRow(line).getCell(processCol)).replace(/\.0$/,'').trim();
    if(!validProcess(process))continue; // headings/footers are not processes
    if(seen.has(process)){imported.push({line,process,changes:{},reason:'Duplicate Process No. in workbook'});continue}
    seen.add(process);
    const matched=records.filter((r:any)=>String(r.process).trim()===process);
    if(matched.length!==1){imported.push({line,process,changes:{},reason:matched.length?'Ambiguous Process No.':'No matching process in PJS'});continue}
    const saved=matched[0];
    if(!authenticated||saved.owner_id!==userId||saved.team_id){
     imported.push({line,process,changes:{},reason:'Not an owned personal process'});continue
    }
    const changes:Record<string,string>={};
    let reason='';
    for(const [key,col] of selectedMap){
     if(key==='process')continue;
     let v='';
     try{
      const cell=sheet.getRow(line).getCell(col);
      v=(key==='ready'||key==='invoiceDate')?dateString(cell.value instanceof Date?cell.value:readCell(cell)):readCell(cell);
     }catch(e:any){reason=String(e?.message||'Invalid formula');break}
     if(!v)continue;
     if((key==='invoice'||key==='party')&&String(saved[key]||'').trim()&&String(saved[key]).trim().toLowerCase()!==v.toLowerCase()){
      reason='Existing '+(key==='invoice'?'Invoice No.':'Party Name')+' differs; verify manually';break;
     }
     if(!String(saved[key]||'').trim())changes[key]=formatValue(key,v);
    }
    imported.push({line,process,changes:reason?{}:changes,reason:reason||(Object.keys(changes).length?'':'Already complete / no new details')});
   }
   if(imported.length===0)throw Error('No valid 5–9 digit Process Nos. found in column B');
   setPreview(imported);
  }catch(e:any){setError('Excel preview failed: '+String(e?.message||e))}
  finally{setWorking(false)}
 }
 async function apply(){
  if(!preview||!confirmed||working||busy||!authenticated||demo)return;
  setWorking(true);setError('');
  let savedCount=0;const failures:string[]=[];
  for(const row of preview.filter(r=>!r.reason&&Object.keys(r.changes).length)){
   try{
    const latest=await cloud.findByProcess(row.process);
    if(!latest||latest.owner_id!==userId||latest.team_id)throw Error('Process inaccessible');
    for(const [key,value] of Object.entries(row.changes))
     if(String(latest[key]||'').trim())throw Error('Source field '+key+' was changed; skipped');
    await ops.save({...latest,...row.changes},'Sales Register Excel fields imported');
    savedCount++;
   }catch(e:any){failures.push('Row '+row.line+' / '+row.process+': '+String(e?.message||e))}
  }
  setPreview(null);setConfirmed(false);
  try{await onRefresh()}catch(e:any){failures.push('Refresh failed: '+String(e?.message||e))}
  setWorking(false);
  setNotice(savedCount+' process(es) updated with previously blank Sales Register details. No stage was changed.');
  if(failures.length)setError(failures.slice(0,8).join(' · '));
 }
 const eligible=preview?.filter(row=>!row.reason&&Object.keys(row.changes).length)||[];
 return <div className='oms-seven-page'>
  <Heading eyebrow='MODULE 05 / SALES'
   title='Sales Register'
   description='Search all existing PJS processes by Process No. or invoice. Export Excel or safely import missing Sales Register fields; no auto dispatch or agents.'
   actions={<div className='oms-seven-toolbar'>
    <Button onClick={onNew}><Plus size={15}/> New entry</Button>
    <Button disabled={working} onClick={()=>void exportXlsx()}><Download size={15}/> Export Excel</Button>
    <Button variant='primary' disabled={working||busy||!authenticated} onClick={()=>picker.current?.click()}><Upload size={15}/> Import Excel</Button>
    <input hidden ref={picker} type='file' accept='.xlsx,.xlsm' onChange={e=>{void inspect(e.target.files?.[0]);e.target.value=''}}/>
   </div>}/>
  <div className='oms-seven-manual-notice'><FileSpreadsheet size={18}/><div>
   <strong>Master sales register · {records.length} process(es)</strong>
   <small>Sales Register imports match existing Process Nos. and only fill empty details. Existing data, stage, documents and tracking results are retained.</small>
  </div></div>
  <div className='oms-seven-register-controls oms-seven-sales-controls'>
   <label className='oms-seven-search'><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder='Process, invoice, customer, LR…' aria-label='Search sales register'/></label>
   <label className='oms-seven-credit-filter'>Credit status
    <select value={credit} onChange={e=>setCredit(e.target.value)}><option>All</option><option>Credit</option><option value='Non Credit'>Non-credit</option><option>Unknown</option></select>
   </label>
  </div>
  {notice&&<p className='oms-seven-success' role='status'><CheckCircle2 size={15}/>{notice}</p>}
  {error&&<p className='oms-seven-error' role='alert'><AlertTriangle size={15}/>{error}</p>}
  {preview&&<section className='oms-seven-preview'>
   <h2>Review import · {filename}</h2>
   <p>{eligible.length} process(es) eligible for missing-field updates · {preview.length-eligible.length} skipped / unchanged. No existing data will be overwritten.</p>
   <div className='oms-seven-preview-table'><table><thead><tr><th>Row</th><th>Process</th><th>Changes / reason</th></tr></thead><tbody>{preview.slice(0,30).map(row=>
    <tr key={row.line}><td>{row.line}</td><td>{row.process}</td><td>{row.reason||Object.keys(row.changes).join(', ')}</td></tr>
   )}</tbody></table></div>
   {preview.length>30&&<small>Showing first 30 of {preview.length} rows.</small>}
   <label className='oms-seven-check'><input type='checkbox' checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I reviewed the matching Process Nos. and authorize filling only empty sales fields.</label>
   <div className='oms-seven-toolbar'><Button onClick={()=>{setPreview(null);setConfirmed(false)}}>Cancel</Button><Button variant='primary' disabled={!confirmed||!eligible.length||working} onClick={()=>void apply()}>{working?'Saving…':'Confirm import ('+eligible.length+')'}</Button></div>
  </section>}
  <section className='oms-seven-records'>
   <table className='oms-seven-sales-table'><thead><tr><th>Process No.</th><th>Party</th><th>Invoice</th><th>SO No.</th><th>Credit / Non-credit</th><th>Salesperson</th><th>Amount</th><th>Transport / LR</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>{rows.map((r:any)=><tr key={r.id}>
     <td><button className='ux-process-link' onClick={()=>onEdit(r)}>{r.process}</button></td>
     <td>{r.party||'—'}</td><td>{r.invoice||'—'}</td><td>{r.so||'—'}</td>
     <td>{creditCategory(r.credit)}</td><td>{r.sales||'—'}</td><td>{r.amount||'—'}</td>
     <td>{r.transporter||'—'}<small>{r.lr||'No LR'}</small></td>
     <td><Tone value={r.stage}/></td>
     <td><Button onClick={()=>onEdit(r)}>Edit</Button></td>
    </tr>)}
    {!rows.length&&<tr><td colSpan={10}><Empty icon={FileSpreadsheet} title='No matching sales processes' help='Change your search or create a process. Imports do not create duplicate records.'/></td></tr>}
    </tbody>
   </table>
  </section>
 </div>;
}
