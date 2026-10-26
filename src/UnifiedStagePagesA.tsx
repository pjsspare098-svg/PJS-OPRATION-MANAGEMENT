import DispatchTrackingPage from './DispatchTrackingPage';
import {filterStage,normalizedStage} from './workflowStages';
import EmailToClientWorkflow from './EmailToClientWorkflow';
import {ArrowRight,FileImage,FileText,PackageCheck} from 'lucide-react';
import {Button,Empty,Heading,Panel,RecordsTable} from './UnifiedKit';
import {useState} from 'react';
import {cloud} from './cloud';
import {trackingProofDocuments} from './datadocProofRules.ts';

export default function UnifiedStagePagesA({page,p}:{page:string;p:any}){
 const {results,onEdit,onStage,busy}=p;
 const [tab,setTab]=useState<'Bills'|'Saved tracking proof'>('Bills');
 if(page==='DataDoc'){
  // Manual-only foundation: preserve all processes, documents and recorded status.
  // Never enqueue a bill or tracking-proof submission from this page.
  const billRows=filterStage(results,'DataDoc');
  const proofRows=results.filter((r:any)=>normalizedStage(r)==='Delivery Proof'||
    (normalizedStage(r)==='Dispatch Tracking'&&trackingProofDocuments(r).length>0));
  return <>
   <Heading eyebrow='STAGE 03 · MANUAL DOCUMENT WORK'
    title='DataDoc'
    description='Review invoice details, open source documents and record work manually. PJS OMS does not submit DataDoc transactions or start office workers.'/>
   <div className='ux-tabs' role='tablist' aria-label='DataDoc manual registers'>
    <button type='button' role='tab' aria-selected={tab==='Bills'} className={tab==='Bills'?'selected':''} onClick={()=>setTab('Bills')}><FileText size={16}/> Bills <b>{billRows.length}</b></button>
    <button type='button' role='tab' aria-selected={tab==='Saved tracking proof'} className={tab==='Saved tracking proof'?'selected':''} onClick={()=>setTab('Saved tracking proof')}><PackageCheck size={16}/> Saved tracking proof <b>{proofRows.length}</b></button>
   </div>
   {tab==='Bills'?
    <Panel title='DataDoc processes' subtitle='No automation or worker queue. Review the record and complete any DataDoc portal work manually.'>
     {billRows.length?
      <RecordsTable records={billRows} onEdit={onEdit}
       renderAction={(r:any)=><>
        <Button onClick={()=>onEdit(r)}>Edit details</Button>
        <Button variant='mint' disabled={busy} onClick={()=>void onStage(r,'Email to Client','Ready for Email')}>Move to Email <ArrowRight size={14}/></Button>
       </>}/>
      :<Empty icon={FileText} title='No processes at DataDoc' help='Transfer a process here manually from Universal Process.'/>}
    </Panel>:
    <Panel title='Saved tracking evidence' subtitle='Screenshots remain linked to their original Process No. Review them without creating DataDoc submission jobs.'>
     {proofRows.length?proofRows.map((r:any)=><div className='ux-manual-proof-row' key={r.id}>
      <div><strong>Process {r.process}</strong><small>{r.party||'Party not recorded'} · {r.transporter||'Transporter pending'} · LR {r.lr||'—'}</small></div>
      <div className='ux-manual-proof-actions'>
       <Button onClick={()=>onEdit(r)}>Edit</Button>
       {trackingProofDocuments(r).map((doc:any)=>
        <Button key={doc.id} onClick={()=>void cloud.open(r.id,doc.id).catch((e:any)=>p.onError?.(e?.message||'Could not open screenshot'))}><FileImage size={14}/> Open screenshot</Button>)}
      </div>
     </div>):<Empty icon={FileImage} title='No saved tracking screenshots' help='Capture tracking evidence manually in Dispatch Tracking.'/>}
    </Panel>}
  </>;
 }
 if(page==='Email to Client')return <EmailToClientWorkflow p={p}/>;
 if(page==='Dispatch Tracking')return <DispatchTrackingPage p={p}/>;
 return null;
}
