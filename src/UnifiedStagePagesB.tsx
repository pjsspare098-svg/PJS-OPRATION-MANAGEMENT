import {Activity,CheckCircle2,Download,FileClock} from 'lucide-react';
import {Button,Empty,Heading,Panel,Tone} from './UnifiedKit';
import ExcelLRWorkspace from './ExcelLRWorkspace';
import DonePickListPage from './DonePickListPage';
import AgentCommandCenter from './AgentCommandCenter';
import ExceptionDesk from './ExceptionDesk';
import {showDate} from './unifiedOps';
import {useState} from 'react';
import SettingsControlCenter from './SettingsControlCenter';
export default function UnifiedStagePagesB({page,p}:{page:string;p:any}){
 const {results,records,authenticated,events,jobs,exceptions,onReportException,onResolveException,onEdit,onStage,onExport,busy,demo}=p;
 const [jobFilter,setJobFilter]=useState<'All'|'Active'|'Successful'|'Errors'|'Cancelled'>('All');
 const auditJobs=(jobs||[]).filter((j:any)=>jobFilter==='All'||(jobFilter==='Active'&&['queued','running'].includes(j.status))||(jobFilter==='Successful'&&j.status==='completed')||(jobFilter==='Errors'&&j.status==='failed')||(jobFilter==='Cancelled'&&j.status==='cancelled'));
 const jobFilters=['All','Active','Successful','Errors','Cancelled'] as const;
 if(page==='Done Pick List')return <DonePickListPage records={records} authenticated={authenticated}/>;
 if(page==='Check List')return <><Heading eyebrow='EXCEPTION MANAGEMENT' title='Check List' description='Document failed deliveries, missing paperwork and returns. Each case needs an auditable written resolution.'/><ExceptionDesk records={results} exceptions={exceptions} onEdit={onEdit} onReport={onReportException} onResolve={onResolveException} onReturn={r=>onStage(r,'Dispatch Tracking','Pending')} busy={busy}/></>;
 if(page==='Excel & LR Finder')return <><Heading eyebrow='DOCUMENT INTELLIGENCE' title='Excel & LR Finder' description='Read courier bills, extract LR / Docket numbers, and match them with stored PJS process records.'/><ExcelLRWorkspace records={records}/></>;
 if(page==='AI Command Center')return <AgentCommandCenter records={records} authenticated={authenticated} onEdit={onEdit} onRefresh={p.onRefresh} onMove={p.onAgentMove}/>;
 if(page==='Audit & Reports')return <><Heading eyebrow='OPERATIONS INTELLIGENCE' title='Audit & Reports' description='Complete automation history: successful, failed, cancelled and active jobs are recorded here; finished results are not shown in operational queues.' actions={<Button onClick={onExport}><Download size={16}/> Export CSV</Button>}/>
  <div className='ux-two-col'>
   <Panel title='Recent workflow activity' subtitle={demo?'Cloud audit is unavailable in local mode.':'Cloud events from process changes.'}>
    {events.length?<div className='ux-event-list'>{events.slice(0,35).map((e:any)=><div className='ux-event' key={e.id}><span><CheckCircle2 size={15}/></span><div><strong>{e.action}</strong><small>Process {e.process_no||'—'} · {showDate(e.created_at)}</small></div></div>)}</div>:<Empty icon={FileClock} title='No activity yet' help='Create or edit a process to start the cloud audit trail.'/>}
   </Panel>
   <Panel title='Automation history' subtitle='Finished submissions, errors and manual review details are retained for audit. These entries are never automatically requeued.' actions={<span className='ux-offline'>AUDIT HISTORY</span>}>
    <div className='ux-tabs' role='group' aria-label='Filter audit jobs'>
     {jobFilters.map(filter=><button type='button' key={filter} className={jobFilter===filter?'selected':''} aria-pressed={jobFilter===filter} onClick={()=>setJobFilter(filter)}>{filter}<b>{filter==='All'?jobs.length:jobs.filter((j:any)=>filter==='Active'?['queued','running'].includes(j.status):filter==='Successful'?j.status==='completed':filter==='Errors'?j.status==='failed':j.status==='cancelled').length}</b></button>)}
    </div>
    {auditJobs.length?<div className='ux-job-list'>{auditJobs.slice(0,100).map((j:any)=><div className='ux-job' key={j.id}>
      <div><strong>{String(j.job_type).replaceAll('_',' ')}</strong><small>Process {j.process_no||'—'} · {new Date(j.updated_at||j.created_at).toLocaleString('en-IN')}</small></div>
      <Tone value={j.status}/>
      {j.error_message&&<small className='ux-warning'>{j.error_message}</small>}
      {typeof j.result?.detail==='string'&&j.result.detail&&<small>{j.result.detail}</small>}
     </div>)}</div>:<Empty icon={Activity} title='No matching automation jobs' help='Change the status filter to review other job history.'/>}
   </Panel>
  </div></>;
 if(page==='Settings')return <SettingsControlCenter p={p}/>;
 return null;
}
