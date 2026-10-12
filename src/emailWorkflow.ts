import {checkJob} from './businessRules.ts';

export const OUTLOOK_DRAFT_VERSION='outlook_draft_v1' as const;

export function originalOutlookMessages(record:any):any[]{
 return (record?.documents||[]).filter((doc:any)=>doc.kind==='emailDoc');
}
export function emailDraftReadiness(record:any, jobs:any[]=[]){
 const base=checkJob(record,'email_reply');
 const missing=[...base.missing];

 const owner=record?.owner_id;
 if(owner&&record?.current_user_id&&owner!==record.current_user_id)missing.push('Only the process owner can queue office Outlook drafts');
 const latest=jobs.find((job:any)=>job.process_id===record?.id&&job.job_type==='email_reply');
 const active=jobs.find((job:any)=>job.process_id===record?.id&&job.job_type==='email_reply'&&['queued','running'].includes(job.status));
 return {ready:!missing.length,missing,latest,active,
    legacy:!!active&&active.payload?.automation_version!==OUTLOOK_DRAFT_VERSION};
}
export function formatDispatchDate(value:unknown):string{
 const raw=String(value??'').trim();
 if(!raw)return '—';
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
 if(iso)return iso[3]+'/'+iso[2]+'/'+iso[1];
 return raw;
}

export function dispatchEmailRows(record:any):{label:string;value:string}[]{
 const value=(key:string)=>String(record?.[key]??'').trim()||'—';
 return [
  {label:'PO No.',value:value('po')},
  {label:'PO Date',value:formatDispatchDate(record?.poDate)},
  {label:'Invoice No.',value:value('invoice')},
  {label:'Invoice Date',value:formatDispatchDate(record?.invoiceDate)},
  {label:'Courier',value:value('transporter')},
  {label:'Doc No.',value:value('lr')},
  {label:'Courier Date',value:formatDispatchDate(record?.courierDate)},
  {label:'Box Weight (Kgs)',value:value('weight')}
 ];
}
export const dispatchEmailNotes=[
 'Scan copy of the courier receipt is attached for your reference.',
 'Please check the box weight at the time of delivery to avoid any issue of short supply after receipt of material.',
 'If the box is received in damaged condition, please take photographs immediately and note the damage on the transporter LR to claim loss from the transporter.',
 'For future reference, maintenance videos are available on our website: http://pressurejet.com/ManageVideo/Default.aspx',
 'Please record a proper video while unboxing the package to help resolve any concerns about damaged goods or short supply.'
] as const;

export function dispatchDetailsText(record:any):string{
 return [
  'Dear Sir,','',
  'This is with reference to your below-mentioned purchase order.','',
  'Please note that we have dispatched your spares/pump as per the details below:','',
  ...dispatchEmailRows(record).map(row=>row.label+': '+row.value),'',
  ...dispatchEmailNotes.map(note=>'- '+note),'',
  'Kindly confirm upon receipt of the material.','',
  'Regards,','CHETAN SOLANKI','PressureJet Systems Pvt. Ltd.',
  '21-24 Panchratna Industrial Estate,',
  'Ode-Pirana Road, Paldi Kankaj,',
  'Ahmedabad – 382427, Gujarat, India',
  'Mobile: +91-9376022359',
  'E-Mail: Dispatch@pressurejet.com',
  'Website: www.pressurejet.com'
 ].join('\n');
}
