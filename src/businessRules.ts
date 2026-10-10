export type Rules={ready:boolean;missing:string[];warnings:string[]};
export type RulePrefs={ebill_threshold:number;retrack_days:number;reminder_days:number};
const text=(v:any)=>String(v??'').trim();
const kinds=(r:any)=>new Set<string>((r.documents||[]).map((d:any)=>d.kind));
export const amountValue=(v:any)=>{const s=text(v).replace(/[₹,\s]/g,'');if(!s)return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:null};
export function checkBill(r:any,threshold=50000):Rules{
 const files=kinds(r),missing:string[]=[],warnings:string[]=[];
 if(!/^\d{5,9}$/.test(text(r.process)))missing.push('Valid Process No.');
 if(!text(r.party))missing.push('Party Name');
 if(!/^\d{6,12}$/.test(text(r.so)))missing.push('Valid SO No.');
 if(!files.has('pickDoc'))missing.push('Original Pick Slip PDF');
 if(!text(r.invoice))missing.push('Invoice No.');
 if(!['Credit','Non Credit'].includes(text(r.credit)))missing.push('Credit Type');
 if(!files.has('invoiceDoc'))missing.push('Invoice PDF');
 if(!files.has('einvoiceDoc')&&!files.has('ebillDoc'))missing.push('E-Invoice or E-Way Bill PDF');
 const amount=amountValue(r.amount);
 if(amount===null)missing.push('Invoice amount');
 if(amount!==null&&amount>=threshold&&!files.has('ebillDoc'))missing.push('E-Way Bill PDF required by amount threshold');
 if(!files.has('donePickDoc'))warnings.push('Done Pick List not yet attached');
 return {ready:!missing.length,missing,warnings};
}
