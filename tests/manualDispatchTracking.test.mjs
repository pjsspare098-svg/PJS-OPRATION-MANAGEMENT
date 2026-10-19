import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {manualCarrierName,manualCarrierUrl,displayedTrackingResult,hasTrackingProof} from '../src/manualDispatchTracking.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

assert.equal(manualCarrierName('SHREE MARUTI'),'SHREE MARUTI');
assert.equal(manualCarrierName('ARHAM ENTERPRISES / Shree Maruti'),'SHREE MARUTI');
assert.equal(manualCarrierUrl('Shree Maruti'), 'https://tracking.shreemaruti.com/');
for(const courier of ['VRL','TCI FREIGHT','TCI EXPRESS','V EXPRESS','V TRANS','ACPL','ARC','DTDC']){
 assert.ok(manualCarrierUrl(courier)?.startsWith('https://'),courier+' needs a manual carrier URL');
}
assert.equal(manualCarrierName('local tempo partner'),null);
assert.equal(manualCarrierUrl('unknown carrier'),null);

const workerResult={
 trackingStatus:'In Transit',trackingDetail:'Picked up at Surat',trackingCheckedAt:'2026-10-18T10:00:00Z'
};
const laterManual={
 ...workerResult,trackingCaptureStatus:'Delivered',trackingCaptureDetail:'Signed by customer',
 trackingCaptureAt:'2026-10-19T12:00:00Z'
};
const earlierManual={...laterManual,trackingCaptureAt:'2026-10-17T12:00:00Z'};
assert.deepEqual(displayedTrackingResult(laterManual),{
 status:'Delivered',detail:'Signed by customer',source:'manual',eventDate:'2026-10-19T12:00:00Z'
});
assert.equal(displayedTrackingResult(earlierManual).status,'In Transit');
assert.equal(displayedTrackingResult(earlierManual).source,'worker');
assert.equal(displayedTrackingResult({}).status,'Pending');
assert.equal(displayedTrackingResult({trackingCaptureStatus:'Out for Delivery'}).source,'manual');
assert.equal(hasTrackingProof({documents:[{kind:'trackingShotDoc'}]}),true);
assert.equal(hasTrackingProof({documents:[{kind:'invoiceDoc'}]}),false);

const sheet=read('src/DispatchTrackingPage.tsx');
assert.ok(sheet.includes("type Tab='Trackable'|'Non-trackable'"),'Unify Shree/Transport');
assert.ok(sheet.includes('ShreeMarutiImport'),'Preserve Shree Excel intake');
assert.ok(sheet.includes('manualCarrierUrl(r.transporter)'),'Manual URL resolver applies to both carriers');
assert.ok(sheet.includes('<TransportTrackingCapture process={capture}'),'Same manual screenshot tool for every carrier');
assert.ok(sheet.includes('Search result'),'Existing saved process screenshot button must remain');
assert.ok(sheet.includes('Transfer to'),'Existing workflow transfer must remain');
assert.ok(!sheet.includes('onBatchTrackShreeMaruti'),'No batch tracking queue');
assert.ok(!sheet.includes("onQueue("),'No per-carrier auto track action');
assert.ok(!sheet.includes("oms_tracking_workers"),'No worker polling on manual page');
assert.ok(!sheet.includes("Shree Maruti tracking worker"),'No separate automated Shree window');
const capture=read('src/TransportTrackingCapture.tsx');
assert.ok(capture.includes("cloud.upload(process.id,'trackingShotDoc',file)"));
assert.ok(capture.includes("p_process_id:process.id,p_document_id:saved.documentId"));
assert.ok(capture.includes('oms_record_tracking_capture'));
const shell=read('src/UnifiedShell.tsx');
const stage=read('src/UnifiedStagePagesB.tsx');
const prefs=read('src/settingsV2Preferences.ts');
const app=read('src/UnifiedApp.tsx');
assert.ok(!shell.includes('AI Command Center'));
assert.ok(!shell.includes("go('AI Command Center')"));
assert.ok(!stage.includes('AgentCommandCenter'));
assert.ok(!prefs.includes('AI Command Center'));
assert.ok(!app.includes('onBatchTrackShreeMaruti'));
assert.ok(!app.includes("agentApi"));
assert.ok(read('src/unifiedOps.ts').includes("if(type==='tracking')throw Error("));
const sql=read('supabase/migrations/030_manual_only_carrier_tracking_claims.sql');
assert.ok(sql.includes('oms_claim_approved_tracking('));
assert.ok(sql.includes('oms_claim_approved_shree_maruti_batch('));
assert.ok(sql.match(/No queued job is ever claimed/g)?.length===2);
assert.ok(!/update public\.oms_jobs|delete from public\.oms_jobs|update public\.oms_processes/i.test(sql));
console.log('PASS: unified manual tracking for Shree and eight transporters; statuses and screenshots remain per Process No.');
console.log('PASS: AI Command Center removed; carrier auto queue inaccessible on website and worker claims disabled.');
