import DispatchTrackingPage from './DispatchTrackingPage';
import {filterStage} from './workflowStages';
import EmailToClientWorkflow from './EmailToClientWorkflow';
import {Activity,AlertCircle,AlertTriangle,ArrowRight,ClipboardCheck,FileCheck2,FileUp,Mail,PackageCheck,RefreshCw,Search,Truck,Upload} from 'lucide-react';
import {Button,Empty,Heading,Panel,RecordsTable,SearchBar,Stat,Tone} from './UnifiedKit';
import {readyForBill} from './unifiedOps';
import {checkBill,checkJob} from './businessRules';
import {useState} from 'react';
import OfficeDataDocQueue from './OfficeDataDocQueue';
export default function UnifiedStagePagesA({page,p}:{page:string;p:any}){
 const {results,records,jobs,onEdit,onGoto,onStage,onQueue,onAttach,onDraftEmail,search,setSearch,busy,settings}=p;
 const [tab,setTab]=useState<'Bill Submit'|'Emails'|'Delivery Proof'>('Bill Submit');
 const [status,setStatus]=useState('All');
 if(page==='DataDoc'){
  const billRows=filterStage(results,'DataDoc');
  const emailRows=filterStage(results,'DataDoc');
  const deliveryRows=filterStage(results,'Delivery Proof');
  const list=tab==='Bill Submit'?billRows:tab==='Emails'?emailRows:deliveryRows;
  return <><Heading eyebrow='STAGE 03 · DOCUMENT SUBMISSION' title='DataDoc Control' description='Only processes explicitly moved to DataDoc are shown here. Approved bill jobs run when the authorized Windows worker is connected and enabled.'/>
   <OfficeDataDocQueue authenticated={p.authenticated}/><div className='ux-tabs'>{(['Bill Submit','Emails','Delivery Proof'] as const).map((t,i)=><button key={t} className={tab===t?'selected':''} onClick={()=>setTab(t)}>{i===0?<FileCheck2 size={17}/>:i===1?<Mail size={17}/>:<PackageCheck size={17}/>} {t} <b>{(i===0?billRows:i===1?emailRows:deliveryRows).length}</b></button>)}</div>
   <Panel title={tab==='Bill Submit'?'DataDoc Bill Submit':tab==='Emails'?'DataDoc Email Submit':'DataDoc Tracking Proof'} subtitle={'Invoice, E-Invoice and E-Way Bill are ONLY needed for DataDoc Bill Submit. Move to Email works independently, without these documents. E-Way Bill threshold ₹'+settings.ebill_threshold+'.'} actions={tab==='Bill Submit'?<span className='ux-offline'><Activity size={14}/> OFFICE-ONLY DATA DOC QUEUE</span>:<span className='ux-offline'><Activity size={14}/> ADAPTER NOT CONNECTED</span>}>
   <RecordsTable records={list} onEdit={onEdit} renderAction={(r:any)=>{const type=tab==='Bill Submit'?'bill_submit':tab==='Emails'?'datadoc_submit':'delivery_proof_submit';const rule=checkJob(r,type,settings,jobs);const billJobs=jobs.filter((j:any)=>j.process_id===r.id&&j.job_type==='bill_submit');const submitted=type==='bill_submit'&&billJobs.some((j:any)=>j.status==='completed');const queued=type==='bill_submit'&&billJobs.some((j:any)=>['queued','running'].includes(j.status));return <><span title={rule.missing.join('\n')} className={'ux-readiness-chip '+(rule.ready?'ready':'missing')}>{rule.ready?'Ready':'Missing '+rule.missing.length}</span><Button onClick={()=>onEdit(r)}>Review</Button><Button variant='primary' disabled={!rule.ready||busy||Boolean(submitted||queued)} onClick={()=>onQueue(r,type)}>{tab==='Bill Submit'?(submitted?'Already submitted':queued?'Waiting for office PC':'Approve & queue for office PC'):'Queue request'}</Button>{tab==='Bill Submit'&&<Button variant='mint' disabled={busy} onClick={()=>onStage(r,'Email to Client','Ready for Email')}>Move to Email <ArrowRight size={14}/></Button>}{!rule.ready&&<small style={{color:'#ad6c42',maxWidth:270,whiteSpace:'normal'}}>{rule.missing.slice(0,3).join(', ')}{rule.missing.length>3?'…':''}</small>}</>}}/></Panel></>;
 }
 if(page==='Email to Client')return <EmailToClientWorkflow p={p}/>;
 if(page==='Dispatch Tracking')return <DispatchTrackingPage p={p}/>;

 return null;
}
