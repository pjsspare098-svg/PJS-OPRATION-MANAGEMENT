import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell=readFileSync('src/UnifiedShell.tsx','utf8');
const app=readFileSync('src/UnifiedApp.tsx','utf8');
const styles=readFileSync('src/responsive-redesign.css','utf8');

for(const [section,label] of [
 ['Control Tower','Home'],
 ['Universal Process','Processes'],
 ['Data Store','Documents'],
 ['Dispatch Tracking','Tracking']
]){
 assert.ok(shell.includes("page:'"+section+"',label:'"+label+"'"),label+' must navigate to existing workflow');
}
assert.match(shell,/aria-label='Mobile primary navigation'/,'mobile navigation must have an accessible label');
assert.match(shell,/aria-current=\{page===id\?'page':undefined\}/,'active page must be announced');
assert.match(shell,/aria-controls='oms-sidebar'/,'More menu must identify the sidebar');
assert.match(shell,/onClick=\{\(\)=>go\(id\)\}/,'navigation must use existing onPage callback');
assert.match(shell,/aria-label='Close navigation'/,'drawer must remain dismissible');
assert.match(shell,/href='#oms-main-content'/,'keyboard users must be able to skip navigation');
assert.match(app,/import '\.\/responsive-redesign\.css';/,'responsive stylesheet must load after existing styles');
assert.match(styles,/@media\(max-width:760px\)/,'mobile breakpoint must be present');
assert.match(styles,/env\(safe-area-inset-bottom\)/,'bottom bar must respect phone safe area');
assert.match(styles,/\.ux-mobile-bottom-nav\{display:flex/,'mobile bar must be visible on phones');
assert.match(styles,/\.ux-tablewrap\{overflow-x:auto/,'wide operational tables must remain scrollable');
assert.doesNotMatch(styles,/display:\s*none[^}]*\.ux-(?:field|panel)/,'essential workflow controls must not be hidden');

console.log('PASS: responsive navigation, accessibility and workflow invariants');
