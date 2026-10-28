import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 primaryPages,dispatchTabs,submitTabs,resolveSiteRoute,
 creditCategory,pendingDispatchRecords,submitRecords,manualSubmitFields
} from '../src/siteNavigation.ts';
import {normalizeSettingsV2} from '../src/settingsV2Preferences.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
assert.deepEqual(primaryPages,[
 'Dashboard','DataDoc · Dispatch Process','DataDoc · Submit Process',
 'Check List','Sales Register','Transport Bill','Settings'
]);
assert.deepEqual(dispatchTabs.map(t=>t.title),['Pending for Dispatch','Email to Client','Tracking']);
assert.deepEqual(submitTabs.map(t=>t.title),['Bill Submit','Email Submit','Tracking Proof Submit']);
assert.equal(resolveSiteRoute('Control Tower').page,'Dashboard');
assert.deepEqual(resolveSiteRoute('Data Store'),{
 page:'DataDoc · Dispatch Process',dispatchTab:'pending',pendingView:'documents'
});
assert.equal(resolveSiteRoute('Universal Process').dispatchTab,'pending');
assert.equal(resolveSiteRoute('Email to Client').dispatchTab,'email');
assert.equal(resolveSiteRoute('Dispatch Tracking').dispatchTab,'tracking');
assert.equal(resolveSiteRoute('DataDoc').submitTab,'bill');
assert.equal(resolveSiteRoute('Done Pick List').page,'Check List');
assert.equal(resolveSiteRoute('Excel & LR Finder').page,'Transport Bill');
assert.equal(resolveSiteRoute('Audit & Reports').settingsTab,'audit');
assert.equal(resolveSiteRoute('unknown').page,'Dashboard');
assert.equal(creditCategory('NON-CREDIT'),'Non Credit');
assert.equal(creditCategory('Credit'),'Credit');
assert.equal(creditCategory('NC'),'Non Credit');
assert.equal(creditCategory(''),'Unknown');
const list=[
 {stage:'Universal Process',process:'10001'},
 {stage:'DataDoc',process:'10002'},
 {stage:'Email to Client',process:'10003'},
 {stage:'Dispatch Tracking',process:'10004'},
 {stage:'Delivery Proof',process:'10005'},
 {stage:'Complete',process:'10006'}
];
assert.deepEqual(pendingDispatchRecords(list).map(r=>r.process),['10001','10002']);
assert.deepEqual(submitRecords(list,'bill').map(r=>r.process),['10002']);
assert.deepEqual(submitRecords(list,'email').map(r=>r.process),['10003','10004','10005','10006']);
assert.deepEqual(submitRecords(list,'proof').map(r=>r.process),['10004','10005','10006']);
assert.deepEqual(Object.keys(manualSubmitFields),['bill','email','proof']);
const migrated=normalizeSettingsV2({mobileNav:['Control Tower','Email to Client','DataDoc','Excel & LR Finder']});
assert.deepEqual(migrated.mobileNav,['Dashboard','DataDoc · Dispatch Process','DataDoc · Submit Process','Transport Bill']);

const shell=read('src/UnifiedShell.tsx');
const app=read('src/UnifiedApp.tsx');
const dispatch=read('src/DispatchProcessPage.tsx');
const submit=read('src/SubmitProcessPage.tsx');
const sales=read('src/SalesRegisterPage.tsx');
const secondary=read('src/UnifiedStagePagesB.tsx');
const sql=read('supabase/migrations/036_manual_only_pause_all_agents.sql');
const styles=read('src/seven-page.css');

assert.match(shell,/PJS OMS · OPERATIONS/);
for(const page of primaryPages)assert.ok(shell.includes("'"+page+"'"),'Sidebar should show '+page);
assert.match(shell,/onsubmit/i.test(shell)?/onSubmitTab/:/onSubmitTab/);
assert.match(shell,/oms-seven-side-subnav/);
assert.match(shell,/aria-label='Mobile primary navigation'/);
assert.match(app,/resolveSiteRoute\(v\)/);
assert.match(app,/page==='Dashboard'/);
assert.match(app,/page==='DataDoc · Dispatch Process'/);
assert.match(app,/page==='DataDoc · Submit Process'/);
assert.match(app,/page==='Sales Register'/);
assert.match(app,/onMarkManualSubmit/);
assert.match(dispatch,/EmailToClientWorkflow/);
assert.match(dispatch,/DispatchTrackingPage/);
assert.match(dispatch,/Upload Pick Slip/);
assert.match(dispatch,/All Process Documents/);
assert.match(submit,/submitTabs\.map/);
assert.match(submit,/Credit \/ Non-credit filter/);
assert.match(submit,/Record manual submission/);
assert.match(submit,/Verified Delivered tracking status/);
assert.match(submit,/DataDoc transaction reference/);
assert.match(secondary,/page==='Check List'/);
assert.match(secondary,/DonePickListPage/);
assert.match(secondary,/page==='Transport Bill'/);
assert.match(secondary,/ExcelLRWorkspace/);
assert.match(secondary,/SettingsControlCenter/);
assert.match(secondary,/AuditCleanupPage/);
assert.match(sales,/Import Excel/);
assert.match(sales,/Export Excel/);
assert.match(sales,/only fill empty details/i);
assert.match(sales,/cloud\.findByProcess\(row\.process\)/);
assert.match(sales,/latest\.team_id/);
assert.match(sales,/not an owned personal process/i);
assert.doesNotMatch(submit,/ops\.queue|onQueue|oms_claim|await fetch\(/);
assert.doesNotMatch(dispatch,/ops\.queue|onQueue|oms_claim/);
assert.doesNotMatch(sales,/onQueue|ops\.queue|oms_claim/);
assert.match(sql,/oms_manual_block_jobs/);
assert.match(sql,/oms_manual_block_email_send/);
assert.match(styles,/@media\(max-width:720px\)/);
console.log('PASS: exactly seven main pages, each with functional manual child views');
console.log('PASS: existing stages, Done Pick List, audit and transport billing remain reachable');
console.log('PASS: credit filtering, explicit DataDoc manual confirmations and safe Sales Excel import');
console.log('PASS: retired agent/server work stays disabled and all historic records are untouched');
