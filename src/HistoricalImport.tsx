import {useState} from 'react';
import {AlertTriangle,CheckCircle2,FileSpreadsheet,FileUp,ShieldCheck} from 'lucide-react';
import {Button,Panel} from './UnifiedKit';
import {previewMigration,type ImportRow} from './migrationPreview';
import {ops} from './unifiedOps';

export default function HistoricalImport({records,teamId,onImported}:{records:any[];teamId:string;onImported:()=>Promise<void>}){
 const [preview,setPreview]=useState<ReturnType<typeof previewMigration>|null>(null);
 const [name,setName]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState('');
 const [error,setError]=useState('');
 async function inspect(file?:File){
  if(!file)return;
  setError('');setConfirmed(false);setPreview(null);setName(file.name);
  if(file.size>2*1024*1024){setError('CSV is over 2 MB. Import in smaller batches of 500 processes.');return}
  try{const text=await file.text();setPreview(previewMigration(text,records.map(r=>r.process)))}
  catch(e:any){setError(e?.message||'Could not read CSV')}
 }
 async function start(){
  if(!preview||!confirmed||busy)return;
  setBusy(true);setError('');
  let done=0;const errors:string[]=[];
  for(const r of preview.valid){
    try{await ops.save({
      process:r.process,so:r.so,party:r.party,invoice:r.invoice,transporter:r.transporter,lr:r.lr,
      stage:'Universal Process',status:'Review',credit:'Credit',
      team_id:teamId||null,migrationSource:'legacy_csv',legacyStatus:r.legacyStatus,
      migratedAt:new Date().toISOString()
    },'Historical CSV process imported');done++}
    catch(e:any){errors.push('Line '+r.line+' ('+r.process+'): '+String(e?.message||'Save failed').slice(0,110))}
    setProgress(done+' / '+preview.valid.length+' processed');
  }
  setBusy(false);setConfirmed(false);
  await onImported();
  setPreview(null);
  if(errors.length)setError(done+' records saved; '+errors.length+' failed: '+errors.slice(0,5).join('; '));
  else setProgress(done+' records imported into '+(teamId?'your selected team':'your personal workspace')+'. Review documents before advancing stages.');
 }
 return <Panel title='Historical PJS migration — review before import' subtitle='Bring process identity and reference fields from an approved CSV export. No legacy system is modified.'>
  <div className='tw-content'>
   <div className='tw-info'><ShieldCheck size={16}/> This import never accesses the old PJS database, never transfers attachments, and never marks a process completed. All imported records start in Review. Export a backup first.</div>
   <label className='ux-field'>Select historical process CSV (maximum 500 rows)
    <input type='file' accept='.csv,text/csv' onChange={e=>{void inspect(e.target.files?.[0]);e.target.value=''}}/>
   </label>
   <p className='tw-muted'>Required columns: <b>Process No., Party Name, SO No.</b> Optional: Invoice No., Transporter, LR No., Status. Use Excel → Save As → CSV UTF-8.</p>
   {preview&&<div className='tw-preview'>
    <strong>{name}: {preview.total} rows checked</strong>
    <div><span className='tw-good'><CheckCircle2 size={15}/> Ready: {preview.valid.length}</span><span className='tw-bad'><AlertTriangle size={15}/> Skipped: {preview.rejected.length}</span></div>
    {preview.rejected.length>0&&<div className='tw-rejections'>{preview.rejected.slice(0,12).map(x=><p key={x.line}>Line {x.line}, Process {x.process||'—'}: {x.reason}</p>)}</div>}
    {preview.valid.length>0&&<>
      <div className='tw-choices'>{preview.valid.slice(0,10).map(x=><div key={x.line} style={{padding:9,fontSize:11}}>{x.process} · {x.party} · SO {x.so}</div>)}</div>
      <label style={{display:'flex',gap:8,fontSize:11,color:'#53718a',alignItems:'center'}}>
       <input type='checkbox' checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
       I verified this CSV and approve importing {preview.valid.length} process identities into {teamId?'the selected team':'my personal workspace'}.
      </label>
      <Button variant='primary' disabled={busy||!confirmed} onClick={()=>void start()}><FileUp size={16}/> {busy?'Importing…':'Import reviewed processes'}</Button>
    </>}
   </div>}
   {progress&&<p className='tw-success' role='status'>{progress}</p>}
   {error&&<p className='tw-error' role='alert'>{error}</p>}
  </div>
 </Panel>;
}
