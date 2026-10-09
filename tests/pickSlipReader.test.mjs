import assert from 'node:assert/strict';
import {parsePickSlipRows,PickSlipParseError} from '../src/pickSlipReader.ts';
const expect=(label,rows,value)=>{
 const result=parsePickSlipRows(rows);
 assert.deepEqual(result,value,label);
};
expect('PJS printed header with No. and Number underneath',[
 'SALES ORDER PICK SLIP REPORT Report Print Date & Time: 09-Oct-2026 10:44:10',
 'Sales Order 26270965 Job Number: Material Issuer Name:',
 'No.',
 'Sales Order 24-SEP-26 Pick Slip No.: 5497961 Material Issue Date & Time:',
 'Type',
 'Party Name Example Engineering Pvt. Ltd. Move Order: Net Weight:',
 'Process 292487 Total Weight:',
 'Number',
 'Lin Task Item Description Uom Req.'
],{process:'292487',party:'Example Engineering Pvt. Ltd.',so:'26270965'});
expect('Madelin-style header from alternate layout',[
 'SALES ORDER PICK SLIP REPORT Report Print Date & Time:',
 'Sales Order 26270964 Job Number:',
 'No.',
 'Party Name Demo Supplies Co. Ltd. Move Order: Net Weight:',
 'Process 292184 Total Weight:',
 'Number',
],{process:'292184',party:'Demo Supplies Co. Ltd.',so:'26270964'});
expect('one-line PDF text stream with split heading',[
 'SALES ORDER PICK SLIP REPORT Sales Order No. 26271017 Job Number: Material Issuer Name: Sales Order Type 26-AUG-26 Pick Slip No.: 5499962 Party Name Example Overseas Trading Ltd. Move Order: Net Weight: Process Number 291771 Total Weight:'
],{process:'291771',party:'Example Overseas Trading Ltd.',so:'26271017'});
expect('party name separated from label',[
 'SALES ORDER PICK SLIP REPORT',
 'Sales Order 26271016 Job Number:',
 'Party Name',
 'Sample Cement Limited Move Order: Net Weight:',
 'Process No. 292168 Total Weight:',
],{process:'292168',party:'Sample Cement Limited',so:'26271016'});
expect('process label without number continuation',[
 'SALES ORDER PICK SLIP REPORT',
 'Sales Order No: 26270001',
 'Party Name Alpha Fabrication Pvt. Ltd. Move Order:',
 'Process: 292000'
],{process:'292000',party:'Alpha Fabrication Pvt. Ltd.',so:'26270001'});
expect('repeated matching headers produce only one process',[
 'SALES ORDER PICK SLIP REPORT',
 'Sales Order 26271016 Job Number:',
 'Party Name Sample Cement Limited Move Order:',
 'Process 292168 Total Weight:',
 'SALES ORDER PICK SLIP REPORT',
 'Sales Order 26271016 Job Number:',
 'Party Name Sample Cement Limited Move Order:',
 'Process 292168 Total Weight:'
],{process:'292168',party:'Sample Cement Limited',so:'26271016'});
let conflicting=false;
try{parsePickSlipRows([
 'SALES ORDER PICK SLIP REPORT',
 'Sales Order 26271016 Job Number:',
 'Party Name Sample Cement Limited Move Order:',
 'Process 292168 Total Weight:',
 'Process 292999 Total Weight:'
])}catch(e){conflicting=e instanceof PickSlipParseError&&/conflicting/i.test(e.message)}
assert.ok(conflicting,'Conflicting Process No. must be rejected');
const partial=parsePickSlipRows(['SALES ORDER PICK SLIP REPORT','Sales Order 26270965 Job Number:','Process 292487 Total Weight:'],{allowPartial:true});
assert.equal(partial.so,'26270965');
assert.equal(partial.process,'292487');
assert.equal(partial.party,'');
assert.ok(!Object.values(partial).includes('5497961'),'Pick Slip No must never become SO No');
console.log('PASS: 8 Pick Slip header extraction tests');
