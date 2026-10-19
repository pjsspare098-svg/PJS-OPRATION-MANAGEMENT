import {Heading} from './UnifiedKit';
import ExcelLRWorkspace from './ExcelLRWorkspace';
import DonePickListPage from './DonePickListPage';
import AgentCommandCenter from './AgentCommandCenter';
import ExceptionDesk from './ExceptionDesk';
import SettingsControlCenter from './SettingsControlCenter';
import AuditCleanupPage from './AuditCleanupPage';

export default function UnifiedStagePagesB({page,p}:{page:string;p:any}){
 const {results,records,authenticated,exceptions,onReportException,onResolveException,onEdit,onStage,busy}=p;
 if(page==='Done Pick List')return <DonePickListPage records={records} authenticated={authenticated}/>;
 if(page==='Check List')return <>
  <Heading eyebrow='EXCEPTION MANAGEMENT' title='Check List'
    description='Document failed deliveries, missing paperwork and returns. Each case needs an auditable written resolution.'/>
  <ExceptionDesk records={results} exceptions={exceptions} onEdit={onEdit} onReport={onReportException}
    onResolve={onResolveException} onReturn={r=>onStage(r,'Dispatch Tracking','Pending')} busy={busy}/>
 </>;
 if(page==='Excel & LR Finder')return <>
  <Heading eyebrow='DOCUMENT INTELLIGENCE' title='Excel & LR Finder'
    description='Read courier bills, extract LR / Docket numbers, and match them with stored PJS process records.'/>
  <ExcelLRWorkspace records={records}/>
 </>;
 if(page==='AI Command Center')return <AgentCommandCenter records={records} authenticated={authenticated}
  onEdit={onEdit} onRefresh={p.onRefresh} onMove={p.onAgentMove}/>;
 if(page==='Audit & Reports')return <AuditCleanupPage p={p}/>;
 if(page==='Settings')return <SettingsControlCenter p={p}/>;
 return null;
}
