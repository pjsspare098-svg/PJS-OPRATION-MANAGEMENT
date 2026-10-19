import './transport-tracking.css';
import {useMemo,useState} from 'react';
import {
 AlertTriangle,Camera,CheckCircle2,ClipboardCheck,ExternalLink,
 FileImage,RefreshCw,Truck
} from 'lucide-react';
import {cloud} from './cloud';
import {filterStage} from './workflowStages';
import {Empty,Heading,Panel,SearchBar,Stat,Tone} from './UnifiedKit';
import type {Job} from './unifiedOps';
import {TRANSPORT_CARRIERS} from './transportTracking';
import {
 displayedTrackingResult,manualCarrierName,manualCarrierUrl,
 hasTrackingProof
} from './manualDispatchTracking';
import TransportTrackingCapture from './TransportTrackingCapture';
import ShreeMarutiImport from './ShreeMarutiImport';

type Tab='Trackable'|'Non-trackable';
const statusOptions=[
 'All','Pending','Needs Review','In Transit','Out for Delivery','Delivered',
 'Undelivered','RTO','Returned','Cancelled','Delayed','Address Issue','Not Found'
];
const isException=(status:string)=>/undelivered|rto|return|cancel|delay|address issue|not found|needs review|error/i.test(status);

export default function DispatchTrackingPage({p}:{p:any}){
 const {results=[],jobs=[],busy,onEdit,onStage,search,setSearch}=p;
 const [tab,setTab]=useState<Tab>('Trackable');
 const [carrierFilter,setCarrierFilter]=useState('All carriers');
 const [statusFilter,setStatusFilter]=useState('All');
 const [transfers,setTransfers]=useState<Record<string,string>>({});
 const [capture,setCapture]=useState<any|null>(null);
 const rows=filterStage(results,'Dispatch Tracking');
 const counts={
  Trackable:rows.filter((r:any)=>Boolean(manualCarrierUrl(r.transporter))).length,
  'Non-trackable':rows.filter((r:any)=>!manualCarrierUrl(r.transporter)).length,
 };
 const selected=rows.filter((r:any)=>{
  const carrier=manualCarrierName(r.transporter);
  if(tab==='Trackable'&&!carrier)return false;
  if(tab==='Non-trackable'&&carrier)return false;
  if(carrierFilter!=='All carriers'&&carrier!==carrierFilter)return false;
  const status=displayedTrackingResult(r).status;
  return statusFilter==='All'||status.toLowerCase()===statusFilter.toLowerCase();
 });
 const manualSaved=rows.filter((r:any)=>displayedTrackingResult(r).source==='manual').length;
 const manualDelivered=rows.filter((r:any)=>{
  const display=displayedTrackingResult(r);
  return display.source==='manual'&&display.status==='Delivered';
 }).length;
 const needsReview=rows.filter((r:any)=>isException(displayedTrackingResult(r).status)).length;
 const legacyActive=useMemo(()=>jobs.filter((j:Job)=>j.job_type==='tracking'
  &&['queued','running'].includes(j.status)),[jobs]);

 function latestScreenshot(r:any){
  const files=(r.documents||[]).filter((d:any)=>d.kind==='trackingShotDoc');
  const manualDocumentId=String(r.trackingCaptureDocumentId||'');
  if(manualDocumentId){
   const manual=files.find((d:any)=>d.id===manualDocumentId);
   if(manual)return manual;
  }
  return files.sort((a:any,b:any)=>Date.parse(b.uploadedAt||b.created_at||'')-Date.parse(a.uploadedAt||a.created_at||''))[0];
 }
 function openCarrier(r:any){
  const url=manualCarrierUrl(r.transporter);
  if(!url){p.onNotice?.('No official tracking website configured for this transporter. Review its name first.');return}
  // Direct user click opens the carrier tab; no Selenium, API lookup or queue.
  const opened=window.open(url,'_blank','noopener,noreferrer');
  if(!opened)p.onNotice?.('If the carrier page did not open, allow browser pop-ups for PJS.');
  if(r.lr&&navigator.clipboard?.writeText)void navigator.clipboard.writeText(String(r.lr)).catch(()=>{});
  setCapture(r);
 }
 async function openScreenshot(r:any){
  const document=latestScreenshot(r);
  if(!document)return;
  try{await cloud.open(r.id,document.id)}
  catch(e:any){p.onError?.(e?.message||'Unable to open the private tracking screenshot.')}
 }
 function transfer(r:any){
  const destination=transfers[r.id];
  if(destination!=='Check List'&&destination!=='DataDoc')return;
  if(!window.confirm('Move Process '+r.process+' to '+(destination==='DataDoc'?'DataDoc Submit':destination)
    +'?\n\nThe screenshot and manually recorded tracking result stay in the process. No carrier check, DataDoc submission or delivery confirmation will be started.'))return;
  void onStage(r,destination,destination==='Check List'?'Needs Review':'Pending');
 }
 function controls(r:any,kind:'all'|'transfer'|'actions'='all'){
  const url=manualCarrierUrl(r.transporter);
  const evidence=latestScreenshot(r);
  const owner=!r.owner_id||r.owner_id===p.userId;
  return <div className='ux-track-row-controls'>
   {(kind==='all'||kind==='transfer')&&<div className='ux-track-transfer'>
    <select aria-label={'Transfer destination for '+r.process} value={transfers[r.id]||''}
     disabled={busy} onChange={e=>setTransfers(v=>({...v,[r.id]:e.target.value}))}>
     <option value=''>Transfer to…</option>
     <option value='Check List'>Check List</option>
     <option value='DataDoc'>DataDoc Submit</option>
    </select>
    <button disabled={busy||!transfers[r.id]} onClick={()=>transfer(r)}>Transfer</button>
   </div>}
   {(kind==='all'||kind==='actions')&&<div className='ux-track-result-actions'>
    {evidence?<button className='ux-track-proof' onClick={()=>void openScreenshot(r)}>
     <FileImage size={14}/> Search result
    </button>:<span className='ux-track-none'>No screenshot</span>}
    {url?<button className='ux-track-go' disabled={!owner||!p.authenticated||busy}
     onClick={()=>openCarrier(r)}><ExternalLink size={15}/> Track</button>
     :<button className='ux-track-go' onClick={()=>onEdit(r)}>Edit carrier</button>}
    <button className='ux-track-capture' disabled={!owner||!p.authenticated||busy||!url}
     onClick={()=>setCapture(r)}><Camera size={15}/> Capture</button>
   </div>}
  </div>;
 }
 function statusSummary(r:any){
  const display=displayedTrackingResult(r);
  return <div className='ux-track-status'>
   <Tone value={display.status}/>
   {display.source==='manual'&&<div className='ux-track-unverified'>
    <AlertTriangle size={12}/> Manual status · Not carrier-worker verified
   </div>}
   {display.source==='worker'&&<small>Historical worker result · New updates are manual</small>}
   {display.detail&&<div className='ux-track-manual-detail'><strong>Tracking details:</strong> {display.detail}</div>}
   {display.source==='manual'&&r.trackingCaptureAt&&<small>Saved {new Date(r.trackingCaptureAt).toLocaleString('en-IN')}</small>}
   {display.source==='worker'&&r.trackingDeliveryDate&&<small>Carrier event: {String(r.trackingDeliveryDate)}</small>}
   {hasTrackingProof(r)&&<small>Private tracking screenshot saved with this process</small>}
  </div>;
 }

 return <>
  <div className='ux-track-heading'>
   <Heading eyebrow='STAGE 05 · MANUAL CARRIER STATUS' title='Dispatch Tracking'
    description='One tracking workflow for Shree Maruti and all transporters: open the official carrier website, check the LR, capture or upload a screenshot, enter the status and save it to its Process No.'/>
   <div className='ux-track-mode-tabs' role='group' aria-label='Tracking category'>
    {(['Trackable','Non-trackable'] as Tab[]).map(mode=>
     <button key={mode} className={tab===mode?'active':''} aria-pressed={tab===mode}
      onClick={()=>{setTab(mode);setStatusFilter('All');setCarrierFilter('All carriers')}}>
      {mode}<span>{counts[mode]}</span>
     </button>)}
   </div>
  </div>
  <div className='ux-stats compact'>
   <Stat label='Tracking IDs ready' icon={Truck}
    value={rows.filter((r:any)=>manualCarrierUrl(r.transporter)&&r.lr).length}
    note='Official carrier website available'/>
   <Stat label='Manual results saved' icon={ClipboardCheck} value={manualSaved}
    note='Operator-entered statuses'/>
   <Stat label='Manually recorded delivered' icon={CheckCircle2} value={manualDelivered}
    note='Not automatically verified'/>
   <Stat label='Needs review' icon={AlertTriangle} tone='red' value={needsReview}
    note='Delivery exceptions and manual review'/>
  </div>
  <div className='ux-track-guidance ux-manual-tracking-banner'>
   <Camera size={18}/>
   <div><strong>Manual carrier tracking only</strong>
    <span>Click Track to open the official courier website, check the tracking ID,
     then Capture or Upload Screenshot. Select the status and enter journey details.
     Nothing is auto-tracked or queued from this page.</span>
   </div>
  </div>
  {legacyActive.length>0&&<div className='ux-track-guidance ux-track-legacy-notice'>
   <AlertTriangle size={17}/>
   {legacyActive.length} older tracking job(s) still have queued/Running status.
   They remain in Audit &amp; Reports for separate, safe review. This manual page does not restart them.
   <button type='button' onClick={()=>p.onGoto?.('Audit & Reports')}>Open Audit &amp; Reports</button>
  </div>}
  {tab==='Trackable'&&<Panel title='Excel tracking import · Shree Maruti'
   subtitle='Keep the existing four-column Shree Maruti Excel upload; newly imported records appear in this same manual tracking table.'>
   <ShreeMarutiImport records={p.records} authenticated={p.authenticated} busy={busy}
    teamId={p.activeTeam||''} onImported={p.onRefresh}/>
  </Panel>}
  <Panel title='Dispatch tracking records'
   subtitle={tab==='Trackable'?'Shree Maruti and other transporters together · Manual status and screenshot per Process No.':'Non-trackable shipments · update the transporter to use manual tracking'}>
   <div className='ux-track-search-toolbar'>
    <SearchBar value={search} onChange={setSearch} count={selected.length}/>
    <div className='ux-track-filter-line'>
     {tab==='Trackable'&&<label>Transporter
      <select aria-label='Filter tracking carrier' value={carrierFilter}
       onChange={e=>setCarrierFilter(e.target.value)}>
       <option>All carriers</option>
       {['SHREE MARUTI',...TRANSPORT_CARRIERS].map(carrier=><option key={carrier}>{carrier}</option>)}
      </select>
     </label>}
     <label>Status
      <select aria-label='Filter tracking status' value={statusFilter}
       onChange={e=>setStatusFilter(e.target.value)}>
       {statusOptions.map(status=><option key={status}>{status}</option>)}
      </select>
     </label>
     <button className='ux-track-refresh' disabled={busy} onClick={()=>void p.onRefresh?.()}>
      <RefreshCw size={15}/> Refresh
     </button>
    </div>
   </div>
   <div className='ux-tablewrap ux-track-desktop-table'>
    <table className='ux-table ux-tracking-sheet'><thead><tr>
     <th>Process / Party</th><th>Transporter / LR</th><th>Tracking result</th>
     <th>Transfer To.</th><th>Search Result · Track · Capture</th>
    </tr></thead><tbody>
     {selected.length?selected.map((r:any)=><tr key={r.id}>
      <td><button className='ux-process-link' onClick={()=>onEdit(r)}>{r.process}</button>
       <small>{r.party||'Party not recorded'}</small>
       <small>{r.sales||'Sales person not recorded'} · {r.credit||'Credit type not recorded'}</small>
      </td>
      <td><strong>{r.transporter||'No carrier'}</strong><small>LR {r.lr||'Not entered'}</small></td>
      <td>{statusSummary(r)}</td>
      <td><div className='ux-track-transfer-cell'>{controls(r,'transfer')}</div></td>
      <td><div className='ux-track-search-cell'>{controls(r,'actions')}</div></td>
     </tr>):<tr><td colSpan={5}><Empty icon={Truck} title='No matching tracking records'
      help={tab==='Trackable'?'Import a Shree Maruti Excel file or move a process to Dispatch Tracking.':'Choose a valid carrier in the process record to begin manual tracking.'}/>
     </td></tr>}
    </tbody></table>
   </div>
   <div className='ux-track-mobile-list'>
    {selected.length?selected.map((r:any)=><article key={r.id} className='ux-track-mobile-card'>
     <header><button onClick={()=>onEdit(r)}>{r.process}</button>
      <strong>{r.transporter||'No transporter'}</strong></header>
     <p>{r.party||'Party not recorded'} · LR {r.lr||'Not entered'}</p>
     <p>{r.sales||'Sales person not recorded'} · {r.credit||'Credit type not recorded'}</p>
     {statusSummary(r)}{controls(r)}
    </article>):<div className='ux-track-mobile-empty'>No matching tracking records.</div>}
   </div>
  </Panel>
  {capture&&<TransportTrackingCapture process={capture} onClose={()=>setCapture(null)}
   onSaved={()=>p.onRefresh?.()} onNotice={p.onNotice}/>}
 </>;
}
