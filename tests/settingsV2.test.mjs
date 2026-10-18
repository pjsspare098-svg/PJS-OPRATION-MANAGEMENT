import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeSettingsV2,defaultSettingsV2,mobileChoices,dashboardChoices,
 SETTINGS_V2_KEY,SETTINGS_V2_EVENT
} from '../src/settingsV2Preferences.ts';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('src/SettingsControlCenter.tsx');
const controls=read('src/SettingsPersonalization.tsx');
const shell=read('src/UnifiedShell.tsx');
const dashboard=read('src/UnifiedCorePages.tsx');
const app=read('src/UnifiedApp.tsx');
const prefs=read('src/settingsV2Preferences.ts');

assert.equal(SETTINGS_V2_KEY,'pjs_oms_local_settings_v2');
assert.equal(SETTINGS_V2_EVENT,'pjs-oms-settings-v2-changed');
assert.deepEqual(normalizeSettingsV2(null),defaultSettingsV2);
assert.deepEqual(normalizeSettingsV2({fontSize:'extra',highContrast:true,reduceMotion:true,mobileNav:['DataDoc','Data Store','Settings','Control Tower'],dashboardCards:['attention','completed']}),{
 fontSize:'extra',highContrast:true,reduceMotion:true,
 mobileNav:['DataDoc','Data Store','Settings','Control Tower'],
 dashboardCards:['attention','completed']
});
assert.deepEqual(normalizeSettingsV2({mobileNav:['Control Tower','Control Tower','Data Store','DataDoc'],dashboardCards:[]}).mobileNav,defaultSettingsV2.mobileNav,'Duplicate bottom tabs must fall back safely');
assert.deepEqual(normalizeSettingsV2({dashboardCards:[]}).dashboardCards,defaultSettingsV2.dashboardCards,'Never hide all dashboard cards');
assert.deepEqual(normalizeSettingsV2({fontSize:'invalid'}).fontSize,'normal');
assert.equal(mobileChoices.length,12);
assert.deepEqual(dashboardChoices,['total','workflow','attention','completed']);
assert.match(prefs,/localStorage\.setItem\(SETTINGS_V2_KEY/,'UI settings must be browser-local');
assert.doesNotMatch(prefs,/from ['"]\.\/independentClient|createClient|SUPABASE_SERVICE_ROLE_KEY|\bfetch\(/i,'Local settings must have no server calls or secrets');
for(const section of ['appearance','mobile','dashboard','alerts','automation','camera','security','backup'])
 assert.ok(ui.includes("id:'"+section+"'"),'Required Settings 2.0 section '+section);
for(const existing of ["<WorkerFleetStatus","<TeamWorkspace","<SettingsNotifications","<WorkspaceResetPanel","<PdfOcrTestBench","<HistoricalImport","ops.updatePreferences","onExport"])
 assert.ok(ui.includes(existing),'Previously working control must remain: '+existing);
assert.match(ui,/SettingsPersonalization section='appearance'/);
assert.match(ui,/SettingsPersonalization section='mobile'/);
assert.match(ui,/SettingsPersonalization section='dashboard'/);
assert.match(shell,/readSettingsV2\(\)\.mobileNav/,'Phone tabs must use saved device preference');
assert.match(shell,/phoneNav\.map\(page=>/,'Configurable tab labels must retain existing destinations');
assert.match(shell,/mobileNav\.map/,'More drawer remains available');
assert.match(dashboard,/visibleCards\.includes\('total'\)/);
assert.match(dashboard,/visibleCards\.includes\('completed'\)/);
assert.match(controls,/selectNav\(index,e.target.value as MobilePage\)/);
assert.match(controls,/if\(previous>=0\)/,'Duplicate navigation selection must swap positions');
assert.match(controls,/if\(exists&&prefs.dashboardCards.length===1\)return/,'Keep at least one card');
assert.match(app,/applySettingsV2\(readSettingsV2\(\)\)/);
console.log('PASS: Settings 2.0 preferences, validation, 8 sections and operational invariants');
