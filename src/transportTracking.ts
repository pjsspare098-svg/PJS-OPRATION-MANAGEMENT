/** Manual carrier portals and cautious evidence-only screenshot reading.
 * The independent six-carrier Selenium worker is NOT extended by this module.
 */
export const TRANSPORT_CARRIERS=['VRL','TCI FREIGHT','TCI EXPRESS','V EXPRESS','V TRANS','ACPL','ARC','DTDC'] as const;
export type TransportCarrier=typeof TRANSPORT_CARRIERS[number];
export const MANUAL_CARRIER_URLS:Record<TransportCarrier,string>={
 'VRL':'https://www.vrlgroup.in/Tracking/TrackShipment',
 'TCI FREIGHT':'https://tcifreight.in/',
 'TCI EXPRESS':'https://www.tciexpress.in/trackingdocket.aspx',
 'V EXPRESS':'https://vxpress.in/',
 'V TRANS':'https://vtransgroup.com/tools/track-trace/',
 'ACPL':'https://acplcargo.com/tracking',
 'ARC':'https://online.arclimited.com/cnstrk/cnstrk.aspx',
 'DTDC':'https://www.dtdc.com/track-your-shipment/',
};
export function transportCarrier(value:unknown):TransportCarrier|null{
 const normalized=String(value??'').toUpperCase().replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized)return null;
 if(/\bTCI\s+EXPRESS\b/.test(normalized))return 'TCI EXPRESS';
 if(/\bTCI\s+FREIGHT\b/.test(normalized))return 'TCI FREIGHT';
 if(/\bV\s*EXPRESS\b|\bVXPRESS\b/.test(normalized))return 'V EXPRESS';
 if(/\bV\s*TRANS\b|\bVTRANS\b/.test(normalized))return 'V TRANS';
 if(/\bDTDC\b/.test(normalized))return 'DTDC';
 if(/\bACPL\b/.test(normalized))return 'ACPL';
 if(/\bARC\b/.test(normalized))return 'ARC';
 if(/\bVRL\b/.test(normalized))return 'VRL';
 return null;
}
export const CAPTURE_STATUSES=['Needs Review','Pending','In Transit','Out for Delivery','Delivered','Undelivered','RTO','Returned','Cancelled','Delayed','Address Issue','Not Found'] as const;
export type CaptureStatus=typeof CAPTURE_STATUSES[number];
/** Suggest status only when a current/latest status label is visible.
 * Timeline events may contain old "Delivered" text. Never treat OCR as carrier-verified.
 */
export function extractTrackingStatus(input:unknown):{status:CaptureStatus;detail:string}{
 const lines=String(input??'').replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
 const labelled=lines.filter(line=>/\b(?:current\s+status|latest\s+status|shipment\s+status|consignment\s+status|delivery\s+status|tracking\s+status|present\s+status|status\s*[:\-])\b/i.test(line));
 const patterns:[CaptureStatus,RegExp][]=[
  ['Not Found',/\b(?:not\s+found|no\s+record|no\s+result)\b/i],
  ['Undelivered',/\b(?:undelivered|not\s+delivered|delivery\s+failed)\b/i],
  ['Out for Delivery',/\b(?:out\s+for\s+delivery|ofd)\b/i],
  ['Address Issue',/\b(?:address\s+issue|address\s+incorrect|wrong\s+address)\b/i],
  ['Returned',/\b(?:returned|return\s+to\s+origin\s+completed)\b/i],
  ['RTO',/\bRTO\b|\breturn\s+to\s+origin\b/i],
  ['Cancelled',/\bcancelled\b|\bcanceled\b/i],
  ['Delayed',/\b(?:delayed|delay|held)\b/i],
  ['In Transit',/\b(?:in\s+transit|on\s+the\s+way|in\s+movement|dispatched)\b/i],
  ['Delivered',/\bdelivered\b/i],
  ['Pending',/\b(?:pending|booked|received\s+at\s+origin|picked\s+up)\b/i],
 ];
 const matched=labelled.map(line=>({line,status:patterns.find(([_,re])=>re.test(line))?.[0]})).filter(x=>x.status);
 if(matched.length===1)return {status:matched[0].status!,detail:matched[0].line.slice(0,250)};
 if(matched.length>1&&matched.every(x=>x.status===matched[0].status))return {status:matched[0].status!,detail:matched[0].line.slice(0,250)};
 return {status:'Needs Review',detail:matched.length?'Conflicting status lines; inspect the screenshot.':'No unambiguous current status found in screenshot.'};
}
