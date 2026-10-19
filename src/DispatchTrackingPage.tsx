import './transport-tracking.css';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Camera,CheckCircle2,Clock3,ExternalLink,FileImage,RefreshCw,Truck} from 'lucide-react';
import {supabase} from './independentClient';
import {cloud} from './cloud';
import {filterStage} from './workflowStages';
import {checkJob} from './businessRules';
import {Button,Empty,Heading,Panel,SearchBar,Stat,Tone} from './UnifiedKit';
import type {Job} from './unifiedOps';
import {normalizeCarrier} from './carrierRegistry';
import {MANUAL_CARRIER_URLS,TRANSPORT_CARRIERS,transportCarrier} from './transportTracking';
import TransportTrackingCapture from './TransportTrackingCapture';
import ShreeMarutiImport from './ShreeMarutiImport';

type Mode='Non-trackable'|'Shree Maruti'|'Transport';
type Worker={worker_name:string;status:string;last_seen_at:string;details:Record<string,unknown>}|null;
const isException=(v:string)=>/undelivered|rto|return|cancel|delay|address issue|not found|error|needs review/i.test(v);
const mostRecent=(jobs:Job[],id:string)=>jobs.filter(j=>j.process_id===id&&j.job_type==='tracking')
 .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];

export default function DispatchTrackingPage({p}:{p:any}){
 const {results,jobs,busy,onEdit,onQueue,onStage,search,setSearch,settings}=p;
 const [mode,setMode]=useState<Mode>('Transport');
 const [transporterFilter,setTransporterFilter]=useState('All transporters');
 const [statusFilter,setStatusFilter]=useState('All');
 const [transfers,setTransfers]=useState<Record<string,string>>({});
 const [capture,setCapture]=useState<any|null>(null);
 const [worker,setWorker]=useState<Worker>(null);
 const [workerError,setWorkerError]=useState('');
 const [loading,setLoading]=useState(false);
 const rows=filterStage(results,'Dispatch Tracking');
 const recent=useMemo(()=>jobs.filter((j:Job)=>j.job_type==='tracking'),[jobs]);
 const active=recent.filter((j:Job)=>['queued','running'].includes(j.status));
 const refreshWorker=useCallback(async()=>{
  if(!p.authenticated||!supabase){setWorker(null);return}
  setLoading(true);
  try{
   const {data:user,error:authError}=await supabase.auth.getUser();
   if(authError||!user.user)throw Error('Sign in to view the tracking worker');
   const {data,error}=await supabase.from('oms_tracking_workers').select('worker_name,status,last_seen_at,details').eq('owner_id',user.user.id).maybeSingle();
   if(error)throw error;
   setWorker(data||null);setWorkerError('');
  }catch(e:any){setWorker(null);setWorkerError(e?.message||'Unable to read worker status')}
  finally{setLoading(false)}
 },[p.authenticated]);
 useEffect(()=>{void refreshWorker();const interval=setInterval(()=>void refreshWorker(),30000);return()=>clearInterval(interval)},[refreshWorker]);
 const online=Boolean(worker?.last_seen_at&&Date.now()-Date.parse(worker.last_seen_at)<90000);
 const ready=Boolean(online&&['idle','busy','ready'].includes(worker?.status||''));
 const lastSeen=worker?.last_seen_at?new Date(worker.last_seen_at).toLocaleString('en-IN'):'Never';
 const counts={
  'Non-trackable':rows.filter((r:any)=>!transportCarrier(r.transporter)&&normalizeCarrier(r.transporter)!=='SHREE MARUTI').length,
  'Shree Maruti':rows.filter((r:any)=>normalizeCarrier(r.transporter)==='SHREE MARUTI').length,
  'Transport':rows.filter((r:any)=>Boolean(transportCarrier(r.transporter))).length,
 };
 const selected=rows.filter((r:any)=>{
  if(mode==='Transport'&&!transportCarrier(r.transporter))return false;
  if(mode==='Shree Maruti'&&normalizeCarrier(r.transporter)!=='SHREE MARUTI')return false;
  if(mode==='Non-trackable'&&(Boolean(transportCarrier(r.transporter))||normalizeCarrier(r.transporter)==='SHREE MARUTI'))return false;
  if(mode==='Transport'&&transporterFilter!=='All transporters'&&transportCarrier(r.transporter)!==transporterFilter)return false;
  const status=String(r.trackingCaptureStatus||r.trackingStatus||r.status||'Pending');
  return statusFilter==='All'||(statusFilter==='Needs Review'?isException(status)||(!r.trackingStatus&&Boolean(r.trackingCaptureStatus)):status.toLowerCase()===statusFilter.toLowerCase());
 });
 const shreeBatch=selected.filter((r:any)=>
  normalizeCarrier(r.transporter)==='SHREE MARUTI'
  &&(!r.owner_id||r.owner_id===p.userId)
  &&r.trackingStatus!=='Delivered'
  &&!recent.some(j=>j.process_id===r.id&&['queued','running'].includes(j.status))
  &&checkJob(r,'tracking',settings,recent).ready
 );
 const delivered=rows.filter((r:any)=>r.trackingStatus==='Delivered').length;
 const issues=rows.filter((r:any)=>isException(String(r.trackingStatus||r.trackingCaptureStatus||r.status||''))).length;
 function rowDocument(r:any){return (r.documents||[]).filter((d:any)=>d.kind==='trackingShotDoc')
  .sort((a:any,b:any)=>Date.parse(b.uploadedAt||'')-Date.parse(a.uploadedAt||''))[0]}
 function openCarrier(r:any){
  const carrier=transportCarrier(r.transporter);
  if(!carrier){p.onNotice('This is not a supported manual Transport carrier.');return}
  window.open(MANUAL_CARRIER_URLS[carrier],'_blank','noopener,noreferrer');
  if(r.lr&&navigator.clipboard?.writeText)void navigator.clipboard.writeText(String(r.lr)).catch(()=>{});
  setCapture(r);
 }
 async function openEvidence(r:any){
  const doc=rowDocument(r);
  if(!doc)return;
  try{await cloud.open(r.id,doc.id)}catch(e:any){p.onError?.(e?.message||'Could not open the saved screenshot')}
 }
 function transfer(r:any){
  const to=transfers[r.id];
  if(to!=='Check List'&&to!=='DataDoc')return;
  if(!window.confirm('Transfer Process '+r.process+' from Tracking to '+(to==='DataDoc'?'DataDoc Submit':to)+'? This does not submit any bill or email.'))return;
  void onStage(r,to,to==='Check List'?'Needs Review':'Pending');
 }
 function actionBar(r:any,kind:'all'|'transfer'|'actions'='all'){
  const carrier=transportCarrier(r.transporter);
  const doc=rowDocument(r);
  const latest=mostRecent(recent,r.id);
  const running=Boolean(latest&&['queued','running'].includes(latest.status));
  const rule=checkJob(r,'tracking',settings,recent);
  const owner=!r.owner_id||r.owner_id===p.userId;
  const verified=Boolean(r.trackingStatus==='Delivered'&&recent.some(j=>j.process_id===r.id&&j.status==='completed'&&j.result?.verified===true&&j.result?.status==='Delivered'));
  return <div className='ux-track-row-controls'>
   {(kind==='all'||kind==='transfer')&&<div className='ux-track-transfer'><select aria-label={'Transfer destination for '+r.process} value={transfers[r.id]||''} disabled={busy} onChange={e=>setTransfers(v=>({...v,[r.id]:e.target.value}))}>
    <option value=''>Transfer to…</option><option value='Check List'>Check List</option><option value='DataDoc'>DataDoc Submit</option>
   </select><button disabled={busy||!transfers[r.id]} onClick={()=>transfer(r)}>Transfer</button></div>}
   {(kind==='all'||kind==='actions')&&<div className='ux-track-result-actions'>
    {doc?<button className='ux-track-proof' onClick={()=>void openEvidence(r)}><FileImage size={14}/> Search result</button>:<span className='ux-track-none'>No screenshot</span>}
    {mode==='Transport'?<button className='ux-track-go' disabled={!carrier||!owner||!p.authenticated||busy} onClick={()=>openCarrier(r)}><ExternalLink size={15}/> Track</button>:
    mode==='Shree Maruti'?<button className='ux-track-go' disabled={busy||!p.authenticated||!owner||!rule.ready||running||r.trackingStatus==='Delivered'} onClick={()=>onQueue(r,'tracking')}>{running?'Queued':r.trackingStatus==='Delivered'?'Delivered':'Auto track'}</button>:
    <button className='ux-track-go' onClick={()=>onEdit(r)}>Edit carrier</button>}
    {mode==='Transport'&&<button className='ux-track-capture' disabled={!owner||!p.authenticated||busy} onClick={()=>setCapture(r)} title='Open screenshot capture tools'><Camera size={15}/> Capture</button>}
    {verified&&<button className='ux-track-verified' onClick={()=>onStage(r,'Delivery Proof','Delivered')}>Delivery Proof</button>}
   </div>}
  </div>;
 }
 function statusSummary(r:any){
  const status=String(r.trackingStatus||r.status||'Pending');
  return <div className='ux-track-status'>
   <Tone value={r.trackingCaptureStatus&&!r.trackingStatus?r.trackingCaptureStatus:status}/>
   {r.trackingCaptureStatus&&<div className='ux-track-unverified'><AlertTriangle size={12}/> Manual status: {r.trackingCaptureStatus} · Not carrier-verified</div>}
   {r.trackingCaptureDetail&&<div className='ux-track-manual-detail' title={String(r.trackingCaptureDetail)}><strong>Tracking details:</strong> {String(r.trackingCaptureDetail)}</div>}
   {r.trackingDetail&&<small title={String(r.trackingDetail)}>{String(r.trackingDetail).slice(0,160)}</small>}
   {r.trackingDeliveryDate&&<small>Latest carrier event: {String(r.trackingDeliveryDate)}</small>}
   {r.trackingCheckedAt&&<small>Worker checked {new Date(r.trackingCheckedAt).toLocaleString('en-IN')}</small>}
   {r.trackingCaptureAt&&<small>Screenshot {new Date(r.trackingCaptureAt).toLocaleString('en-IN')}</small>}
  </div>;
 }
 return <>
  <div className='ux-track-heading'>
   <Heading eyebrow='STAGE 05 · CARRIER STATUS' title='Dispatch Tracking'
    description='Transport: open the carrier site, capture evidence and manually enter the tracking result. Shree Maruti: use the existing approved worker.'/>
   <div className='ux-track-mode-tabs' role='group' aria-label='Tracking mode'>
    {(['Non-trackable','Shree Maruti','Transport'] as Mode[]).map(m=><button key={m} className={mode===m?'active':''} aria-pressed={mode===m} onClick={()=>{setMode(m);setStatusFilter('All');setTransporterFilter('All transporters')}}>{m}<span>{counts[m]}</span></button>)}
   </div>
  </div>
  <div className='ux-stats compact'>
   <Stat label='Carrier + LR ready' icon={Truck} value={rows.filter((r:any)=>r.transporter&&r.lr).length} note='Dispatch Tracking processes'/>
   <Stat label='Active worker requests' icon={Clock3} tone='orange' value={active.length} note='Queued or running'/>
   <Stat label='Verified delivered' icon={CheckCircle2} value={delivered} note='Worker-confirmed status only'/>
   <Stat label='Needs review' icon={AlertTriangle} tone='red' value={issues} note='Exceptions & manual results'/>
  </div>
  {mode==='Shree Maruti'&&<Panel title='Shree Maruti tracking worker' subtitle='Shree Maruti / ARHAM automated carrier lookups'>
   <div className='ux-outlook-worker'><div className={'ux-outlook-worker-dot '+(ready?'is-online':'')}/><div>
    <strong>{!online?'Offline — approved jobs remain queued':ready?'Connected — tracking worker ready':'Connected — tracking paused'}</strong>
    <small>{worker?.worker_name||'No worker registered'} · Last heartbeat {lastSeen}</small>
    <small>{workerError||'Only verified latest journey events update process status; the green progress marker is recorded for comparison. Each verified Shree Maruti result can have a private screenshot. No automatic retries or email sending.'}</small>
    {worker&&worker.details?.mode!=='shree_maruti_direct_screenshots_v3'&&<small className='ux-shree-update-note'>Tracking worker needs the latest direct-site adapter. Update the Windows worker to save screenshots for every verified status, including In Transit.</small>}
   </div></div>
   <div className='ux-shree-batch-controls'>
    <div><strong>Track all Shree Maruti IDs in this view</strong><small>{shreeBatch.length} eligible of {selected.length} visible record(s) · excludes delivered, incomplete and already queued jobs. Direct tracker: up to 20 AWBs per search; each verified result and screenshot belongs to its own Process No.</small></div>
    <div className='ux-shree-batch-actions'>
     <button type='button' className='ux-shree-visit' onClick={()=>window.open('https://tracking.shreemaruti.com/','_blank','noopener,noreferrer')}><ExternalLink size={16}/> Official tracker</button>
     <button type='button' disabled={busy||!p.authenticated||shreeBatch.length===0} onClick={()=>void p.onBatchTrackShreeMaruti(shreeBatch)}><Truck size={16}/> Track All ({shreeBatch.length})</button>
    </div>
   </div>
   <ShreeMarutiImport records={p.records} authenticated={p.authenticated} busy={busy} teamId={p.activeTeam||''} onImported={p.onRefresh}/>
  </Panel>}
  <Panel title='Dispatch tracking records' subtitle={mode==='Transport'?'Manual transport carriers · original process records and screenshots remain private':mode==='Shree Maruti'?'Shree Maruti approved automation':'Unsupported, local and non-trackable consignments'}>
   <div className='ux-track-search-toolbar'>
    <SearchBar value={search} onChange={setSearch} count={selected.length}/>
    <div className='ux-track-filter-line'>
     {mode==='Transport'&&<label>Tracking Transport
      <select aria-label='Tracking Transport' value={transporterFilter} onChange={e=>setTransporterFilter(e.target.value)}>
       <option>All transporters</option>{TRANSPORT_CARRIERS.map(carrier=><option key={carrier}>{carrier}</option>)}
      </select></label>}
     <label>Status
      <select aria-label='Filter tracking status' value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
       {['All','Pending','In Transit','Out for Delivery','Delivered','Undelivered','RTO','Returned','Cancelled','Delayed','Address Issue','Not Found','Needs Review'].map(status=><option key={status}>{status}</option>)}
      </select></label>
     <button className='ux-track-refresh' onClick={()=>{void refreshWorker();void p.onRefresh?.()}} disabled={loading||busy}><RefreshCw size={15}/> Refresh</button>
    </div>
   </div>
   {mode==='Transport'&&<div className='ux-track-guidance'><Camera size={17}/> Click <b>Track</b> to open the carrier's official site. A floating screenshot tool opens here in PJS; select the carrier tab in your browser's share picker, or upload a screenshot. Type the current tracking result yourself. A screenshot and manual entry are not carrier-worker verified.</div>}
   {mode==='Non-trackable'&&<div className='ux-track-guidance'>Non-trackable shipments remain available for manual review and transfer. Dedicated non-trackable workflow is the next phase.</div>}
   <div className='ux-tablewrap ux-track-desktop-table'><table className='ux-table ux-tracking-sheet'><thead><tr>
    <th>Process / Party</th><th>Carrier / LR</th><th>Carrier result</th><th>Transfer To.</th><th>Search Result · Track</th>
   </tr></thead><tbody>{selected.length?selected.map((r:any)=>{
    const latest=mostRecent(recent,r.id);
    return <tr key={r.id}><td><button className='ux-process-link' onClick={()=>onEdit(r)}>{r.process}</button><small>{r.party||'Party not recorded'}</small><small>{r.sales||'Sales person not recorded'} · {r.credit||'Credit type not recorded'}</small></td>
     <td><strong>{r.transporter||'No carrier'}</strong><small>LR {r.lr||'Not entered'}</small></td>
     <td>{statusSummary(r)}</td><td><div className='ux-track-transfer-cell'>{actionBar(r,'transfer')}</div></td>
     <td><div className='ux-track-search-cell'>{actionBar(r,'actions')}{mode==='Shree Maruti'&&latest&&['queued','running'].includes(latest.status)&&<small>{latest.status} · Tracking request</small>}</div></td>
    </tr>
   }):<tr><td colSpan={5}><Empty icon={Truck} title='No matching tracking records' help={rows.length?'Try another transporter or status filter.':mode==='Shree Maruti'?'Use Upload Excel above to create tracking processes, or move an existing process to Dispatch Tracking.':'Move a process to Dispatch Tracking after confirming the client email was sent.'}/></td></tr>}</tbody></table></div>
   <div className='ux-track-mobile-list'>{selected.length?selected.map((r:any)=><article key={r.id} className='ux-track-mobile-card'>
    <header><button onClick={()=>onEdit(r)}>{r.process}</button><strong>{r.transporter||'No transporter'}</strong></header>
    <p>{r.party||'Party not recorded'} · LR {r.lr||'Not entered'}</p><p>{r.sales||'Sales person not recorded'} · {r.credit||'Credit type not recorded'}</p>{statusSummary(r)}{actionBar(r)}
   </article>):<div className='ux-track-mobile-empty'>No matching tracking records.</div>}</div>
  </Panel>
  {capture&&<TransportTrackingCapture process={capture} onClose={()=>setCapture(null)} onSaved={()=>p.onRefresh?.()} onNotice={p.onNotice}/>}
 </>;
}
