import {type DocumentFields,displayField} from './documentFields.ts';

export type ScannedDocument={name:string;kind:string;fields:DocumentFields;emails:string[]};
export type Candidate={key:keyof DocumentFields;label:string;value:string;source:string;kind:string};
export type ScanReview={candidates:Candidate[];conflicts:string[];emails:string[]};

const fieldsByKind:Record<string,(keyof DocumentFields)[]>={
 invoiceDoc:['invoice','invoiceDate','amount','so','ebill'],
 einvoiceDoc:['einvoice','invoice','invoiceDate','so','ebill'],
 ebillDoc:['ebill','invoice','so'],
 lrDoc:['lr','so'],
 emailDoc:[]
};
const order=['invoiceDoc','einvoiceDoc','ebillDoc','lrDoc','emailDoc'];
/** Only document-specific fields are eligible; never infer a value from a filename. */
export function mergeDocumentScans(scans:ScannedDocument[]):ScanReview{
 const sorted=[...scans].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
 const candidates:Candidate[]=[];
 const conflicts:string[]=[];
 const emails=new Set<string>();
 for(const doc of sorted){
  for(const email of doc.emails||[])if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))emails.add(email);
  for(const key of fieldsByKind[doc.kind]||[]){
   const value=String(doc.fields[key]||'').trim();
   if(!value)continue;
   const other=candidates.find(x=>x.key===key);
   if(other&&other.value.toLowerCase()!==value.toLowerCase()){
    conflicts.push(displayField[key]+' differs between '+other.source+' ('+other.value+') and '+doc.name+' ('+value+'). No conflicting value was applied.');
    // Keep both alternatives in the review; the user should decide manually.
   }
   if(!candidates.some(x=>x.key===key&&x.value.toLowerCase()===value.toLowerCase()))
    candidates.push({key,label:displayField[key],value,source:doc.name,kind:doc.kind});
  }
 }
 const conflictKeys=new Set<string>();
 for(const c of candidates){
  if(candidates.some(x=>x.key===c.key&&x.value.toLowerCase()!==c.value.toLowerCase()))conflictKeys.add(c.key);
 }
 // Do not make an automatic choice for fields with contradictory documents.
 return {candidates:candidates.map(c=>({...c,kind:conflictKeys.has(c.key)?'conflict':c.kind})),conflicts,emails:[...emails]};
}
export function safeUpdates(existing:Record<string,any>,review:ScanReview){
 const changes:Record<string,string>={};
 const skipped:string[]=[];
 for(const candidate of review.candidates){
  if(candidate.kind==='conflict'){skipped.push(candidate.label+' has conflicting extracted values');continue}
  const before=String(existing[candidate.key]??'').trim();
  if(!before)changes[candidate.key]=candidate.value;
  else if(before!==candidate.value)skipped.push(candidate.label+' already contains a different value');
 }
 return {changes,skipped};
}
