import assert from 'node:assert/strict';
import {carrierTrackingUrl,normalizeCarrier} from '../src/carrierRegistry.ts';
const cases = [
 ['SHREE MARUTI EXPRESS','SHREE MARUTI'],
 ['ARHAM ENTERPRISE - SHREE MARUTI','SHREE MARUTI'],
 ['VRL LOGISTICS','VRL'],
 ['ACPL CARGO','ACPL'],
 ['V-EXPRESS','V EXPRESS'],
 ['VEXPRESS','V EXPRESS'],
 ['V EXPRESS','V EXPRESS'],
 ['TCI FREIGHT','TCI FREIGHT'],
 ['ARC','ARC'],
];
for(const [alias, expected] of cases){
 assert.equal(normalizeCarrier(alias),expected,'Must match original VBA carrier aliases');
 assert.ok(carrierTrackingUrl(alias)?.startsWith('https://'));
}
for(const item of ['',undefined,'TCI EXPRESS','V TRANS','DTDC','Other courier']){
 assert.equal(normalizeCarrier(item),null,'Do not auto-queue an unsupported carrier');
 assert.equal(carrierTrackingUrl(item),null);
}
assert.equal(carrierTrackingUrl('ACPL'),'https://acplcargo.com/tracking');
console.log('PASS: six VBA carrier families and official operator verification URLs');
