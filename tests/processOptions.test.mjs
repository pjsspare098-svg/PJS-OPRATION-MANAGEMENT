import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {salesPeople,productNames} from '../src/processOptions.ts';

assert.equal(salesPeople.length,43,'All 43 supplied Sales Person names must be available');
assert.equal(productNames.length,10,'All 10 supplied Product Name options must be available');
assert.equal(new Set(salesPeople.map(x=>x.toLowerCase())).size,salesPeople.length,'No duplicate salesperson names');
assert.equal(new Set(productNames.map(x=>x.toLowerCase())).size,productNames.length,'No duplicate product names');
assert.ok([...salesPeople,...productNames].every(name=>name===name.trim()&&name.length>0),'No whitespace-only values');
assert.ok(salesPeople.includes('Vivek Pal'));
assert.ok(salesPeople.includes('Bhubanesh Koul'));
assert.ok(salesPeople.includes('Jhonson Puthnivilayil'));
assert.ok(salesPeople.includes('chetan solanki'));
assert.ok(productNames.includes('HW Spares & BarePump'));
assert.ok(productNames.includes('Nishant (All HJ, Cement, Marble)'));
assert.ok(productNames.includes('SCRAP'));

const editor=readFileSync(new URL('../src/UnifiedDialog.tsx',import.meta.url),'utf8');
assert.ok(editor.includes("so:'',productName:''"),'Product Name must be saved in the process record');
assert.ok(editor.indexOf("['so','SO No.']") < editor.indexOf("<label className='ux-field'>Product Name"),'Product Name must follow SO No.');
assert.ok(editor.includes('productNames.map('),'Product Name must have selectable options');
assert.ok(editor.includes('salesPeople.map('),'Sales Person must have selectable options');
assert.ok(!editor.includes("['clientEmail','Client Email']"),'Client Email must not appear in the process form');

const cloud=readFileSync(new URL('../src/cloud.ts',import.meta.url),'utf8');
assert.ok(cloud.includes('data:{...input,'),'Process fields must persist through the existing Supabase JSON payload');
console.log('PASS: 43 Sales Person names, 10 Product Names, form ordering, removal of Client Email and Supabase persistence path');
