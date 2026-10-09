/**
 * Extracts ONLY numbers explicitly labelled as a Process No. on a Done Pick List.
 * Never guesses from filenames, Sales Order numbers, LR numbers, or unlabeled digits.
 * The UI must still require a human confirmation before a private attachment is saved.
 */
export type DonePickRead={process:string; candidates:string[]; status:'detected'|'missing'|'ambiguous'};
const normalizeDigits=(s:string):string=>s.replace(/[oO]/g,'0').replace(/[iIlL|]/g,'1').replace(/[sS]/g,'5').replace(/[bB]/g,'8');
export function parseDonePickProcess(raw:string):DonePickRead{
  const text=raw.replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\r/g,'\n').replace(/\n+/g,'\n');
  const together=text.replace(/\n/g,' ');
  const patterns=[
    /\b(?:process|proc(?:ess)?\.?)\s*(?:number|num(?:ber)?\.?|no\.?|n[o0]\.?|#)\s*[:#.\-]?\s*([0-9oOiIlL|sSbB]{5,9})\b/gi,
    /\b(?:process|proc(?:ess)?\.?)\s*[:#\-]\s*([0-9oOiIlL|sSbB]{5,9})\b/gi
  ];
  const values=new Set<string>();
  for(const re of patterns){
    for(const match of together.matchAll(re)){
      const n=normalizeDigits(match[1]);
      if(/^\d{5,9}$/.test(n))values.add(n);
    }
  }
  const candidates=[...values];
  return {process:candidates.length===1?candidates[0]:'',candidates,status:candidates.length===1?'detected':candidates.length>1?'ambiguous':'missing'};
}
