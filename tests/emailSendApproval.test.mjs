import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkEmailSend,defaultEmailSendDocs,documentOptions,EMAIL_SEND_VERSION} from '../src/emailSend.ts';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rec={
 id:'owner-process',owner_id:'user-1',team_id:null,stage:'Email to Client',
 process:'292280',party:'Ultratech Cement',so:'26270964',
 po:'P-123',poDate:'2026-10-01',invoice:'2627/1006',invoiceDate:'2026-10-03',
 transporter:'SHREE MARUTI',lr:'261842000047172',courierDate:'2026-10-04',weight:'5.5',
 documents:[
 {id:'eml',kind:'emailDoc',name:'customer-original.eml'},
 {id:'inv',kind:'invoiceDoc',name:'invoice1006.pdf'},
 {id:'lr',kind:'lrDoc',name:'courier-1006.pdf'}]
};
assert.equal(EMAIL_SEND_VERSION,'outlook_send_v1');
const docs=defaultEmailSendDocs(rec);
assert.deepEqual(docs,{original:'eml',invoice:'inv',lr:'lr'});
assert.equal(checkEmailSend(rec,docs).ready,true);
assert.equal(checkEmailSend({...rec,so:''},docs).ready,false);
assert.equal(checkEmailSend({...rec,stage:'Dispatch Tracking'},docs).ready,false);
assert.equal(checkEmailSend({...rec,team_id:'team'},docs).ready,false);
assert.equal(checkEmailSend({...rec,weight:'0'},docs).ready,false);
assert.equal(checkEmailSend({...rec,documents:[]},docs).ready,false);
assert.equal(checkEmailSend(rec,{original:'eml',invoice:'inv',lr:'eml'}).ready,false);
assert.equal(checkEmailSend(rec,{...docs,lr:'different-process'}).ready,false);
assert.equal(defaultEmailSendDocs({...rec,documents:[...rec.documents,{id:'eml2',kind:'emailDoc',name:'other.eml'}]}).original,'');
assert.equal(documentOptions(rec,'emailDoc').length,1);

const page=read('src/EmailToClientWorkflow.tsx');
const panel=read('src/EmailSendReview.tsx');
const api=read('src/emailSendApi.ts');
const sql=read('supabase/migrations/034_outlook_send_explicit_approval.sql');
const correctedRpc=read('supabase/migrations/035_fix_outlook_email_send_rpc_auth.sql');
const launcher=read('worker/start_worker.py');
const starter=read('worker/START_OFFICE_WORKERS.ps1');
const worker=read('worker/outlook_send_worker.py');

assert.match(page,/:'Send Email'}/,'Visible per-process send button');
assert.match(page,/<EmailSendReview record=\{r\}/);
assert.match(page,/existingRequest\.status==='queued'/);
assert.match(page,/cancelRequest\(existingRequest\)/);
assert.match(page,/emailWorkerActive\(emailWorker\)/);
assert.match(page,/I sent this in Outlook · Track/,'Manual Outlook remains available');
assert.match(panel,/checkEmailSend\(record,selected\)/);
assert.match(panel,/phrase===expected/);
assert.match(panel,/expected='SEND '\+record\.process/);
assert.match(panel,/window\.confirm/);
assert.match(panel,/p_original_document_id|requestEmailSend\(record,selected,phrase\)/);
assert.match(api,/oms_request_email_send/);
assert.match(api,/oms_cancel_email_send/);
assert.match(api,/oms_email_send_requests/);
assert.match(api,/data\.status!=='queued'/);
assert.doesNotMatch(api,/SUPABASE_SERVICE_ROLE_KEY/);

assert.match(sql,/oms_email_send_requests/);
assert.match(sql,/alter table public\.oms_email_send_requests enable row level security/);
assert.match(sql,/grant select on public\.oms_email_send_requests to authenticated/);
assert.match(sql,/create policy oms_email_send_owner_read/);
assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
assert.match(sql,/create or replace function public\.oms_request_email_send/);
assert.match(sql,/user_id=v_uid and team_id is null/);
assert.match(sql,/p_confirmation is distinct from 'SEND '\|\|v_proc\.process_no/);
assert.match(sql,/p_original_document_id/);
assert.match(sql,/p_invoice_document_id/);
assert.match(sql,/p_lr_document_id/);
assert.match(sql,/create unique index if not exists oms_email_send_one_attempt_per_process/);
assert.match(sql,/for update of q skip locked/);
assert.match(sql,/status='running'/);
assert.match(sql,/create or replace function public\.oms_cancel_email_send/);
assert.match(sql,/status='queued'/);
assert.match(sql,/create or replace function public\.oms_finish_email_send/);
// SECURITY DEFINER current_user is postgres/function owner, not service_role.
assert.doesNotMatch(correctedRpc,/if current_user<>'service_role'/,'No broken service_role comparison in definer functions');
assert.match(correctedRpc,/create or replace function public\.oms_claim_email_send/);
assert.match(correctedRpc,/create or replace function public\.oms_finish_email_send/);
assert.match(correctedRpc,/grant execute on function public\.oms_claim_email_send\(uuid,text\) to service_role/);
assert.match(correctedRpc,/grant execute on function public\.oms_finish_email_send\(uuid,text,boolean,text\)/);
assert.match(correctedRpc,/revoke all on function public\.oms_claim_email_send/);
assert.match(correctedRpc,/revoke all on function public\.oms_finish_email_send/);
assert.doesNotMatch(correctedRpc,/delete from public\.oms_email_send_requests|update public\.oms_email_send_requests\s+set\s+status='queued'/,
  'Migration must not delete or resend existing email requests');
assert.match(sql,/delivery_confirmed',false/);
assert.match(sql,/outlook_send_invoked/);
assert.doesNotMatch(sql,/drop trigger.*oms_only_datadoc|delete from public\.oms_jobs|update public\.oms_jobs/i,
 'DataDoc-only queue and past jobs are untouched');
assert.match(launcher,/"outlook_send_worker.py"/);
assert.doesNotMatch(starter,/outlook_send_worker\.py/,'Never autostart real email sender');
assert.match(worker,/PJS_ENABLE_LIVE_EMAIL_SEND","0"\)=="1"/);
assert.match(worker,/message_id=source_message_id\(original_path\)/);
assert.match(worker,/find_original_message\(account,message_id,max_scan=700\)/);
assert.match(worker,/reply=original\.ReplyAll\(\)/);
assert.match(worker,/reply\.SendUsingAccount=account/);
assert.match(worker,/reply\.Send\(\)/);
assert.match(worker,/recipients\.ResolveAll\(\)/);
assert.match(worker,/No reclaim of Running requests/);
assert.match(worker,/process_updated_at/);
assert.match(worker,/byid\[doc_id\]\.get\("kind"\)!=kind/);
assert.match(worker,/check_settings\(settings\)/);
assert.match(worker,/worker.*enabled/i);

console.log('PASS: Send Email per process, explicit typed approval, attachments, status and cancel controls');
console.log('PASS: Owner-only RLS and no-retry separate queue; DataDoc and manual tracking preserved');
console.log('PASS: Windows sender fail-closed by default and authentic Outlook Reply All only');
