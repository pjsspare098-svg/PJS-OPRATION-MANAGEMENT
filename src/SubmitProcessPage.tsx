import {useMemo,useState} from 'react';
import {AlertTriangle,CheckCheck,ClipboardCheck,FileCheck2,FileText,Mail,Search,ShieldCheck,Truck} from 'lucide-react';
import {Button,Empty,Heading,Tone} from './UnifiedKit';
import {creditCategory,manualSubmitFields,submitRecords,submitTabs,type SubmitTab} from './siteNavigation';
import {missingSubmissionRequirements} from './manualSubmitRules';
import {showDate} from './unifiedOps';
import {cloud} from './cloud';

type CreditFilter='All'|'Credit'|'Non Credit'|'Unknown';
export default function SubmitProcessPage({p}:{p:any}){
 const {results=[],records=[],userId,authenticated,demo,busy,onEdit,onMarkManualSubmit}=p;
 const active=p.submitTab as SubmitTab;
 const [credit,setCredit]=useState<CreditFilter>('All');
 const [query,setQuery]=useState('');
 const [references,setReferences]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState('');
 const [error,setError]=useState('');
 const rows=useMemo(()=>{
  const q=query.toLowerCase().trim();
  return submitRecords(results,active).filter((r:any)=>
   (credit==='All'||creditCategory(r.credit)===credit)&&
   (!q||[r.process,r.party,r.so,r.invoice,r.sales,r.transporter,r.lr].some(x=>String(x||'').toLowerCase().includes(q)))
  );
 },[results,active,credit,query]);
 const counts=useMemo(()=>Object.fromEntries(submitTabs.map(tab=>[tab.id,submitRecords(records,tab.id).length])),[records]);
 async function mark(record:any){
  if(busy||saving||!authenticated||demo)return;
  const missing=missingSubmissionRequirements(record,active);
  if(missing.length){setError('Process '+record.process+' needs review: '+missing.join(', '));return}
  const reference=String(references[record.id]||'').trim();
  if(!reference){setError('Enter the DataDoc transaction / submission reference before recording completion.');return}
  if(reference.length>120){setError('DataDoc reference must be at most 120 characters.');return}
  if(!window.confirm(
   'Confirm that you personally completed '+submitTabs.find(x=>x.id===active)?.title+
   ' in the external DataDoc portal for Process '+record.process+
   ' (reference '+reference+')?\n\nThis records your manual confirmation only. PJS OMS will NOT submit, send emails, confirm material receipt, or run any agent.'
  ))return;
  setSaving(record.id);setError('');
  try{
   await onMarkManualSubmit(record,active,reference);
   setReferences(old=>({...old,[record.id]:''}));
  }catch(e:any){setError(String(e?.message||'Could not record the manual submission'))}
  finally{setSaving('')}
 }
 const field=manualSubmitFields[active];
 const name=submitTabs.find(x=>x.id===active)?.title||'Submission';
 return <div className='oms-seven-page'>
  <Heading eyebrow='MODULE 03 / DATADOC SUBMISSION'
    title='DataDoc · Submit Process'
    description='Separate manual DataDoc submission registers. Recording a submission does not open DataDoc or start an agent. Credit and Non-credit processes remain separated.'/>
  <div className='oms-seven-stage-tabs' role='tablist' aria-label='DataDoc submission categories'>
   {submitTabs.map(({id,title,description},i)=>{
    const Icon=i===0?FileText:i===1?Mail:FileCheck2;
    return <button type='button' key={id} className={'oms-seven-stage-tab '+(active===id?'active':'')}
      aria-selected={active===id} role='tab' onClick={()=>{p.onSubmitTab(id);setError('');setQuery('')}}>
      <span className='oms-seven-stage-icon'><Icon size={19}/></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <b>{counts[id]||0}</b>
     </button>;
   })}
  </div>
  <div className='oms-seven-manual-notice'><ShieldCheck size={18}/><div>
   <strong>Manual verification only — no agent execution</strong>
   <small>The three tabs share existing PJS process records. A separate confirmation records only that you completed the corresponding step in the DataDoc portal.</small>
  </div></div>
  <div className='oms-seven-register-head'>
   <div><strong>{name}</strong><small>{rows.length} matching record(s) · Filter by credit category or Process No.</small></div>
   <div className='oms-seven-register-controls'>
    <label className='oms-seven-search'><Search size={15}/><input aria-label='Search DataDoc submissions' value={query} onChange={e=>setQuery(e.target.value)} placeholder='Process / invoice / party'/></label>
    <label className='oms-seven-credit-filter'>Credit category
     <select value={credit} onChange={e=>setCredit(e.target.value as CreditFilter)} aria-label='Credit / Non-credit filter'>
      <option value='All'>All categories</option>
      <option value='Credit'>Credit</option>
      <option value='Non Credit'>Non-credit</option>
      <option value='Unknown'>Not assigned</option>
     </select>
    </label>
   </div>
  </div>
  {error&&<p className='oms-seven-error' role='alert'><AlertTriangle size={16}/>{error}</p>}
  {!rows.length?<Empty icon={ClipboardCheck} title={'No '+name.toLowerCase()+' records'} help='Change the Credit / Non-credit filter or search. Existing process records are never duplicated by this page.'/>:
   <div className='oms-seven-submit-list'>{rows.map((r:any)=>{
    const missing=missingSubmissionRequirements(r,active);
    const done=Boolean(r[field]);
    const owner=r.owner_id===userId&&!r.team_id;
    const docs=(r.documents||[]).filter((d:any)=>
     active==='bill'?d.kind==='invoiceDoc':active==='email'?d.kind==='emailDoc':d.kind==='trackingShotDoc');
    return <article key={r.id} className='oms-seven-submit-item'>
     <div className='oms-seven-submit-identity'>
      <div><strong>{r.process} <span>· {r.party||'Party pending'}</span></strong>
       <small>Invoice {r.invoice||'—'} · Sales: {r.sales||'Not assigned'} · SO {r.so||'—'}</small></div>
      <div className='oms-seven-submit-chips'><span>{creditCategory(r.credit)==='Unknown'?'Credit status pending':creditCategory(r.credit)}</span><Tone value={r.stage}/></div>
     </div>
     <div className='oms-seven-submit-info'>
      <div><small>Recorded submission</small><strong>{done?showDate(r[field]):'Not recorded'}</strong></div>
      <div><small>DataDoc reference</small><strong>{r[field.replace(/At$/,'Reference')]||'—'}</strong></div>
      <div><small>Supporting file</small>
       {docs.length?<button type='button' onClick={()=>void cloud.open(r.id,docs[0].id).catch((e:any)=>setError(String(e?.message||'Cannot open supporting file')))}>Open {docs.length} attachment(s)</button>:<strong>Missing</strong>}
      </div>
     </div>
     {missing.length>0&&!done&&<p className='oms-seven-needs'><AlertTriangle size={13}/> Review before recording: {missing.join(' · ')}</p>}
     <div className='oms-seven-submit-actions'>
      <Button onClick={()=>onEdit(r)}>Edit / attachments</Button>
      {!done&&<label className='oms-seven-reference'>DataDoc transaction reference
       <input maxLength={120} value={references[r.id]||''} placeholder='Enter reference after external submission'
        onChange={e=>setReferences(old=>({...old,[r.id]:e.target.value}))}/>
      </label>}
      <button type='button' className='oms-seven-manual-confirm'
       disabled={done||busy||Boolean(saving)||!authenticated||demo||!owner||missing.length>0}
       onClick={()=>void mark(r)}><CheckCheck size={15}/>{done?'Recorded manually':saving===r.id?'Saving…':'Record manual submission'}</button>
     </div>
    </article>;
   })}</div>}
 </div>;
}
