// PJS document field extraction. The original uploaded document is never changed.
// The parser only proposes values backed by an explicit label in the PDF/email.
export type DocumentFields={
 invoice?:string; invoiceDate?:string; amount?:string; einvoice?:string; ebill?:string;
 lr?:string; so?:string; transporter?:string; clientEmail?:string;
};
export type ScanResult={fields:DocumentFields; emails:string[];notes:string[]};
export const displayField:Record<keyof DocumentFields,string>={
 invoice:'Invoice No.',invoiceDate:'Invoice Date',amount:'Invoice Amount',
 einvoice:'E-Invoice / IRN',ebill:'E-Way Bill No.',lr:'LR / Docket No.',
 so:'Sales Order No.',transporter:'Transporter',clientEmail:'Client Email'
};
export const expectedDocumentFields:Record<string,(keyof DocumentFields)[]>={
 invoiceDoc:['invoice','invoiceDate','amount'],
 einvoiceDoc:['einvoice','invoice'],
 ebillDoc:['ebill'],
 lrDoc:['lr'],
 emailDoc:['clientEmail']
};
const tidy=(input:string)=>String(input||'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/\u200b/g,'').replace(/[ \t]+/g,' ').replace(/\r/g,'').trim();
const clean=(value:string)=>tidy(value).replace(/^[\s:#.=–-]+|[\s,;]+$/g,'').trim();
const TEXT_LIMIT=650000;
const stopWords=new Set(['NO','NUMBER','DATE','TO','FROM','INVOICE','BILL','PARTY','QTY','AMOUNT','INR','RS','VALUE','DETAILS','TOTAL','CUSTOMER','NAME','CODE','TYPE','TAX','ACK','PROCESS','LR','DOCKET']);
const validToken=(value:string,min=2,max=50)=>{
 const v=clean(value);
 return v.length>=min&&v.length<=max&&/[0-9]/.test(v)&&/^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(v)&&!stopWords.has(v.toUpperCase());
};
const getToken=(t:string,patterns:RegExp[],min=2,max=50):string=>{
 for(const pattern of patterns){
  const matches=[...t.matchAll(pattern)];
  for(const m of matches){
   const candidate=clean(m[1]||'');
   if(validToken(candidate,min,max))return candidate;
  }
 }
 return '';
};
const dateISO=(text:string)=>{
 const x=clean(text);
 const pad=(n:number)=>String(n).padStart(2,'0');
 let year=0,month=0,day=0;
 let match=x.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
 if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3])}
 else if((match=x.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))){day=Number(match[1]);month=Number(match[2]);year=Number(match[3])}
 else if((match=x.match(/^(\d{1,2})[\s/.-]+([A-Z]{3,9})[\s/.-]+(\d{2,4})$/i))){
  const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const token=match[2].toLowerCase().slice(0,3);month=names.indexOf(token)+1;
  year=Number(match[3]);if(year<100)year+=year<50?2000:1900;day=Number(match[1]);
 }
 if(year<1900||year>2100||month<1||month>12||day<1||day>31)return '';
 const parsed=new Date(Date.UTC(year,month-1,day));
 return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day?year+'-'+pad(month)+'-'+pad(day):'';
};
export function mailCandidates(text:string):string[]{
 const header=String(text||'').split(/\r?\n\r?\n/)[0].slice(0,25000).replace(/\r?\n[ \t]+/g,' ');
 const lines=header.split(/\r?\n/).filter(l=>/^(from|to|cc|reply-to):/i.test(l));
 const emails=new Set<string>();
 for(const line of lines)for(const e of line.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))emails.add(e[0].toLowerCase());
 return [...emails];
}
const amountPattern=/\b(?:Grand\s*Total|Net\s*Invoice\s*(?:Amount|Value)|Total\s*Invoice\s*(?:Amount|Value)?|Invoice\s*(?:Amount|Value)|Total\s*Amount(?:\s*Payable)?)\b(?:\s*(?:\(?\s*(?:INR|Rs\.?|₹)\s*\)?))?\s*[:.=-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)(?!\d)/gi;
const invoicePattern=[
 /\b(?:Tax\s*Invoice|Commercial\s*Invoice|Invoice|Inv\.?)\s*(?:No\.?|Num(?:ber)?\.?|#|:)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9/._-]{0,48})\b/gi,
 /\b(?:Invoice\s*Reference|Inv\.\s*Ref)\s*(?:No\.?|Number|:)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9/._-]{0,48})\b/gi
];
const invoiceDatePattern=/\b(?:Invoice|Inv\.?)\s*(?:Date|Dt\.?)\s*[:.=-]?\s*((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}[-/. ]+[A-Z]{3,9}[-/. ]+\d{2,4}))\b/gi;
const soPatterns=[
 /\b(?:Sales\s*Order|S\.?\s*O\.?|Order)\s*(?:No\.?|Number|#|:)\s*[:.=-]?\s*(\d{6,12})\b/gi
];
const lrPatterns=[
 /\b(?:L\.?\s*R\.?(?:\s*\/\s*Docket)?|Docket|Lorry\s*Receipt|Consignment(?:\s*Note)?|AWB|Tracking)\s*(?:No\.?|Num(?:ber)?\.?|#|ID|:)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9/._-]{0,39})\b/gi
];
const ewayPatterns=[
 /\b(?:E[\s-]*Way\s*Bill|EWB)\s*(?:No\.?|Number|#)?\s*[:.#-]?\s*(\d{10,15})\b/gi
];
const irnPatterns=[
 /\b(?:IRN|Invoice\s*Reference\s*Number)\s*[:.#-]?\s*([a-f0-9]{64})\b/gi,
 /\b(?:Ack(?:nowledg(?:e)?ment)?\s*(?:No\.?|Num(?:ber)?\.?)|E[\s-]*Invoice\s*(?:No\.?|Number))\s*[:.#-]?\s*([A-Z0-9][A-Z0-9/._-]{5,64})\b/gi
];
function tokenize(t:string,kind:string):DocumentFields{
 const fields:DocumentFields={};
 if(!['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc'].includes(kind))return fields;
 const invoice=getToken(t,invoicePattern,1);
 if(invoice)fields.invoice=invoice;
 const rawDate=[...t.matchAll(invoiceDatePattern)].map(x=>dateISO(x[1])).find(Boolean);
 if(rawDate)fields.invoiceDate=rawDate;
 const so=getToken(t,soPatterns,6,12);if(so)fields.so=so;
 const amounts=[...t.matchAll(amountPattern)].map(m=>m[1].replace(/[,\s]/g,'')).filter(x=>/^\d+(?:\.\d{1,2})?$/.test(x)&&Number(x)>0);
 if(amounts.length)fields.amount=amounts[0];
 if(kind==='einvoiceDoc'){
  const irn=getToken(t,irnPatterns,6,64);if(irn)fields.einvoice=irn;
 }
 if(kind==='ebillDoc'||kind==='invoiceDoc'||kind==='einvoiceDoc'){
  const rawEway=[...t.matchAll(ewayPatterns[0])].map(m=>m[1].replace(/[\s-]/g,'')).find(x=>/^\d{10,15}$/.test(x));
  if(rawEway)fields.ebill=rawEway;
 }
 if(kind==='lrDoc'){
  const lr=getToken(t,lrPatterns,2,40);if(lr)fields.lr=lr;
 }
 return fields;
}
export function parseDocumentFields(input:string,kind:string):ScanResult{
 if(kind==='emailDoc'){
  const emails=mailCandidates(input);
  return {fields:{},emails,notes:[emails.length?'Choose the customer address from the email headers.':'No email address found in the From/To/Cc headers.']};
 }
 const original=tidy(String(input||'').slice(0,TEXT_LIMIT));
 const flat=original.replace(/\n/g,' ').replace(/\s+/g,' ').trim();
 const fields=tokenize(flat,kind);
 const expected=expectedDocumentFields[kind]||[];
 const found=Object.keys(fields) as (keyof DocumentFields)[];
 const missing=expected.filter(key=>!fields[key]);
 const notes=[
  found.length?'Detected '+found.map(key=>displayField[key]).join(', ')+'.':'No clearly labelled fields found.',
  missing.length?'Not found: '+missing.map(key=>displayField[key]).join(', ')+'.':'',
  'Check the values against the original document before saving.'
 ].filter(Boolean);
 return {fields,emails:[],notes};
}
