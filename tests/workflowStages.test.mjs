import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterStage,normalizedStage} from '../src/workflowStages.ts';
const processes=[
 {process:'A',stage:'Universal Process'},
 {process:'B',stage:'Email to Client',invoice:'123'},
 {process:'C',stage:'Dispatch Tracking',invoice:'124'},
 {process:'D',stage:'DataDoc'},
 {process:'E',stage:'Delivery Proof'},
 {process:'F',stage:'Complete'},
 {process:'G',stage:'DataDoc Bill Submit'},
 {process:'H',invoice:'999'},
];
assert.deepEqual(filterStage(processes,'Universal Process').map(x=>x.process),['A','H'],'Intake only includes unassigned/universal records');
assert.deepEqual(filterStage(processes,'Email to Client').map(x=>x.process),['B'],'Invoice number alone never makes a process appear in Email');
assert.deepEqual(filterStage(processes,'Dispatch Tracking').map(x=>x.process),['C']);
assert.deepEqual(filterStage(processes,'DataDoc').map(x=>x.process),['D','G']);
assert.equal(normalizedStage({stage:'  EMAIL TO CLIENT  '}),'Email to Client');
assert.equal(normalizedStage({stage:'Unrecognized Stage'}),'Other');
const core=readFileSync(new URL('../src/UnifiedCorePages.tsx',import.meta.url),'utf8');
const email=readFileSync(new URL('../src/EmailToClientWorkflow.tsx',import.meta.url),'utf8');
const other=readFileSync(new URL('../src/UnifiedStagePagesA.tsx',import.meta.url),'utf8');
const tracking=readFileSync(new URL('../src/DispatchTrackingPage.tsx',import.meta.url),'utf8');
const dialog=readFileSync(new URL('../src/UnifiedDialog.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/UnifiedApp.tsx',import.meta.url),'utf8');
assert.ok(core.includes("filterStage(results,'Universal Process')"));
assert.ok(core.includes("RecordsTable records={universalRows}"));
assert.ok(core.includes("onStage(r,'DataDoc','Pending')"));
assert.ok(email.includes("filterStage(results,'Email to Client')"));
assert.ok(other.includes("<DispatchTrackingPage p={p}/>"));
assert.ok(tracking.includes("filterStage(results,'Dispatch Tracking')"));
assert.ok(tracking.includes('manualCarrierUrl(r.transporter)'),'Manual carrier tracking must work for all supported carriers');
assert.ok(!tracking.includes('oms_tracking_workers'),'Carrier worker controls retired');
assert.ok(other.includes("filterStage(results,'DataDoc')"));
assert.ok(other.includes("disabled={busy||Boolean(submitted||queued)}"),'Bill Submit request button must not be disabled by informational document notes');
assert.ok(other.includes("Queue request · wait for details"),'Incomplete requests must never claim to be submitted');
const ops=readFileSync(new URL('../src/unifiedOps.ts',import.meta.url),'utf8');
assert.ok(ops.includes("office_policy:'zip_v2'"),'New requests must use ZIP v2 server-enforced deferred claiming');
assert.ok(other.includes('Approve ZIP Bill Submit'), 'UI must show ZIP transaction workflow');
assert.ok(ops.includes("bill_package:'zip_invoice_and_available_pdfs'"), 'Queue records expected package type');
assert.ok(dialog.includes("deletionBlockers.length>0"));
assert.ok(!dialog.includes("Cancel waiting Outlook draft request"),'Retired Outlook automation controls must be removed');
assert.ok(!app.includes("onCancelEmailJob={onCancelEmailJob}"),'The process editor must not queue Outlook work');
assert.ok(core.includes("WorkerFleetStatus authenticated={p.authenticated}"));
console.log('PASS: stages isolated, safe delete blockers, manual tracking and independent office worker controls');
