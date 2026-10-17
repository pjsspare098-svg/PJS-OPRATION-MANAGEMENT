/** Manual carrier websites and status choices only.
 * Screenshot OCR is intentionally disabled. Carrier worker remains separate.
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
 if(/\bV\s*EXPRESS\b|\bV\s*XPRESS\b|\bVXPRESS\b/.test(normalized))return 'V EXPRESS';
 if(/\bV\s*TRANS\b|\bVTRANS\b/.test(normalized))return 'V TRANS';
 if(/\bDTDC\b/.test(normalized))return 'DTDC';
 if(/\bACPL\b/.test(normalized))return 'ACPL';
 if(/\bARC\b/.test(normalized))return 'ARC';
 if(/\bVRL\b/.test(normalized))return 'VRL';
 return null;
}
export const CAPTURE_STATUSES=['Needs Review','Pending','In Transit','Out for Delivery','Delivered','Undelivered','RTO','Returned','Cancelled','Delayed','Address Issue','Not Found'] as const;
export type CaptureStatus=typeof CAPTURE_STATUSES[number];
