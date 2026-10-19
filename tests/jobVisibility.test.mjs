import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isActiveAutomationJob,isAuditOnlyAutomationJob,latestProcessAutomationJob,hasAuditOnlyAutomationOutcome} from '../src/jobVisibility.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const jobs=[
 {id:'success',process_id:'p1',job_type:'bill_submit',status:'completed',created_at:'2026-10-15T10:00:00Z'},
 {id:'review',process_id:'p1',job_type:'bill_submit',status:'failed',created_at:'2026-10-15T10:01:00Z'},
 {id:'unrelated',process_id:'p1',job_type:'tracking',status:'running',created_at:'2026-10-15T10:02:00Z'},
 {id:'pending',process_id:'p2',job_type:'bill_submit',status:'queued',created_at:'2026-10-15T11:00:00Z'}
];
assert.equal(isActiveAutomationJob(jobs[3]),true);
assert.equal(isActiveAutomationJob(jobs[0]),false);
assert.equal(isAuditOnlyAutomationJob(jobs[1]),true);
assert.equal(isAuditOnlyAutomationJob({status:'cancelled'}),true);
assert.equal(isAuditOnlyAutomationJob({status:'running'}),false);
assert.equal(latestProcessAutomationJob(jobs,'p1','bill_submit')?.id,'review');
assert.equal(hasAuditOnlyAutomationOutcome(jobs,'p1','bill_submit'),true);
assert.equal(hasAuditOnlyAutomationOutcome(jobs,'p1','tracking'),false);
assert.equal(hasAuditOnlyAutomationOutcome(jobs,'p2','bill_submit'),false);
assert.equal(hasAuditOnlyAutomationOutcome(jobs,'unknown','bill_submit'),false);
assert.equal(hasAuditOnlyAutomationOutcome([...jobs,{id:'retry',process_id:'p1',job_type:'bill_submit',status:'queued',created_at:'2026-10-16T10:00:00Z'}],'p1','bill_submit'),false,'New authorized retry is active');
const queue=read('src/OfficeDataDocQueue.tsx');
const datadoc=read('src/UnifiedStagePagesA.tsx');
const email=read('src/EmailToClientWorkflow.tsx');
const tracking=read('src/DispatchTrackingPage.tsx');
const audit=read('src/UnifiedStagePagesB.tsx');
assert.ok(queue.includes(".in('status',['queued','running'])"),'Office queue must query only active jobs');
assert.ok(!queue.includes('Manual review needed'),'No error count on operational page');
assert.ok(datadoc.includes("hasAuditOnlyAutomationOutcome(jobs,r.id,'bill_submit')"),'Exclude terminal bill jobs');
assert.ok(datadoc.includes("hasAuditOnlyAutomationOutcome(jobs,r.id,'delivery_proof_submit')"),'Exclude terminal proof jobs');
assert.ok(!email.includes('{latest?.error_message'),'Failed draft details must be audit-only');
assert.ok(!tracking.includes("latest.error_message"),'Failed tracking details must be audit-only');
assert.ok(audit.includes('Automation history')&&audit.includes("jobFilter==='Errors'")&&audit.includes('j.error_message'),'Audit retains all outcomes');
assert.ok(read('src/unifiedOps.ts').includes("select('*')"),'Job source not destructively changed');
console.log('PASS: terminal automation results are audit-only; active queues and manual email completion remain available');
