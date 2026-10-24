import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 EMAIL_EXCEL_FIELDS,EMAIL_EXCEL_LIMIT,previewEmailExcelImport,
 normalizeEmailExcelRow,mergeEmailExcelFields,emailExcelChanges
} from '../src/emailExcelImport.ts';

const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const fields=EMAIL_EXCEL_FIELDS.map(x=>x[1]);
assert.deepEqual(fields.slice(0,4),['Process No.','Party Name','SO No.','Invoice No.']);
const userId='owner-1';
const old=[
 {id:'email1',owner_id:userId,team_id:null,process:'292712',party:'Ultratech Cement Ltd',so:'26271014',stage:'Email to Client',status:'Ready for Email',invoice:'2627/984',transporter:'',po:'',documents:[{id:'doc1'}]},
 {id:'datadoc1',owner_id:userId,process:'292800',party:'Other Co',so:'26271015',stage:'DataDoc'},
 {id:'team1',owner_id:userId,team_id:'team-1',process:'292801',stage:'Email to Client',party:'Team Co',so:'123'},
 {id:'other1',owner_id:'someone-else',process:'292802',stage:'Email to Client',party:'Other Co',so:'124'}
];
const sheet=[
 fields,
 ['292712','Ultratech Cement Ltd','26271014','2627/984','PO-777','24/10/2026','2026-10-23','Shree Maruti','001234567890','25/10/2026','12.5','Spares','Vivek Pal','Non-Credit'],
 ['292813','New Customer','26279999','INV-44','','','','','','','','','',''],
 ['292800','Other Co','26271015','INV-99'],
 ['292801','Team Co','123','INV-99'],
 ['292802','Other Co','124','INV-100'],
 ['292712','Ultratech Cement Ltd','26271014','INV-X'],
 ['not-process','Test','456'],
 ['292814','','','INV'],
 ['292815','New Invalid','123','','','31/02/2026'],
 ['292816','New Invalid','123','','','','','','','','','','','Whatever'],
 ['292817','New Invalid','123','','','','','','','','-20']
];
const p=previewEmailExcelImport(sheet,old,userId);
assert.equal(p.total,11);
assert.equal(p.created.length,1);
assert.equal(p.updated.length,1);
assert.equal(p.updated[0].process,'292712');
assert.ok(p.updated[0].fieldsChanged.includes('po'));
assert.ok(p.updated[0].fieldsChanged.includes('lr'));
assert.equal(p.updated[0].data.poDate,'2026-10-24');
assert.equal(p.updated[0].data.courierDate,'2026-10-25');
assert.equal(p.updated[0].data.credit,'Non Credit');
assert.equal(p.created[0].process,'292813');
assert.equal(p.rejected.length,9);
assert.ok(p.rejected.some(x=>x.reason.includes('another user')));
assert.ok(p.rejected.some(x=>x.reason.includes('different')||x.reason.includes('DataDoc')));
assert.ok(p.rejected.some(x=>x.reason.includes('Shared team')));
assert.ok(p.rejected.some(x=>x.reason.includes('Duplicate')));
assert.ok(p.rejected.some(x=>x.reason.includes('requires Party Name')));
assert.ok(p.rejected.some(x=>x.reason.includes('Invalid poDate')));
assert.ok(p.rejected.some(x=>x.reason.includes('Credit category')));
assert.ok(p.rejected.some(x=>x.reason.includes('Weight must')));
const same=previewEmailExcelImport([fields,['292712','Ultratech Cement Ltd','26271014','2627/984']],old,userId);
assert.equal(same.unchanged,1);
assert.equal(same.updated.length,0);
const mismatch=previewEmailExcelImport([fields,['292712','Different Party','26271014']],old,userId);
assert.equal(mismatch.rejected.length,1);
const soMismatch=previewEmailExcelImport([fields,['292712','Ultratech Cement Ltd','99999']],old,userId);
assert.equal(soMismatch.rejected.length,1);
const modified=mergeEmailExcelFields(old[0],p.updated[0].data);
assert.equal(modified.po,'PO-777');
assert.equal(modified.invoice,'2627/984');
assert.deepEqual(modified.documents,[{id:'doc1'}]);
assert.equal(modified.status,'Ready for Email');
assert.equal(modified.stage,'Email to Client');
assert.equal(modified.owner_id,userId);
assert.equal(emailExcelChanges(old[0],p.updated[0].data).includes('po'),true);
assert.equal(normalizeEmailExcelRow({poDate:'2026-10-24',credit:'Credit'}).credit,'Credit');
assert.throws(()=>previewEmailExcelImport([['Unknown']],old,userId),/Process No/);
assert.throws(()=>previewEmailExcelImport([fields,...Array.from({length:EMAIL_EXCEL_LIMIT+1},(_,i)=>[String(300000+i),'Name','123'])],old,userId),/at most/);
const page=read('src/EmailToClientWorkflow.tsx');
const tools=read('src/EmailExcelTools.tsx');
assert.match(page,/<EmailExcelTools/);
assert.match(page,/ux-email-entry-list/);
assert.match(page,/aria-expanded=\{isOpen\}/);
assert.match(page,/Open details/);
assert.match(page,/isOpen&&<div className='ux-email-entry-details'/);
assert.match(page,/I sent this in Outlook · Track/);
assert.match(page,/Copy email/);
assert.match(page,/onConfirmEmailSent/);
assert.match(page,/onEdit\(r\)/);
assert.doesNotMatch(page,/Queue Reply All draft|onsend|oms_outlook_workers/);
assert.match(tools,/PJS_Email_to_Client_Template\.xlsx/);
assert.match(tools,/PJS_Email_to_Client_/);
assert.match(tools,/Import Excel/);
assert.match(tools,/Export Excel/);
assert.match(tools,/Confirm & Import/);
assert.match(tools,/cloud\.findByProcess\(row\.process\)/);
assert.match(tools,/latest\.owner_id!==userId/);
assert.match(tools,/normalizedStage\(latest\)!=='Email to Client'/);
assert.match(tools,/snapshot\.fields\[field\]!==String\(latest\[field\]/);
assert.match(tools,/ops\.audit/);
assert.match(tools,/stage:'Email to Client',status:'Ready for Email'/);
assert.match(tools,/emailSent:false/);
assert.doesNotMatch(tools,/ops\.queue|email_reply|cloud\.upload/,'Spreadsheet import may not queue/send emails or attach files');
console.log('PASS: Email Excel creates and updates checked rows, skips cross-stage/shared/other-owner/conflicting/invalid rows');
console.log('PASS: Preserves attachments/status/owner, manual Outlook actions, collapsed rows and expanding details');
console.log('PASS: Spreadsheet parser preview, confirm, concurrency and access guards; no email automation');
