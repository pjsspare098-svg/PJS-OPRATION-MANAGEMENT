import DispatchTrackingPage from './DispatchTrackingPage';
import {filterStage} from './workflowStages';
import EmailToClientWorkflow from './EmailToClientWorkflow';
import {Activity,ArrowRight,FileCheck2,PackageCheck} from 'lucide-react';
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
 const [tab,setTab]=useState<'Bill Submit'|'Delivery Proof'>('Bill Submit');
 const [status,setStatus]=useState('All');
 if(page==='DataDoc'){
  const billRows=filterStage(results,'DataDoc').filter((r:any)=>!hasAuditOnlyAutomationOutcome(jobs,r.id,'bill_submit'));
  const deliveryRows=results.filter((r:any)=>(normalizedStage(r)==='Delivery Proof'||(normalizedStage(r)==='Dispatch Tracking'&&trackingProofDocuments(r).length>0))&&!hasAuditOnlyAutomationOutcome(jobs,r.id,'delivery_proof_submit'));
  const list=billRows;
  return <><Heading eyebrow='STAGE 03 · DOCUMENT SUBMISSION' title='DataDoc Control' description='Active DataDoc work only. Successful submissions, failures and review cases are recorded in Audit & Reports.'/>
   <OfficeDataDocQueue authenticated={p.authenticated} records={results} threshold={settings.ebill_threshold}/><div className='ux-tabs'>{(['Bill Submit','Delivery Proof'] as const).map((t,i)=><button key={t} className={tab===t?'selected':''} onClick={()=>setTab(t)}>{t==='Bill Submit'?<FileCheck2 size={17}/>:<PackageCheck size={17}/>} {t} <b>{(t==='Bill Submit'?billRows:deliveryRows).length}</b></button>)}</div>
   <Panel title={tab==='Bill Submit'?'DataDoc Bill Submit':'DataDoc Tracking Proof'} subtitle={tab==='Delivery Proof'?'Choose a saved tracking screenshot, confirm Work/Time and salesperson, then approve a real DataDoc transaction for the authorized Windows proof worker.':'Invoice, optional E-Invoice and available E-Way Bill PDFs are bundled into ONE ZIP by the office worker. DataDoc receives this ZIP with the original bill transaction, not separate Add Docs uploads. Pick Slip, Party and SO remain informational.'} actions={tab==='Bill Submit'?<span className='ux-offline'><Activity size={14}/> OFFICE-ONLY DATA DOC QUEUE</span>:<span className='ux-offline'><Activity size={14}/> DATADOC PROOF · OFFICE-ONLY</span>}>
   {tab==='Delivery Proof'?<DataDocProofQueue p={p} rows={deliveryRows}/>:<RecordsTable records={list} onEdit={onEdit} renderAction={(r:any)=>{const type='bill_submit' as const;const rule=checkJob(r,type,settings,jobs);const billJobs=jobs.filter((j:any)=>j.process_id===r.id&&j.job_type==='bill_submit');const submitted=type==='bill_submit'&&billJobs.some((j:any)=>j.status==='completed');const queued=type==='bill_submit'&&billJobs.some((j:any)=>['queued','running'].includes(j.status));return <><span title={rule.missing.join('\n')} className={'ux-readiness-chip '+(rule.ready?'ready':'missing')}>{type==='bill_submit'?(rule.ready?'Ready'+(rule.warnings.length?' · Notes '+rule.warnings.length:''):'Waiting for bill details · '+rule.missing.length):(rule.ready?'Ready':'Missing '+rule.missing.length)}</span><Button onClick={()=>onEdit(r)}>Review</Button><Button variant='primary' disabled={busy||Boolean(submitted||queued)} onClick={()=>onQueue(r,type)}>{submitted?'Already submitted':queued?'Waiting for office PC':rule.ready?'Approve ZIP Bill Submit':'Queue request · wait for details'}</Button>{tab==='Bill Submit'&&<Button variant='mint' disabled={busy} onClick={()=>onStage(r,'Email to Client','Ready for Email')}>Move to Email <ArrowRight size={14}/></Button>}{(rule.missing.length>0||rule.warnings.length>0)&&<small style={{color:'#ad6c42',maxWidth:270,whiteSpace:'normal'}}>{type==='bill_submit'?'Information only · ':''}{[...rule.missing,...rule.warnings].slice(0,3).join(', ')}{rule.missing.length+rule.warnings.length>3?'…':''}</small>}</>}}/>}</Panel></>;
 }
 if(page==='Email to Client')return <EmailToClientWorkflow p={p}/>;
 if(page==='Dispatch Tracking')return <DispatchTrackingPage p={p}/>;

 return null;
}
