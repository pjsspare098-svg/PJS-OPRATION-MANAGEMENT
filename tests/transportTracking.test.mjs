import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {TRANSPORT_CARRIERS,MANUAL_CARRIER_URLS,transportCarrier,CAPTURE_STATUSES} from '../src/transportTracking.ts';
assert.equal(TRANSPORT_CARRIERS.length,8);
for(const name of TRANSPORT_CARRIERS){
 assert.equal(transportCarrier(name),name);
 assert.ok(MANUAL_CARRIER_URLS[name].startsWith('https://'));
}
for(const [alias,expected] of [['TCI Express Ltd','TCI EXPRESS'],['TCI FREIGHT','TCI FREIGHT'],['V Xpress','V EXPRESS'],['V-Trans (India) Ltd','V TRANS'],['DTDC COURIER','DTDC'],['VRL Logistics','VRL'],['ARC limited','ARC']]){
 assert.equal(transportCarrier(alias),expected);
}
assert.equal(transportCarrier('SHREE MARUTI'),null,'Shree Maruti has its own carrier alias, resolved by the combined manual page');
assert.equal(transportCarrier('Unlisted transporter'),null);
assert.deepEqual(CAPTURE_STATUSES,[
 'Needs Review','Pending','In Transit','Out for Delivery','Delivered','Undelivered','RTO','Returned','Cancelled','Delayed','Address Issue','Not Found'
]);
const capture=readFileSync(new URL('../src/TransportTrackingCapture.tsx',import.meta.url),'utf8');
const sheet=readFileSync(new URL('../src/DispatchTrackingPage.tsx',import.meta.url),'utf8');
assert.ok(capture.includes('Tracking result details'));
assert.ok(capture.includes("p_detail:resultDetails.trim().slice(0,600)"),'Save typed notes against the same process');
assert.ok(capture.includes("disabled={!file||!resultDetails.trim()||busy}"),'Screenshot and typed result are required');
assert.ok(capture.includes('Carrier status (manual entry)'));
assert.ok(!capture.includes('recognize('),'Tracking screenshots must never trigger OCR');
assert.ok(!capture.includes('extractTrackingStatus'),'No automatic status guesses');
assert.ok(sheet.includes('displayedTrackingResult(r)'),'Typed result must be shown on the combined tracking sheet');
assert.ok(sheet.includes('Tracking details:'),'Tracking result label visible in carrier row');
console.log('PASS: eight manual carrier portals; manual status and details saved and displayed without OCR');
