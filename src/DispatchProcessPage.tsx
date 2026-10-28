import {ArrowRight,ClipboardList,Download,FileCheck2,FileText,Mail,Plus,Truck,Upload} from 'lucide-react';
import {Button,Empty,Heading,Panel,RecordsTable,SearchBar,Stat} from './UnifiedKit';
import EmailToClientWorkflow from './EmailToClientWorkflow';
import DispatchTrackingPage from './DispatchTrackingPage';
import {dispatchTabs,pendingDispatchRecords,type DispatchTab,type PendingView} from './siteNavigation';

export default function DispatchProcessPage({p}:{p:any}){
 const {results=[],records=[],search,setSearch,onImport,onNew,onEdit,onExport,onDonePick,onGoto,onStage,busy}=p;
 const active=p.dispatchTab as DispatchTab;
 const pending=pendingDispatchRecords(results);
 const allPending=pendingDispatchRecords(records);
 const emailCount=records.filter((r:any)=>r.stage==='Email to Client').length;
 const trackingCount=records.filter((r:any)=>r.stage==='Dispatch Tracking').length;
 const documents=p.pendingView==='documents';
 return <div className='oms-seven-page'>
  <Heading eyebrow='MODULE 02 / DATADOC DISPATCH'
   title='DataDoc · Dispatch Process'
   description='Three stages, one Process No. All dispatch work is manual. Process documents and tracking history stay with their original record.'
   actions={<Button onClick={p.onRefresh}><FileCheck2 size={16}/> Refresh records</Button>}/>
  <div className='oms-seven-stage-tabs' role='tablist' aria-label='Dispatch process stages'>
   {dispatchTabs.map(({id,title,description},i)=>{
    const Icon=i===0?ClipboardList:i===1?Mail:Truck;
    const count=i===0?allPending.length:i===1?emailCount:trackingCount;
    return <button type='button' key={id} role='tab' aria-selected={active===id}
      className={'oms-seven-stage-tab '+(active===id?'active':'')}
      onClick={()=>p.onDispatchTab(id)}>
      <span className='oms-seven-stage-icon'><Icon size={19}/></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <b>{count}</b>
     </button>;
   })}
  </div>
  {active==='pending'&&<>
   <div className='oms-seven-stats'>
    <Stat icon={ClipboardList} label='Pending dispatch' value={allPending.length} note='Unshipped intake / DataDoc records'/>
    <Stat icon={Mail} label='Email to Client' value={emailCount} note='Prepared for manual client email' tone='purple'/>
    <Stat icon={Truck} label='Tracking' value={trackingCount} note='Carrier updates are manual' tone='green'/>
   </div>
   <div className='oms-seven-subtabs' role='tablist' aria-label='Pending dispatch registers'>
    <button type='button' role='tab' aria-selected={!documents} className={!documents?'active':''} onClick={()=>p.onPendingView('work')}>Pending for Dispatch</button>
    <button type='button' role='tab' aria-selected={documents} className={documents?'active':''} onClick={()=>p.onPendingView('documents')}>All Process Documents</button>
   </div>
   {!documents?
    <Panel title='Pending for Dispatch' subtitle='Existing Universal Process and DataDoc intake records. Edit a process, attach files, or move it manually to the next stage.'
     actions={<div className='oms-seven-toolbar'>
      <Button onClick={onNew}><Plus size={15}/> New process</Button>
      <Button onClick={onImport} variant='primary'><Upload size={15}/> Upload Pick Slip</Button>
      <Button onClick={onDonePick}><FileCheck2 size={15}/> Done Pick List</Button>
     </div>}>
      <SearchBar value={search} onChange={setSearch} count={pending.length}/>
      {pending.length?<RecordsTable records={pending} onEdit={onEdit} renderAction={(r:any)=><>
       <Button onClick={()=>onEdit(r)}>Edit</Button>
       {r.stage!=='DataDoc'&&<Button disabled={busy} onClick={()=>void onStage(r,'DataDoc','Pending')}>Bill submit list</Button>}
       <Button variant='mint' disabled={busy} onClick={()=>void onStage(r,'Email to Client','Ready for Email')}>To Email <ArrowRight size={14}/></Button>
      </>}/>:<Empty icon={ClipboardList} title='No pending dispatch records' help='Import a Pick Slip or create a new process. Existing Email/Tracking records remain in their own tabs.'/>}
     </Panel>:
    <Panel title='All Process Documents' subtitle='Cross-stage master register. Open any process to manage its PDFs, invoices, email files or tracking screenshots.'
     actions={<div className='oms-seven-toolbar'><Button onClick={onExport}><Download size={15}/> Export CSV</Button><Button onClick={()=>onGoto('Check List')}>Check List</Button></div>}>
      <SearchBar value={search} onChange={setSearch} count={results.length}/>
      <RecordsTable records={results} onEdit={onEdit}/>
     </Panel>}
  </>}
  {active==='email'&&<EmailToClientWorkflow p={p}/>}
  {active==='tracking'&&<DispatchTrackingPage p={p}/>}
 </div>;
}
