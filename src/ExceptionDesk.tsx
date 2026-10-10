import {useState} from 'react';
import {AlertTriangle,CheckCircle2,ClipboardCheck,Plus,Truck} from 'lucide-react';
import {Button,Empty,Panel,Tone} from './UnifiedKit';
import {isException} from './unifiedOps';

const categories=['document','carrier','address','return','rto','customer','other'] as const;
export default function ExceptionDesk({records,exceptions,onEdit,onReport,onResolve,onReturn,busy}:{records:any[];exceptions:any[];onEdit:(r:any)=>void;onReport:(r:any,category:string,detail:string)=>Promise<void>;onResolve:(item:any,r:any,note:string)=>Promise<void>;onReturn:(r:any)=>void;busy:boolean}){
 const [processId,setProcessId]=useState('');
 const [category,setCategory]=useState<string>('document');
 const [description,setDescription]=useState('');
 const [resolutions,setResolutions]=useState<Record<string,string>>({});
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 const pending=exceptions.filter(x=>x.status!=='resolved');
 const cases=exceptions.filter(x=>x.status==='resolved');
 const flagged=records.filter(r=>isException(r)&&!exceptions.some(x=>x.process_id===r.id&&x.status!=='resolved'));
 const recordFor=(id:string)=>records.find(r=>r.id===id);
 async function report(){
  const r=recordFor(processId);
  if(!r){setError('Select a process first.');return}
  if(description.trim().length<8){setError('Describe the exception in at least 8 characters.');return}
  setWorking(true);setError('');
  try{await onReport(r,category,description);setDescription('');setProcessId('')}
  catch(e:any){setError(e.message||'Unable to create case')}finally{setWorking(false)}
 }
 async function resolve(item:any){
  const r=recordFor(item.process_id);if(!r){setError('Process not in your current accessible records');return}
  setWorking(true);setError('');
  try{await onResolve(item,r,resolutions[item.id]||'');setResolutions(x=>({...x,[item.id]:''}))}
  catch(e:any){setError(e.message||'Resolution failed')}finally{setWorking(false)}
 }
 return <div style={{display:'grid',gap:16}}>
  <Panel title='Open an exception case' subtitle='Record what happened before retrying or closing a dispatch.'>
   <div className='tw-content'>
    {error&&<p className='tw-error' role='alert'>{error}</p>}
    <div className='tw-grid' style={{display:'grid',gap:12}}>
     <label className='ux-field'>Process No.
      <select value={processId} onChange={e=>setProcessId(e.target.value)}>
       <option value=''>Select a process</option>
       {records.map(r=><option key={r.id} value={r.id}>{r.process} — {r.party||'Unknown party'}</option>)}
      </select>
     </label>
     <label className='ux-field'>Exception category
      <select value={category} onChange={e=>setCategory(e.target.value)}>
       {categories.map(c=><option key={c} value={c}>{c.toUpperCase()}</option>)}
      </select>
     </label>
     <label className='ux-field' style={{gridColumn:'1/-1'}}>What needs intervention?
      <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder='Describe the failed delivery, missing document or address problem.' rows={3} style={{display:'block',width:'100%',marginTop:8,padding:11,border:'1px solid #dbe5f2',borderRadius:9}}/>
     </label>
    </div>
    <Button variant='primary' disabled={busy||working} onClick={()=>void report()}><Plus size={16}/> Record exception</Button>
   </div>
  </Panel>
  <Panel title={'Open exceptions ('+pending.length+')'} subtitle='Resolving requires a written resolution. A worker job is never marked complete by this action.'>
   {pending.length?pending.map(item=>{const r=recordFor(item.process_id);return <div key={item.id} style={{padding:'15px 20px',borderTop:'1px solid #ebeff6'}}>
    <div style={{display:'flex',alignItems:'center',gap:12,justifyContent:'space-between',flexWrap:'wrap'}}>
      <div><strong style={{fontSize:12,color:'#284365'}}>Process {r?.process||'Unavailable'} · {item.category.toUpperCase()}</strong><p style={{fontSize:11,color:'#71859c',margin:'7px 0'}}>{item.description}</p></div><Tone value={item.status}/>
    </div>
    <label className='ux-field'>Resolution note
      <textarea value={resolutions[item.id]||''} rows={2} onChange={e=>setResolutions(x=>({...x,[item.id]:e.target.value}))} placeholder='What was checked or corrected?' style={{display:'block',width:'100%',marginTop:8,padding:9,border:'1px solid #dbe5f2',borderRadius:9}}/>
    </label>
    <div style={{display:'flex',gap:8,marginTop:10}}><Button disabled={busy||working||(resolutions[item.id]||'').trim().length<8} onClick={()=>void resolve(item)}><CheckCircle2 size={15}/> Resolve with note</Button>{r&&<Button onClick={()=>onEdit(r)}>Open process</Button>}</div>
   </div>}):<Empty icon={CheckCircle2} title='No open exceptions' help='No unresolved cases currently exist.'/>}
  </Panel>
  {flagged.length>0&&<Panel title='Legacy flags needing formal review' subtitle='Existing records with exception status but no open case'>
   {flagged.map(r=><div key={r.id} className='ux-recent'><AlertTriangle size={16}/><strong style={{fontSize:11}}>{r.process} — {r.exceptionReason||r.status}</strong><Button onClick={()=>onEdit(r)}>Review</Button></div>)}
  </Panel>}
  {cases.length>0&&<Panel title='Resolved history' subtitle='Audit history remains visible after resolution.'>
   {cases.slice(0,25).map(x=><div key={x.id} style={{padding:'12px 20px',borderTop:'1px solid #ebeff6',fontSize:11,color:'#68819b'}}><strong>{recordFor(x.process_id)?.process||'—'} · {x.category}</strong><p style={{margin:'4px 0'}}>{x.resolution}</p><small>{x.resolved_at?new Date(x.resolved_at).toLocaleDateString('en-IN'):''}</small></div>)}
  </Panel>}
 </div>;
}
