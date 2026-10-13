import {useCallback,useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,Clock3,RefreshCw,Truck} from 'lucide-react';
import {supabase} from './independentClient';
import {filterStage} from './workflowStages';
import {checkJob} from './businessRules';
import {Button,Empty,Heading,Panel,SearchBar,Stat,Tone} from './UnifiedKit';
import type {Job} from './unifiedOps';

type Worker = {worker_name:string;status:string;last_seen_at:string;details:Record<string,unknown>} | null;

function currentJob(jobs:Job[], processId:string):Job|undefined {
 return jobs.filter(j=>j.job_type==='tracking'&&j.process_id===processId)
   .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
}
const exception=(value:string)=>/undelivered|rto|return|cancel|delay|address issue|not found|error/i.test(value);

export default function DispatchTrackingPage({p}:{p:any}){
 const {results,jobs,busy,onEdit,onQueue,onStage,search,setSearch,settings}=p;
 const [worker,setWorker]=useState<Worker>(null);
 const [workerError,setWorkerError]=useState('');
 const [filter,setFilter]=useState('All');
 const [loading,setLoading]=useState(false);
 const rows=filterStage(results,'Dispatch Tracking');
 const recent=useMemo(()=>jobs.filter((j:Job)=>j.job_type==='tracking'),[jobs]);
 const active=recent.filter((j:Job)=>['queued','running'].includes(j.status));
 const refreshWorker=useCallback(async()=>{
  if(!p.authenticated||!supabase){setWorker(null);return}
  setLoading(true);
  try{
   const {data:user,error:authError}=await supabase.auth.getUser();
   if(authError||!user.user)throw new Error('Sign in to view office tracking');
   const {data,error}=await supabase.from('oms_tracking_workers')
    .select('worker_name,status,last_seen_at,details').eq('owner_id',user.user.id).maybeSingle();
   if(error)throw error;
   setWorker(data||null);setWorkerError('');
  }catch(e:any){setWorker(null);setWorkerError(e?.message||'Cannot read tracking worker status')}
  finally{setLoading(false)}
 },[p.authenticated]);
 useEffect(()=>{void refreshWorker();const timer=setInterval(()=>void refreshWorker(),30000);return ()=>clearInterval(timer)},[refreshWorker]);
 const online=Boolean(worker?.last_seen_at&&Date.now()-Date.parse(worker.last_seen_at)<90000);
 const ready=Boolean(online&&['idle','busy','ready'].includes(worker?.status||''));
 const lastSeen=worker?.last_seen_at?new Date(worker.last_seen_at).toLocaleString('en-IN'):'Never';
 const visible=rows.filter((r:any)=>{
  const value=String(r.trackingStatus||r.status||'Pending');
  return filter==='All'||(filter==='Exception'?exception(value):value.toLowerCase()===filter.toLowerCase());
 });
 const delivered=rows.filter((r:any)=>r.trackingStatus==='Delivered').length;
 const issues=rows.filter((r:any)=>exception(String(r.trackingStatus||r.status||''))).length;

 return <>
  <Heading eyebrow='STAGE 05 · LIVE CARRIER STATUS' title='Dispatch Tracking'
   description='Queue an approved LR lookup, review verified results from the Windows carrier worker, then move delivered shipments to Delivery Proof.'
   actions={<Button disabled={loading||busy} onClick={()=>{void refreshWorker();void p.onRefresh?.()}}><RefreshCw size={15}/> Refresh results</Button>}/>
  <div className='ux-stats compact'>
   <Stat label='Carrier + LR ready' icon={Truck} value={rows.filter((r:any)=>r.transporter&&r.lr).length} note='Dispatch Tracking stage'/>
   <Stat label='Active requests' icon={Clock3} tone='orange' value={active.length} note='Queued or running'/>
   <Stat label='Verified delivered' icon={CheckCircle2} value={delivered} note='Carrier lookup result'/>
   <Stat label='Needs review' icon={AlertTriangle} tone='red' value={issues} note='Carrier exceptions'/>
  </div>
  <Panel title='Office tracking worker' subtitle='Shree Maruti, VRL, ACPL, V Express, TCI Freight and ARC'>
   <div className='ux-outlook-worker'>
    <div className={'ux-outlook-worker-dot '+(ready?'is-online':'')}/>
    <div>
     <strong>{!online?'Offline — carrier lookups wait in queue':ready?'Connected — carrier lookups enabled':'Connected — tracking paused'}</strong>
     <small>{worker?.worker_name||'No tracking worker registered'} · Last heartbeat: {lastSeen}</small>
     <small>{workerError||'Tracking is read-only on carrier websites. Failed lookups are not automatically retried; no email is sent here.'}</small>
    </div>
   </div>
  </Panel>
  <Panel title='Dispatch tracking records' subtitle='Only Dispatch Tracking processes appear here. Original documents and process ownership stay protected.'>
   <SearchBar value={search} onChange={setSearch} count={visible.length}/>
   <div className='ux-tracking-filter'><label>Filter status <select value={filter} onChange={e=>setFilter(e.target.value)}>
    {['All','Pending','In Transit','Out for Delivery','Delivered','Not Found','Exception'].map(v=><option key={v}>{v}</option>)}
   </select></label></div>
   <div className='ux-tablewrap'><table className='ux-table'><thead><tr>
    <th>Process / Party</th><th>Carrier / LR</th><th>Carrier result</th>
    <th>Latest job</th><th>Actions</th>
   </tr></thead><tbody>{visible.length?visible.map((r:any)=>{
    const latest=currentJob(recent,r.id);
    const running=latest&&['queued','running'].includes(latest.status);
    const status=String(r.trackingStatus||r.status||'Pending');
    const rule=checkJob(r,'tracking',settings,recent);
    const owner=(!r.owner_id||r.owner_id===p.userId);
    const alreadyDelivered=r.trackingStatus==='Delivered';
    const verifiedDelivery=Boolean(alreadyDelivered&&recent.some((j:Job)=>
     j.process_id===r.id&&j.status==='completed'&&j.result?.verified===true&&j.result?.status==='Delivered'));
    return <tr key={r.id}>
     <td><button className='ux-process-link' onClick={()=>onEdit(r)}>{r.process}</button><small>{r.party}</small></td>
     <td>{r.transporter||<span className='ux-warning'>Missing carrier</span>}<small>LR {r.lr||'missing'}</small></td>
     <td><Tone value={status}/><small>{r.trackingDeliveryDate?'Delivery: '+r.trackingDeliveryDate+' · ':''}{r.trackingCheckedAt?'Checked '+new Date(r.trackingCheckedAt).toLocaleString('en-IN'):'Not checked'}</small>
      {r.trackingDetail&&<small title={String(r.trackingDetail)}>{String(r.trackingDetail).slice(0,100)}</small>}</td>
     <td>{latest?<><strong>{latest.status==='completed'?'Checked':latest.status==='running'?'Checking carrier':latest.status==='queued'?'Waiting for worker':latest.status==='failed'?'Needs review':latest.status}</strong>
      <small>{latest.error_message||latest.result?.detail||'Request recorded'}</small></>:<small>Not queued</small>}</td>
     <td><div className='ux-action-flex'>
      <Button onClick={()=>onEdit(r)}>Edit</Button>
      <Button variant='primary' disabled={busy||!p.authenticated||!owner||!rule.ready||Boolean(running)||alreadyDelivered}
       onClick={()=>onQueue(r,'tracking')}>
       {running?'Tracking queued':alreadyDelivered?'Delivered':'Queue track'}
      </Button>
      {verifiedDelivery&&<Button variant='mint' disabled={busy} onClick={()=>onStage(r,'Delivery Proof','Delivered')}>Delivery Proof</Button>}
     </div>{!owner&&<small>Only the process owner can queue office tracking.</small>}
     {!rule.ready&&<small>{rule.missing.join(', ')}</small>}
     </td>
    </tr>;
   }):<tr><td colSpan={5}><Empty icon={Truck} title='No matching tracking records'
    help='Move a dispatched process to Dispatch Tracking after confirming the client email was sent.'/></td></tr>}
   </tbody></table></div>
  </Panel>
 </>;
}
