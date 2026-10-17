import assert from 'node:assert/strict';
import {TRANSPORT_CARRIERS,MANUAL_CARRIER_URLS,transportCarrier,extractTrackingStatus} from '../src/transportTracking.ts';
assert.equal(TRANSPORT_CARRIERS.length,8);
for(const name of TRANSPORT_CARRIERS){
 assert.equal(transportCarrier(name),name);
 assert.ok(MANUAL_CARRIER_URLS[name].startsWith('https://'));
}
for(const [alias,expected] of [['TCI Express Ltd','TCI EXPRESS'],['TCI FREIGHT','TCI FREIGHT'],['V Xpress','V EXPRESS'],['V-Trans (India) Ltd','V TRANS'],['DTDC COURIER','DTDC'],['VRL Logistics','VRL'],['ARC limited','ARC']]){
 assert.equal(transportCarrier(alias),expected);
}
assert.equal(transportCarrier('SHREE MARUTI'),null,'Automated Shree Maruti is not a manual transport');
assert.equal(transportCarrier('Unlisted transporter'),null);
assert.equal(extractTrackingStatus('Shipment Status: Out for Delivery').status,'Out for Delivery');
assert.equal(extractTrackingStatus('Current Status: Delivered').status,'Delivered');
assert.equal(extractTrackingStatus('Current Status: Undelivered').status,'Undelivered');
assert.equal(extractTrackingStatus('Current Status: In Transit\nHistory: Delivered at checkpoint').status,'In Transit');
assert.equal(extractTrackingStatus('History: Delivered at origin').status,'Needs Review');
assert.equal(extractTrackingStatus('Current Status: In Transit\nLatest Status: Delivered').status,'Needs Review');
assert.equal(extractTrackingStatus('Shipment Status: RTO').status,'RTO');
assert.equal(extractTrackingStatus('Not Found').status,'Needs Review','Never infer status from a page without a current status label');
console.log('PASS: eight manual carrier portals and safe screenshot OCR status suggestions');
