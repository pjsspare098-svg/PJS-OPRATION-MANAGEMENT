export type Rules={ready:boolean;missing:string[];warnings:string[]};
export type RulePrefs={ebill_threshold:number;retrack_days:number;reminder_days:number};
const text=(v:any)=>String(v??'').trim();
const kinds=(r:any)=>new Set<string>((r.documents||[]).map((d:any)=>d.kind));
export const amountValue=(v:any)=>{const s=text(v).replace(/[₹,\s]/g,'');if(!s)return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:null};
export function checkBill(r:any,threshold=50000):Rules{
 const files=kinds(r),missing:string[]=[],warnings:string[]=[];
 if(!/^\d{5,9}$/.test(text(r.process)))missing.push('Valid Process No.');
 if(!text(r.party))warnings.push('Party Name not recorded');
 if(!/^\d{6,12}$/.test(text(r.so)))warnings.push('SO No. not recorded');
 if(!files.has('pickDoc'))warnings.push('Original Pick Slip PDF not attached');
 if(!text(r.invoice))missing.push('Invoice No.');
 if(!['Credit','Non Credit'].includes(text(r.credit)))missing.push('Credit Type');
 if(!files.has('invoiceDoc'))missing.push('Invoice PDF needed in DataDoc ZIP');
 if(!files.has('einvoiceDoc'))warnings.push('E-Invoice PDF not attached; it will be omitted from the ZIP');
 const amount=amountValue(r.amount);
 if(amount===null||amount<=0)missing.push('Positive invoice amount');
 if(amount!==null&&amount>threshold&&!files.has('ebillDoc'))warnings.push('E-Way Bill PDF not attached; verify compliance before submission');
 if(!files.has('donePickDoc'))warnings.push('Done Pick List not yet attached');
 return {ready:!missing.length,missing,warnings};
}

export type RuleJob='bill_submit'|'datadoc_submit'|'tracking'|'delivery_proof_submit'|'email_reply';
export function checkJob(r:any,type:RuleJob,prefs:RulePrefs={ebill_threshold:50000,retrack_days:3,reminder_days:10},jobs:any[]=[]):Rules{
 if(type==='bill_submit')return checkBill(r,prefs.ebill_threshold);
 const files=kinds(r),missing:string[]=[],warnings:string[]=[];
 if(!text(r.process))missing.push('Process No.');
 if(!text(r.party)&&type!=='tracking')missing.push('Party Name');
 if(type==='tracking'){
  if(!text(r.transporter))missing.push('Transporter');
  if(!text(r.lr))missing.push('LR / Docket No.');
  if(!files.has('lrDoc'))warnings.push('LR document not attached');
 }
 if(type==='datadoc_submit'){
  if(!jobs.some(j=>j.process_id===r.id&&j.job_type==='bill_submit'&&j.status==='completed'))missing.push('Completed DataDoc Bill Submit');
  if(!files.has('emailDoc'))missing.push('Original client email (.eml)');
 }
 if(type==='email_reply'){
  const originals=(r.documents||[]).filter((d:any)=>d.kind==='emailDoc');
  const selected=text(r.selected_email_document_id);
  const chosen=selected?originals.find((d:any)=>d.id===selected):originals.length===1?originals[0]:null;
  if(!chosen)missing.push(originals.length===0?'Original Outlook email conversation (.eml)':'Select the exact original Outlook conversation');
  if(chosen&&!chosen.id)missing.push('Saved Outlook conversation ID');
  if(chosen&&!/\.eml$/i.test(text(chosen.name)))missing.push('Original Outlook email must be .eml');
  if(!text(r.invoice))missing.push('Invoice No.');
  if(!(r.documents||[]).some((d:any)=>d.kind==='invoiceDoc'&&/\.pdf$/i.test(text(d.name))))missing.push('Invoice PDF');
  for(const [field,label] of [
   ['po','PO No.'],['poDate','PO Date'],['invoiceDate','Invoice Date'],
   ['transporter','Courier'],['lr','Doc No. / LR'],
   ['courierDate','Courier Date']
  ] as const)if(!text(r[field]))missing.push(label);
  const weight=text(r.weight);
  if(!weight||!Number.isFinite(Number(weight.replace(/\s*(?:kgs?|kilograms?)$/i,'').trim()))||
     Number(weight.replace(/\s*(?:kgs?|kilograms?)$/i,'').trim())<=0)
   missing.push('Positive box weight (Kgs)');
  if(!(r.documents||[]).some((d:any)=>d.kind==='lrDoc'&&/\.pdf$/i.test(text(d.name))))
   missing.push('Courier receipt / LR PDF');

 }
 if(type==='delivery_proof_submit'){
  if(!/delivered|delivery proof/i.test([r.status,r.stage].join(' ')))missing.push('Confirmed delivery');
  if(!files.has('proofDoc'))missing.push('Delivery Proof attachment');
  if(!text(r.transporter)||!text(r.lr))missing.push('Transporter and LR / Docket No.');
 }
 return {ready:!missing.length,missing,warnings};
}
export function canCloseProcess(r:any,jobs:any[]):Rules{
 const missing:string[]=[];
 if(!/delivered|delivery proof/i.test([r.status,r.stage].join(' ')))missing.push('Confirmed delivery');
 if(!kinds(r).has('proofDoc'))missing.push('Delivery Proof attachment');
 if(!jobs.some(j=>j.process_id===r.id&&j.job_type==='delivery_proof_submit'&&j.status==='completed'))missing.push('Confirmed DataDoc delivery-proof submission');
 if(text(r.exceptionReason))missing.push('Unresolved exception');
 return {ready:!missing.length,missing,warnings:[]};
}
