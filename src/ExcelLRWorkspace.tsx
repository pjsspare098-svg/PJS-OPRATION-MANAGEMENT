import {useState} from 'react';
import {Upload,FileSpreadsheet,Search,FileText,Clock3,AlertCircle,ExternalLink} from 'lucide-react';
import {cloud} from './cloud';
export default function ExcelLRWorkspace({records}:{records:any[]}) {
  const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState('Waiting for PDF upload');
  const [busy,setBusy]=useState(false);
  const [lr,setLr]=useState('');
  const [matches,setMatches]=useState<any[]>([]);
  const [history,setHistory]=useState<{action:string,status:string,detail:string}[]>([]);
  function add(action:string,detail:string,status='Info'){setMessage(detail);setHistory(v=>[{action,status,detail},...v].slice(0,12))}
  async function find(){
    if(!file){add('Find LR','Upload a courier PDF first.');return}
    setBusy(true);add('Find LR','Reading LR from courier bill...','Running');
    try {
      const fields=await cloud.extract(file,'lrDoc');
      const value=String(fields.lr||'').trim();
      setLr(value);
      if(!value){add('Find LR','No LR number detected. Check the PDF or search manually.');return}
      const found=records.filter(r=>String(r.lr||'').replace(/\W/g,'').toLowerCase()===value.replace(/\W/g,'').toLowerCase());
      setMatches(found);
      add('Find LR',found.length?'Matched LR '+value+' to '+found.length+' process(es).':'LR '+value+' extracted but no matching process found.',found.length?'Matched':'Review');
    }catch(e:any){add('Find LR','Extraction failed: '+(e?.message||'Retry'))}
    finally{setBusy(false)}
  }
  return <section className='el-workspace'>
    <div className='el-card'><div className='el-title'><h2>Courier Bill & LR Processing</h2><p>Read TCI / VExpress bills and match LR against cloud Data Store.</p></div>
      <div className='el-actions'><label className='el-upload'><Upload size={19}/>Upload PDF<input type='file' accept='.pdf' onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);setMatches([]);setLr('');if(f)add('PDF selected',f.name,'Selected')}}/></label>
        <button onClick={()=>add('Generate Excel','Your approved Excel template is needed before output mapping can be completed.')}><FileSpreadsheet size={19}/>Generate Excel</button>
        <button disabled={busy} onClick={find}><Search size={19}/>{busy?'Reading...':'Find LR'}</button></div>
      {file&&<div className='el-file'><FileText size={17}/><div><b>{file.name}</b><small>{(file.size/1024).toFixed(1)} KB · Selected locally for extraction</small></div></div>}
    </div>
    <div className='el-card el-status'><div className='el-title'><h2>Processing Status</h2><p>Extraction and matching results.</p></div>
      <div className='el-state'><Clock3 size={22}/><div><b>{message}</b><span>{lr?'Extracted LR: '+lr:'No LR extracted yet'}</span></div><strong>{busy?'Reading':'Ready'}</strong></div>
      {matches.map(r=><div className='el-event' key={r.id}><b>{r.process}</b><span>{r.party||'—'} · {r.lr}</span>{(r.documents||[]).filter((d:any)=>d.kind==='lrDoc').map((d:any)=><button key={d.id} onClick={()=>cloud.open(r.id,d.id)}><ExternalLink size={14}/>Open LR</button>)}</div>)}
      <div className='el-history'><h3>Activity</h3>{history.length?history.map((h,i)=><div className='el-event' key={i}><AlertCircle size={16}/><b>{h.action}</b><span>{h.detail}</span><em>{h.status}</em></div>):<p>No activity yet.</p>}</div>
    </div>
  </section>
}