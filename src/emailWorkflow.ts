import {checkJob} from './businessRules.ts';

export const OUTLOOK_DRAFT_VERSION='outlook_draft_v1' as const;

export function originalOutlookMessages(record:any):any[]{
 return (record?.documents||[]).filter((doc:any)=>doc.kind==='emailDoc');
}
export function emailDraftReadiness(record:any, jobs:any[]=[]){
 const base=checkJob(record,'email_reply');
 const missing=[...base.missing];
 const messages=originalOutlookMessages(record);
 if(messages.length===1&&!/\.eml$/i.test(messages[0].name||''))missing.push('Original Outlook email must be .eml');
 if(!String(record?.so||'').trim())missing.push('Sales Order No.');
 const owner=record?.owner_id;
 if(owner&&record?.current_user_id&&owner!==record.current_user_id)missing.push('Only the process owner can queue office Outlook drafts');
 const latest=jobs.find((job:any)=>job.process_id===record?.id&&job.job_type==='email_reply');
 const active=jobs.find((job:any)=>job.process_id===record?.id&&job.job_type==='email_reply'&&['queued','running'].includes(job.status));
 return {ready:!missing.length,missing,latest,active,
    legacy:!!active&&active.payload?.automation_version!==OUTLOOK_DRAFT_VERSION};
}
export function dispatchDetailsText(record:any):string{
 return [
  'Dear Customer,','',
  'Please find the dispatch details for your order:','',
  'Party: '+String(record?.party||''),
  'Process No.: '+String(record?.process||''),
  'SO No.: '+String(record?.so||''),
  'Product Name: '+String(record?.productName||'Not specified'),
  'Sales Person: '+String(record?.sales||'Not specified'),
  'Invoice No.: '+String(record?.invoice||'Pending'),
  'Transporter: '+String(record?.transporter||'Pending'),
  'LR / Docket: '+String(record?.lr||'Pending'),
  'Ready for Dispatch: '+String(record?.ready||'Pending'),
  '',
  'Regards,','PJS Dispatch Team'
 ].join('\n');
}
