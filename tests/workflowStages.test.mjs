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
assert.ok(tracking.includes('oms_tracking_workers'));
assert.ok(other.includes("filterStage([r],'DataDoc')"),'Manual DataDoc view must filter DataDoc records');
assert.ok(other.includes('Manual DataDoc Review'),'DataDoc page shows manual review, not agent queue');
assert.ok(!other.includes('<OfficeDataDocQueue '),'DataDoc automated queue must not render');
assert.ok(app.includes("Automation is disabled. Complete this process manually."),'Job queue submission must be blocked');
assert.ok(app.includes("Automatic tracking is disabled."),'Carrier tracking queue submission must be blocked');
assert.ok(dialog.includes("deletionBlockers.length>0"));
assert.ok(dialog.includes("Cancel waiting Outlook draft request"));
assert.ok(app.includes("jobs={jobs} onCancelEmailJob={onCancelEmailJob}"));
assert.ok(core.includes("WorkerFleetStatus authenticated={p.authenticated}"));
console.log('PASS: stages isolated, manual DataDoc operations, agent queues blocked and safe delete behavior');
