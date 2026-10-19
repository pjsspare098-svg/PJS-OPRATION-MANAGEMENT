import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TRACKING_EXCEL_HEADERS,TRACKING_EXCEL_LIMIT,
 normalizeTrackingCredit,previewShreeMarutiImport
} from '../src/trackingExcelImport.ts';
import {checkJob} from '../src/businessRules.ts';

assert.deepEqual([...TRACKING_EXCEL_HEADERS],
 ['Process No.','Credit / Non-Credit','Sales Person Name','Tracking ID']);
assert.equal(normalizeTrackingCredit('Non-Credit'),'Non Credit');
assert.equal(normalizeTrackingCredit('Non / Credit'),'Non Credit');
assert.equal(normalizeTrackingCredit('Credit'),'Credit');
assert.equal(normalizeTrackingCredit('Debit'),null);
const preview=previewShreeMarutiImport([
 [...TRACKING_EXCEL_HEADERS],
 ['292184','Non-Credit','Deepa Bisht','001234567890'],
 ['295845','Credit','Sales Officer','ARHAM-123456'],
 ['292184','Credit','Another Sales','LR99888'],
 ['bad','Credit','Valid Name','LR99888'],
 ['292860','Credit','Sales Officer','ab'],
 ['292861','Other','Sales Officer','234565678'],
 ['292862','Credit','Valid Name','45678901'],
],['292862','290219']);
assert.equal(preview.total,7);
assert.deepEqual(preview.valid.map(r=>r.process),['292184','295845']);
assert.equal(preview.valid[0].lr,'001234567890','Leading zeros must remain unchanged');
assert.equal(preview.rejected.length,5);
assert.match(preview.rejected[0].reason,/Duplicate/);
assert.match(preview.rejected.at(-1).reason,/already exists/i);
assert.equal(checkJob({process:'292184',party:'',transporter:'SHREE MARUTI',lr:'001234567890',documents:[]},'tracking').ready,true,
 'The existing four-column spreadsheet format is still valid for manual tracking intake');
assert.equal(checkJob({process:'292184',party:'',transporter:'SHREE MARUTI',lr:'',documents:[]},'tracking').ready,false);
const offset=previewShreeMarutiImport([
 [],['Internal dispatch tracking workbook'],['Process Number','Credit Type','Sales Person','LR No.'],
 ['292200','N/C','Vivek Pal','0008999000']
],[]);
assert.equal(offset.valid[0].line,4);
assert.equal(offset.valid[0].credit,'Non Credit');
assert.throws(()=>previewShreeMarutiImport([['Process','Credit','Sales Person']],[]),/Required columns/);
const tooMany=[TRACKING_EXCEL_HEADERS,...Array.from({length:TRACKING_EXCEL_LIMIT+1},(_,i)=>[String(292000+i),'Credit','Test Person','123456789'])];
assert.throws(()=>previewShreeMarutiImport(tooMany,[]),/at most/);
const trackingUi=readFileSync(new URL('../src/DispatchTrackingPage.tsx',import.meta.url),'utf8');
assert.doesNotMatch(trackingUi,/onBatchTrackShreeMaruti|Track All\s*\(/,'No automatic Track All in the tracking page');
assert.match(trackingUi,/ShreeMarutiImport/);
const parent=readFileSync(new URL('../src/UnifiedApp.tsx',import.meta.url),'utf8');
assert.doesNotMatch(parent,/onBatchTrackShreeMaruti/,'Auto-queue action must be gone from parent');
assert.match(parent,/Automatic carrier tracking is retired/,'Explicitly disable automatic website tracking queues');
console.log('PASS: tracking Excel headers, aliases, clean rows, duplicates, missing IDs, zero padding and limits');
console.log('PASS: Manual Shree Excel intake retained; no automatic Track All queue');
