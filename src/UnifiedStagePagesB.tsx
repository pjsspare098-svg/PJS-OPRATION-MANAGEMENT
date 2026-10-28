import {AlertTriangle,BarChart3,Camera,FileSpreadsheet,Settings2} from 'lucide-react';
import {Heading} from './UnifiedKit';
import ExcelLRWorkspace from './ExcelLRWorkspace';
import TransportBillWorkflow from './TransportBillWorkflow';
import DonePickListPage from './DonePickListPage';
import ExceptionDesk from './ExceptionDesk';
import SettingsControlCenter from './SettingsControlCenter';
import AuditCleanupPage from './AuditCleanupPage';

export default function UnifiedStagePagesB({page,p}:{page:string;p:any}){
 const {results,records,authenticated,exceptions,onReportException,onResolveException,onEdit,onStage,busy}=p;
 if(page==='Check List')return <div className='oms-seven-page'>
  <Heading eyebrow='MODULE 04 / CHECK LIST' title='Check List'
    description='Manage missing documents, dispatch exceptions, returns and Done Pick List photos. Each case remains linked to its Process No.'/>
  <div className='oms-seven-subtabs' role='tablist' aria-label='Checklist sections'>
   <button type='button' role='tab' aria-selected={p.checkTab==='exceptions'} className={p.checkTab==='exceptions'?'active':''}
    onClick={()=>p.onCheckTab('exceptions')}><AlertTriangle size={15}/> Pending & Exceptions</button>
   <button type='button' role='tab' aria-selected={p.checkTab==='done'} className={p.checkTab==='done'?'active':''}
    onClick={()=>p.onCheckTab('done')}><Camera size={15}/> Done Pick List</button>
  </div>
  {p.checkTab==='done'?
   <DonePickListPage records={records} authenticated={authenticated}/>:
   <ExceptionDesk records={results} exceptions={exceptions} onEdit={onEdit} onReport={onReportException}
    onResolve={onResolveException} onReturn={r=>onStage(r,'Dispatch Tracking','Pending')} busy={busy}/>}
 </div>;
 if(page==='Transport Bill')return <div className='oms-seven-page'>
  <Heading eyebrow='MODULE 06 / TRANSPORT ACCOUNTS' title='Transport Bill'
   description='Reconcile transporter invoices by LR / Docket number against the existing PJS process and sales register. Review every match before export.'/>
  <TransportBillWorkflow records={records}/>
  <ExcelLRWorkspace records={records}/>
 </div>;
 if(page==='Settings')return <div className='oms-seven-page'>
  <div className='oms-seven-subtabs' role='tablist' aria-label='Settings and historical audit'>
   <button type='button' role='tab' aria-selected={p.settingsTab==='preferences'} className={p.settingsTab==='preferences'?'active':''}
    onClick={()=>p.onSettingsTab('preferences')}><Settings2 size={15}/> Settings</button>
   <button type='button' role='tab' aria-selected={p.settingsTab==='audit'} className={p.settingsTab==='audit'?'active':''}
    onClick={()=>p.onSettingsTab('audit')}><BarChart3 size={15}/> Audit & History</button>
  </div>
  {p.settingsTab==='audit'?<AuditCleanupPage p={p}/>:<SettingsControlCenter p={p}/>}
 </div>;
 return null;
}
