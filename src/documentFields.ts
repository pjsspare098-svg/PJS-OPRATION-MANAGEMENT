export type DocumentFields={
 invoice?:string;invoiceDate?:string;amount?:string;einvoice?:string;ebill?:string;
 lr?:string;so?:string;transporter?:string;clientEmail?:string;
};
export type ScanResult={fields:DocumentFields;emails:string[];notes:string[]};
const clean=(v:string)=>v.replace(/^[\s#:.-]+|[\s,;]+$/g,'').trim();
const dateISO=(raw:string)=>{
 const m=raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
 if(!m)return '';
 const dd=Number(m[1]),mm=Number(m[2]),yyyy=Number(m[3]);
 const d=new Date(Date.UTC(yyyy,mm-1,dd));
 return d.getUTCDate()===dd&&d.getUTCMonth()+1===mm&&d.getUTCFullYear()===yyyy
  ?[yyyy,String(mm).padStart(2,'0'),String(dd).padStart(2,'0')].join('-'):'';
};
export function mailCandidates(text:string):string[]{
 const header=text.split(/\r?\n\r?\n/)[0].slice(0,25000).replace(/\r?\n[ \t]+/g,' ');
 const lines=header.split(/\r?\n/).filter(l=>/^(from|to|cc|reply-to):/i.test(l));
 const emails=new Set<string>();
 for(const line of lines)for(const e of line.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))emails.add(e[0].toLowerCase());
 return [...emails];
}
export function parseDocumentFields(input:string,kind:string):ScanResult{
 const normalized=input.replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/[\t ]+/g,' ');
 const text=normalized.replace(/\n/g,' ').replace(/ +/g,' ');
 const fields:DocumentFields={},notes:string[]=[];
 const field=(re:RegExp)=>clean(text.match(re)?.[1]||'');
 const invoice=field(/\b(?:Tax\s+Invoice|Invoice|Inv\.?)\s*(?:Number|Num\.?|No\.?|#)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9/-]{2,39})\b/i);
 const invDate=field(/\bInvoice\s*Date\s*[:#.-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/i);
 const so=field(/\b(?:Sales\s*Order|SO)\s*(?:Number|No\.?|#)\s*[:#.-]?\s*(\d{6,12})\b/i);
 const amount=field(/\b(?:Grand\s*Total|Invoice\s*(?:Amount|Value)|Total\s*Invoice\s*Value)\s*(?:INR|Rs\.?|₹)?\s*[:#-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\b/i);
 const einvoice=field(/\b(?:E-?\s*Invoice\s*(?:No\.?|Number)|Ack(?:nowledg(?:e)?ment)?\s*(?:No\.?|Number))\s*[:#.\-]?\s*([A-Z0-9/-]{8,65})\b/i);
 const ebill=field(/\b(?:E-?\s*Way\s*Bill|EWB)\s*(?:No\.?|Number|#)?\s*[:#.\-]?\s*(\d{10,15})\b/i);
 const lr=field(/\b(?:L\.?\s*R\.?\s*(?:/\s*Docket)?|Docket|Consignment|Lorry\s*Receipt|AWB)\s*(?:No\.?|Number|#|ID)?\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9/-]{2,29})\b/i);
 if(['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(kind)){
  if(invoice)fields.invoice=invoice;
  if(invDate){const v=dateISO(invDate);if(v)fields.invoiceDate=v}
  if(so)fields.so=so;
  if(amount)fields.amount=amount.replace(/,/g,'');
  if(einvoice&&kind==='einvoiceDoc')fields.einvoice=einvoice;
  if(ebill)fields.ebill=ebill;
  if(lr)fields.lr=lr;
 }
 if(kind==='emailDoc'){
  const emails=mailCandidates(input);
  notes.push(emails.length?'Choose the customer email address from suggestions.':'No address found in email headers.');
  return {fields,emails,notes};
 }
 const recognized=Object.keys(fields);
 notes.push(recognized.length?'Detected: '+recognized.join(', ')+'. Verify against the PDF.':'No labelled fields confidently detected. Enter manually.');
 return {fields,emails:[],notes};
}
