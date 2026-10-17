import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transferDestinations,stageDisplayNames,transferStageStatus,processTransferIssues} from '../src/processTransfer.ts';
import {filterStage} from '../src/workflowStages.ts';

assert.deepEqual(transferDestinations,[
 'Universal Process','DataDoc','Email to Client','Dispatch Tracking',
 'Done Pick List','Check List','Delivery Proof','Complete'
]);
assert.ok(transferDestinations.every(stage=>stageDisplayNames[stage].length>0));
assert.equal(transferStageStatus('Email to Client'),'Ready for Email');
assert.equal(transferStageStatus('Check List'),'Needs Review');
assert.equal(transferStageStatus('DataDoc'),'Pending');
assert.equal(transferStageStatus('Complete'),'Completed');
const process={id:'a',process:'292864',stage:'Universal Process',status:'Review',documents:[{kind:'pickDoc'}],party:'Example',so:'26271020'};
assert.deepEqual(processTransferIssues(process,'Universal Process'),['Process is already in this stage']);
assert.deepEqual(processTransferIssues(process,'Dispatch Tracking'),[]);
assert.deepEqual(processTransferIssues(process,'Email to Client'),[]);
assert.deepEqual(processTransferIssues(process,'DataDoc'),[]);
assert.ok(processTransferIssues(process,'Complete').length>0,'Closing still requires verified delivery rules');
const job={process_id:'a',job_type:'tracking',status:'running'};
assert.ok(processTransferIssues(process,'DataDoc',[job]).some(x=>x.includes('active automation')));
assert.ok(processTransferIssues(process,'Email to Client',[{...job,status:'queued'}]).length>0);
assert.deepEqual(processTransferIssues(process,'Email to Client',[{...job,status:'completed'}]),[]);
assert.ok(processTransferIssues(process,'Dispatch Tracking',[],[{process_id:'a',status:'open'}]).length>0);
const completed={...process,status:'Delivered',documents:[{kind:'proofDoc'}]};
const deliveryJob={process_id:'a',job_type:'delivery_proof_submit',status:'completed'};
assert.deepEqual(processTransferIssues(completed,'Complete',[deliveryJob]),[],'Confirmed proof allows closing');
assert.equal(filterStage([{...process,stage:'DataDoc'}],'DataDoc').length,1);
const dialog=readFileSync(new URL('../src/UnifiedDialog.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/UnifiedApp.tsx',import.meta.url),'utf8');
assert.ok(dialog.includes('Transfer Process'));
assert.ok(dialog.includes('Save &amp; Transfer'));
assert.ok(dialog.includes('processTransferIssues(draft,destination'));
assert.ok(dialog.includes('No bill, email or tracking automation was started')||app.includes('No bill, email or tracking automation was started'));
assert.ok(app.includes('if(failures.length){')&&app.indexOf('if(failures.length){')<app.indexOf('await ops.stage(saved,transferTo'),'Transfer must wait for successful attachments');
assert.ok(app.includes('exceptions={exceptions}'),'Transfer guard receives unresolved exceptions');
console.log('PASS: workflow destinations, running-job guards, verified closure, safe upload-first transfer, UI wiring');
