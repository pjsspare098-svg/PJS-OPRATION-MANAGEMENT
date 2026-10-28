import DispatchTrackingPage from './DispatchTrackingPage';
import {filterStage} from './workflowStages';
import EmailToClientWorkflow from './EmailToClientWorkflow';
import {Activity,ArrowRight,FileCheck2,Mail,PackageCheck} from 'lucide-react';
import {Button,Heading,Panel,RecordsTable} from './UnifiedKit';
import {checkJob} from './businessRules';
import {useState} from 'react';
import OfficeDataDocQueue from './OfficeDataDocQueue';
import DataDocProofQueue from './DataDocProofQueue';
import {trackingProofDocuments} from './datadocProofRules.ts';
import {normalizedStage} from './workflowStages';
import {hasAuditOnlyAutomationOutcome} from './jobVisibility';
export default function UnifiedStagePagesA({page,p}:{page:string;p:any}){
 const {results,jobs,onEdit,onStage,onQueue,busy,settings}=p;
 const [tab,setTab]=useState<'Bill Submit'|'Emails'|'Delivery Proof'>('Bill Submit');
 const [status,setStatus]=useState('All');
 if(page==='DataDoc')return <><Heading eyebrow='STAGE 03 · DOCUMENT SUBMISSION' title='DataDoc Process Register' description='Review existing DataDoc documents and processes manually. No agent or automated submission runs from this page.'/>
 <Panel title='Manual DataDoc Review' subtitle='Open a process, verify its invoice and attachments, then complete the transaction in DataDoc yourself.'><RecordsTable records={results.filter((r:any)=>filterStage([r],'DataDoc').length>0)} onEdit={onEdit} renderAction={(r:any)=><Button onClick={()=>onEdit(r)}>Open process</Button>}/></Panel></>;
 if(page==='Email to Client')return <EmailToClientWorkflow p={p}/>;
 if(page==='Dispatch Tracking')return <DispatchTrackingPage p={p}/>;

 return null;
}
