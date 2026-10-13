import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(file)=>readFileSync(new URL('../worker/'+file,import.meta.url),'utf8');
const open=read('OPEN_PJS_WEBSITE.bat');
const ps1=read('START_OFFICE_WORKERS.ps1');
const shortcut=read('INSTALL_PJS_WEBSITE_SHORTCUT.ps1');
const launcher=read('start_worker.py');
const checks=read('office_preflight.py');
assert.ok(open.includes('START_OFFICE_WORKERS.bat'),'Website shortcut must launch existing validated workers');
assert.ok(open.includes('https://pjs-oms-independent-pjsspare098-2655.vercel.app/'));
assert.ok(shortcut.includes('OPEN_PJS_WEBSITE.bat')&&shortcut.includes('CreateShortcut'));
assert.ok(ps1.includes('Get-CimInstance Win32_Process'),'Avoid starting duplicate already-running workers');
assert.ok(ps1.includes('Already running: $worker'));
assert.ok(launcher.includes('acquire_worker_lock')&&launcher.includes('WorkerAlreadyRunning'));
assert.ok(checks.includes('oms_office_workers'));
assert.ok(!open.includes('SUPABASE_SERVICE_ROLE_KEY'),'Never store credentials in website opener');
for (const file of [open,ps1,shortcut,launcher])
  assert.ok(!file.includes('PJS_ENABLE_LIVE_DATADOC=1')&&!file.includes('PJS_ENABLE_LIVE_TRACKING=1')&&!file.includes('PJS_ENABLE_OUTLOOK_DRAFT=1'),'Do not silently enable external actions');
console.log('PASS: one-click worker + website shortcut is idempotent and preserves activation flags');
