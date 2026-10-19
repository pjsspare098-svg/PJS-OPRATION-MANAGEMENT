/** All official carrier lookups are MANUAL. No tracking queue/job is generated. */
import {carrierTrackingUrl,normalizeCarrier} from './carrierRegistry.ts';
import {MANUAL_CARRIER_URLS,transportCarrier} from './transportTracking.ts';

export const MANUAL_TRACKING_MODE='manual-only-v1' as const;
export function manualCarrierName(input:unknown):string|null{
 const shree=normalizeCarrier(input);
 if(shree==='SHREE MARUTI')return 'SHREE MARUTI';
 return transportCarrier(input);
}
export function manualCarrierUrl(input:unknown):string|null{
 const name=manualCarrierName(input);
 if(!name)return null;
 if(name==='SHREE MARUTI')return carrierTrackingUrl('SHREE MARUTI');
 return MANUAL_CARRIER_URLS[name as keyof typeof MANUAL_CARRIER_URLS]||null;
}
export function hasTrackingProof(record:any):boolean{
 return Boolean((record?.documents||[]).some((d:any)=>d.kind==='trackingShotDoc'));
}
function parsed(value:unknown):number {
 const number=Date.parse(String(value||''));
 return Number.isFinite(number)?number:0;
}
export function displayedTrackingResult(record:any):{
 status:string;detail:string;source:'manual'|'worker'|'pending';eventDate:string
}{
 const manualStatus=String(record?.trackingCaptureStatus||'').trim();
 const workerStatus=String(record?.trackingStatus||'').trim();
 // A manual capture supersedes a previous worker lookup ONLY when it is at
 // least as recent. Old saved status and evidence are not overwritten.
 const manual=Boolean(manualStatus)&&(!workerStatus
  ||parsed(record?.trackingCaptureAt)>=parsed(record?.trackingCheckedAt));
 if(manual)return {
  status:manualStatus,
  detail:String(record?.trackingCaptureDetail||''),
  source:'manual',eventDate:String(record?.trackingCaptureAt||'')
 };
 if(workerStatus)return {
  status:workerStatus,detail:String(record?.trackingDetail||''),
  source:'worker',eventDate:String(record?.trackingDeliveryDate||'')
 };
 return {status:'Pending',detail:'',source:'pending',eventDate:''};
}
