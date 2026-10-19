/** Six carrier aliases from the original VBA TrackingDataBridge.
 * Website only links to known carrier domains; no shipment ID is placed in URLs.
 */
export type CarrierName = 'SHREE MARUTI'|'VRL'|'ACPL'|'V EXPRESS'|'TCI FREIGHT'|'ARC';
export const CARRIER_URLS: Record<CarrierName,string> = {
 'SHREE MARUTI':'https://tracking.shreemaruti.com/',
 'VRL':'https://www.vrlgroup.in/Tracking/TrackShipment',
 'ACPL':'https://acplcargo.com/tracking',
 'V EXPRESS':'https://vxpress.in/track-shipment/',
 'TCI FREIGHT':'https://tcifreight.in/',
 'ARC':'https://online.arclimited.com/cnstrk/cnstrk.aspx',
};

export function normalizeCarrier(input:unknown):CarrierName|null {
 const name=String(input??'').toUpperCase().replace(/\s+/g,' ').trim();
 if(!name)return null;
 if(name.includes('SHREE MARUTI')||name.includes('ARHAM ENTERPRISE'))return 'SHREE MARUTI';
 if(name.includes('V EXPRESS')||name.includes('V-EXPRESS')||name.includes('VEXPRESS'))return 'V EXPRESS';
 if(name.includes('TCI FREIGHT'))return 'TCI FREIGHT';
 if(name.includes('VRL'))return 'VRL';
 if(name.includes('ACPL'))return 'ACPL';
 if(/\bARC\b/.test(name))return 'ARC';
 return null;
}
export function carrierTrackingUrl(input:unknown):string|null {
 const name=normalizeCarrier(input);
 return name?CARRIER_URLS[name]:null;
}
