import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const app=read('src/UnifiedApp.tsx');
const shell=read('src/UnifiedShell.tsx');
const dashboard=read('src/UnifiedCorePages.tsx');
const datadoc=read('src/UnifiedStagePagesA.tsx');
const email=read('src/EmailToClientWorkflow.tsx');
const tracking=read('src/DispatchTrackingPage.tsx');
const settings=read('src/SettingsControlCenter.tsx');
const audit=read('src/AuditCleanupPage.tsx');
const sql=read('supabase/migrations/036_manual_only_pause_all_agents.sql');
const edge=read('supabase/functions/pjs-agent/index.ts');
const opener=read('worker/OPEN_PJS_WEBSITE.bat');
const office=read('worker/START_OFFICE_WORKERS.ps1');
const officeBat=read('worker/START_OFFICE_WORKERS.bat');
const autostart=read('worker/install_autostart.ps1');
const cloudWorkflow=read('.github/workflows/pjs-free-cloud-worker.yml');

assert.match(shell,/MANUAL-ONLY WORKSPACE/);
assert.doesNotMatch(shell,/Office DataDoc Queue|ux-worker-card/);
assert.match(dashboard,/Manual dispatch workflow/);
assert.doesNotMatch(dashboard,/<WorkerFleetStatus/);
assert.match(datadoc,/filterStage\(results,'DataDoc'\)/);
assert.match(datadoc,/Saved tracking proof/);
assert.match(datadoc,/cloud.open\(r.id,doc.id\)/);
assert.doesNotMatch(datadoc,/OfficeDataDocQueue|DataDocProofQueue|onQueue|onApproveDataDocProof|Approve ZIP Bill Submit|Approve & Queue/);
assert.match(email,/<EmailExcelTools/);
assert.match(email,/Copy email/);
assert.match(email,/I sent this in Outlook · Track/);
assert.match(email,/Download original email/);
assert.doesNotMatch(email,/EmailSendReview|emailSendApi|Send Email|emailWorkerActive|cancelRequest|oms_email_send_requests/);
assert.match(tracking,/Nothing is auto-tracked or queued from this page/);
assert.doesNotMatch(app,/onQueue|onApproveDataDocProof|ops\.queue\(|ops\.approveTrackingProof\(/);
assert.match(app,/Manual Outlook Reply All sent confirmed by operator/);
assert.match(settings,/Manual-only Settings sections/);
assert.match(settings,/<TeamWorkspace/);
assert.match(settings,/<WorkspaceResetPanel/);
assert.match(settings,/<PdfOcrTestBench/);
assert.doesNotMatch(settings,/<WorkerFleetStatus|<SettingsNotifications|tab==='automation'|tab==='worker'|id:'automation'|id:'worker'/);
assert.match(audit,/Previous job history/);
assert.match(audit,/ops\.reconcileStaleTrackingJob/);
assert.match(audit,/ops\.archiveAuditView/);

for(const name of [
 'oms_manual_block_jobs','oms_manual_block_email_send','oms_manual_block_agent_tasks',
 'oms_claim_approved_office_bill','oms_claim_datadoc_tracking_proof',
 'oms_claim_approved_tracking','oms_claim_approved_shree_maruti_batch',
 'oms_claim_outlook_draft','oms_claim_email_send','oms_cloud_claim',
 'oms_agent_enqueue_due_reminders','cron.alter_job'
])assert.ok(sql.includes(name),'All automation blocked: '+name);
assert.doesNotMatch(sql,/\bdelete\s+from\b|\btruncate\s+table\b|\bdrop\s+table\b/i,
 'Do not delete business records while disabling agents.');
assert.match(edge,/status:410/);
assert.match(edge,/enabled:false/);
assert.doesNotMatch(edge,/api\.openai\.com|OPENAI_API_KEY/);
assert.match(opener,/start "" "https:\/\/pjs-oms-independent/);
assert.doesNotMatch(opener,/call .*START_OFFICE_WORKERS/);
assert.doesNotMatch(office,/Start-Process|independent_worker\.py|datadoc_proof_worker\.py/);
assert.doesNotMatch(officeBat,/powershell\.exe|START_OFFICE_WORKERS\.ps1/);
assert.doesNotMatch(autostart,/Register-ScheduledTask|Start-ScheduledTask/);
assert.doesNotMatch(cloudWorkflow,/cron:\s*['"]/,'No agent GitHub Actions cron');

console.log('PASS: all user-facing agent/worker actions removed from manual-only PJS OMS');
console.log('PASS: all new jobs and worker claims blocked, scheduled reminders and cloud runs stopped');
console.log('PASS: processes, manual Outlook, carrier tracking, attachments, audit and settings remain');
