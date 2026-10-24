/** Only real, complete dispatch data may be authorized for Outlook Reply All sending.
 * This mirrors SQL checks; the server validates everything again regardless of UI.
 */
export const EMAIL_SEND_VERSION='outlook_send_v1' as const;
export const EMAIL_REQUIRED_FIELDS=[
 ['party','Party Name'],['so','SO No.'],['po','PO No.'],['poDate','PO Date'],
 ['invoice','Invoice No.'],['invoiceDate','Invoice Date'],
 ['transporter','Courier / Transporter'],['lr','LR / Docket No.'],
 ['courierDate','Courier Date'],['weight','Box Weight (Kgs)']
] as const;
export type EmailSendDocs={original:string;invoice:string;lr:string};
export type EmailSendReadiness={ready:boolean;missing:string[]};
export function documentOptions(record:any,kind:string){
 return (record?.documents||[]).filter((d:any)=>
  d.kind===kind&&typeof d.id==='string'&&
  (kind==='emailDoc'?/\.eml$/i:/\.pdf$/i).test(String(d.name||''))
 );
}
export function defaultEmailSendDocs(record:any):EmailSendDocs{
 const pick=(kind:string)=>documentOptions(record,kind).length===1?documentOptions(record,kind)[0].id:'';
 return {original:pick('emailDoc'),invoice:pick('invoiceDoc'),lr:pick('lrDoc')};
}
export function checkEmailSend(record:any,chosen:EmailSendDocs):EmailSendReadiness{
 const missing:string[]=[];
 if(record?.stage!=='Email to Client')missing.push('Process must be in Email to Client');
 if(record?.team_id)missing.push('Shared team records require manual sending');
 if(!/^\d{5,10}$/.test(String(record?.process||'')))missing.push('Valid Process No.');
 for(const [field,label] of EMAIL_REQUIRED_FIELDS)
  if(!String(record?.[field]??'').trim())missing.push(label);
 const weight=String(record?.weight||'').trim();
 if(weight&&!/^\d+(?:\.\d{1,3})?\s*(?:kg|kgs)?$/i.test(weight))
  missing.push('Valid positive Box Weight');
 const parsed=Number(weight.replace(/\s*(kg|kgs)$/i,''));
 if(weight&&(!Number.isFinite(parsed)||parsed<=0))missing.push('Positive Box Weight');
 const choices=[['original','emailDoc','Original Outlook .eml'],['invoice','invoiceDoc','Invoice PDF'],['lr','lrDoc','LR / Courier PDF']] as const;
 const ids=new Set<string>();
 for(const [slot,kind,label] of choices){
  if(!chosen[slot])missing.push(label);
  else if(!documentOptions(record,kind).some((d:any)=>d.id===chosen[slot]))
   missing.push(label+' must be an active attachment of this process');
  else if(ids.has(chosen[slot]))missing.push('Select different files for each attachment');
  ids.add(chosen[slot]);
 }
 return {ready:missing.length===0,missing};
}
