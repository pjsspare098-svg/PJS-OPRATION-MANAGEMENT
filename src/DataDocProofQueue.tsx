import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,FileImage,RefreshCw,ShieldCheck,UploadCloud} from 'lucide-react';
import {supabase} from './independentClient';
import {cloud} from './cloud';
import {trackingProofDocuments,trackingProofPlan} from './datadocProofRules.ts';
import './datadoc-proof.css';

type Worker={worker_name:string;status:string;last_seen_at:string;details:any;machine_name:string}|null;
const jobLabel=(job:any)=>job?.status==='completed'?'Submitted':job?.status==='running'?'Submitting':job?.status==='queued'?'Queued':job?.status==='failed'?'Needs review':'';
export default function DataDocProofQueue({p,rows}:{p:any;rows:any[]}){
 const [selection,setSelection]=useState<Record<string,string>>({});
 const [worker,setWorker]=useState<Worker>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const readWorker=useCallback(async()=>{
  if(!p.authenticated||!supabase){setWorker(null);return}
  setLoading(true);
  try{
   const {data:user,error:authError}=await supabase.auth.getUser();
   if(authError||!user.user)throw Error('Sign in to see proof worker status');
   const {data,error}=await supabase.from('oms_datadoc_proof_workers')
    .select('worker_name,machine_name,status,last_seen_at,details').eq('owner_id',user.user.id).maybeSingle();
   if(error)throw error;
   setWorker(data as Worker);setError('');
  }catch(e:any){setError(e?.message||'Could not load proof worker status')}
  finally{setLoading(false)}
 },[p.authenticated]);
 useEffect(()=>{void readWorker();const id=window.setInterval(()=>void readWorker(),30000);return()=>window.clearInterval(id)},[readWorker]);
 const connected=Boolean(worker?.last_seen_at&&Date.now()-new Date(worker.last_seen_at).getTime()<120000);
 const live=Boolean(connected&&worker?.details?.live_enabled===true&&['idle','busy'].includes(worker?.status||''));
 return <div className='dd-proof'>
  <div className='dd-proof-intro'>
   <ShieldCheck size={18}/>
   <div><strong>Tracking screenshot → DataDoc transaction</strong>
    <p>Select a saved screenshot, review the credit category and next work, then approve a real DataDoc submission. The office Windows worker handles the portal. A screenshot alone is not proof of delivery.</p></div>
  </div>
  <div className='dd-proof-worker'><span className={live?'on':'off'}/><div><strong>{!connected?'Proof worker offline':live?'Proof worker online':worker?.status==='paused'?'Proof worker paused':'Proof worker not enabled'}</strong>
   <small>{worker?.machine_name||'Authorized Windows PC required'} · {connected?new Date(worker!.last_seen_at).toLocaleString('en-IN'):'No recent heartbeat'}</small>
  </div><button disabled={loading||p.busy} onClick={()=>{void readWorker();void p.onRefresh?.()}}><RefreshCw size={14}/> Refresh</button></div>
  {error&&<p className='dd-proof-error' role='alert'>{error}</p>}
  {rows.length===0&&<div className='dd-proof-empty'>No screenshot records are ready here. Capture a tracking screenshot first in Dispatch Tracking, or move a process to Delivery Proof.</div>}
  {rows.map((r:any)=>{
   const docs=trackingProofDocuments(r);
   const chosen=selection[r.id]|| (docs.some(d=>d.id===r.trackingCaptureDocumentId)?r.trackingCaptureDocumentId:docs[0]?.id||'');
   const plan=trackingProofPlan(r,chosen,p.jobs);
   const last=(p.jobs||[]).filter((j:any)=>j.process_id===r.id&&j.job_type==='delivery_proof_submit').sort((a:any,b:any)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
   const canApprove=plan.ready&&!p.busy&&p.authenticated&&(!r.owner_id||r.owner_id===p.userId);
   return <article className='dd-proof-item' key={r.id}>
    <header><div><strong>Process {r.process}</strong><small>{r.party||'Party not entered'} · {r.transporter||'Carrier not entered'} · LR {r.lr||'—'}</small></div><span className={'dd-proof-job '+(last?.status||'')}>{jobLabel(last)||'Not queued'}</span></header>
    <div className='dd-proof-grid'>
     <div><span>Credit category</span><strong>{r.credit||'Missing'}</strong></div>
     <div><span>Sales Person</span><strong>{r.sales||'Missing'}</strong></div>
     <div><span>Work / Time</span><strong>Original Doc. And Mtrl Rcvd. Conf. - India GST</strong></div>
     <div><span>Next Required Work</span><strong>{plan.nextWork||'Needs configuration'}</strong></div>
     <div><span>Next Response User</span><strong>{plan.nextUser||'Needs configuration'} (only)</strong></div>
     <div><span>Last captured status</span><strong>{r.trackingCaptureStatus||'Unknown'} · manually recorded</strong></div>
    </div>
    <label className='dd-proof-select'>Tracking screenshot to attach
     <select value={chosen} disabled={p.busy} onChange={e=>setSelection(v=>({...v,[r.id]:e.target.value}))}>
      {!docs.length&&<option value=''>No saved screenshots</option>}
      {docs.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
     </select>
    </label>
    <div className='dd-proof-actions'>
     <button disabled={!chosen||p.busy} onClick={()=>void cloud.open(r.id,chosen).catch((e:any)=>p.onError?.(e?.message||'Could not open screenshot'))}><FileImage size={15}/> Review screenshot</button>
     <button className='approve' disabled={!canApprove} onClick={()=>void p.onApproveDataDocProof(r,chosen)}><UploadCloud size={15}/> {last?.status==='completed'?'Already submitted':last?.status==='queued'?'Waiting for Windows worker':'Approve & Queue Tracking Proof'}</button>
    </div>
    {plan.missing.length>0&&<div className='dd-proof-issues'><AlertTriangle size={14}/>{plan.missing.join('; ')}</div>}
    {last?.status==='failed'&&<div className='dd-proof-issues'>Previous submission needs review in DataDoc. Do not submit twice without checking the portal.</div>}
    {last?.status==='completed'&&<small className='dd-proof-success'>Transaction recorded by the authorized worker. It does not automatically change the delivery status.</small>}
   </article>;
  })}
 </div>;
}
