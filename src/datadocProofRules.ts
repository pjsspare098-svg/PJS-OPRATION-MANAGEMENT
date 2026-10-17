/** DataDoc tracking proof preview: no stage change, no bill or email send. */
import {normalizedStage} from './workflowStages.ts';
const value=(v:unknown)=>String(v??'').trim();
export type ProofPlan={ready:boolean;missing:string[];nextWork:string;nextUser:string;documentId:string;screenshotStatus:string};
export function trackingProofDocuments(record:any):any[]{
 return (record?.documents||[]).filter((d:any)=>d.kind==='trackingShotDoc'&&d.id&&/\.(png|jpe?g)$/i.test(value(d.name)))
 .sort((a:any,b:any)=>(Date.parse(value(b.uploadedAt))||0)-(Date.parse(value(a.uploadedAt))||0));
}
export function trackingProofPlan(record:any,documentId:string,jobs:any[]=[]):ProofPlan{
 const missing:string[]=[];
 const docs=trackingProofDocuments(record);
 const chosen=docs.find(d=>d.id===documentId);
 if(!chosen)missing.push('Select a saved screenshot from this process');
 if(!/^[0-9]{5,9}$/.test(value(record?.process)))missing.push('Valid Process No.');
 if(!['Dispatch Tracking','Delivery Proof'].includes(normalizedStage(record)))missing.push('Dispatch Tracking or Delivery Proof stage');
 if(!value(record?.sales))missing.push('Sales Person');
 if(!['Credit','Non Credit'].includes(value(record?.credit)))missing.push('Credit / Non Credit');
 const credit=value(record?.credit),sales=value(record?.sales);
 let nextWork='',nextUser='';
 if(credit==='Credit'){nextWork='Credit';nextUser=sales}
 if(credit==='Non Credit'){
  if(/^deepa\b/i.test(sales)){nextWork='Close - Client Spares';nextUser='Deepa Bisht'}
  else if(/^ankita\b/i.test(sales)){nextWork='Close - Client - Pump';nextUser='Ankita Dahake'}
  else missing.push('Non Credit DataDoc mapping not confirmed for this salesperson');
 }
 if(jobs.some(j=>j.process_id===record?.id&&j.job_type==='delivery_proof_submit'&&['queued','running','completed'].includes(j.status)))
  missing.push('Tracking proof already queued or submitted');
 return {ready:missing.length===0,missing,nextWork,nextUser,documentId,
  screenshotStatus:value(record?.trackingCaptureStatus)||'Not recorded'};
}
