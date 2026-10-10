export type LRMatch={lr:string;normalized:string;matches:any[];status:'matched'|'unmatched'|'ambiguous'};
export const normalizeLR=(value:any)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function extractLRs(text:string):string[]{
 const found=new Map<string,string>();
 const patterns=[
  /\b(?:LR|L\.R\.|Docket|Consignment|AWB|GC)\s*(?:No\.?|Number|#|ID)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{4,29})/gi,
  /\b(?:Lorry\s*Receipt|Consignment\s*Note)\s*(?:No\.?|Number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{4,29})/gi
 ];
 for(const pattern of patterns){
  for(const match of text.matchAll(pattern)){
   const v=match[1].replace(/[.,;:]+$/,'');
   const key=normalizeLR(v);
   if(key.length>=5&&!/^(NUMBER|INVOICE|DATE|DETAILS|TOTAL|PENDING)$/.test(key))found.set(key,v);
   if(found.size>=150)break;
  }
 }
 return [...found.values()];
}
export function matchLRs(input:string[],records:any[]):LRMatch[]{
 const unique=new Map<string,string>();
 for(const lr of input){const normalized=normalizeLR(lr);if(normalized.length>=5)unique.set(normalized,lr.trim())}
 return [...unique].map(([normalized,lr])=>{
  const matches=records.filter(r=>normalizeLR(r.lr)===normalized);
  return {lr,normalized,matches,status:matches.length===1?'matched':matches.length>1?'ambiguous':'unmatched'} as LRMatch;
 });
}
