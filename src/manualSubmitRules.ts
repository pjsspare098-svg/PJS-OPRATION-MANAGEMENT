/** Manual DataDoc confirmation prerequisites — NO portal submission/automation. */
import {creditCategory,type SubmitTab} from './siteNavigation.ts';
import {displayedTrackingResult} from './manualDispatchTracking.ts';
import {trackingProofDocuments} from './datadocProofRules.ts';
export function missingSubmissionRequirements(record:any,category:SubmitTab):string[]{
 const missing:string[]=[];
 if(!/^[0-9]{5,9}$/.test(String(record?.process||'')))missing.push('Valid Process No.');
 if(creditCategory(record?.credit)==='Unknown')missing.push('Credit / Non-credit');
 if(!String(record?.sales||'').trim())missing.push('Sales Person');
 if(category==='bill'){
  if(!String(record?.invoice||'').trim())missing.push('Invoice No.');
  if(!String(record?.amount||'').trim())missing.push('Invoice Amount');
  if(!(record?.documents||[]).some((d:any)=>d.kind==='invoiceDoc'))missing.push('Invoice PDF');
 }else if(category==='email'){
  if(!(record?.documents||[]).some((d:any)=>d.kind==='emailDoc'&&/\.eml$/i.test(d.name||'')))missing.push('Original Outlook email (.eml)');
 }else{
  if(!trackingProofDocuments(record).length)missing.push('Tracking screenshot');
  if(displayedTrackingResult(record).status!=='Delivered')missing.push('Verified Delivered tracking status');
 }
 return missing;
}
