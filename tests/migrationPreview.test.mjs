import assert from 'node:assert/strict';
import {splitCsv,previewMigration} from '../src/migrationPreview.ts';
assert.deepEqual(splitCsv('Process No.,Party Name,SO No.\r\n123456,"Acme, Engineering Pvt Ltd",26270001'),[
 ['Process No.','Party Name','SO No.'],['123456','Acme, Engineering Pvt Ltd','26270001']
]);
assert.deepEqual(splitCsv('a,b\n"quoted ""value""",x'),[['a','b'],['quoted "value"','x']]);
const data='Process No.,Party Name,SO No.,Invoice No.,Status\n123456,"Acme, Engineering Pvt Ltd",26270001,INV-001,Delivered\n123456,Duplicated,26270001,,\n654321,Valid Vendor,26270002,,Pending\n00000,Sample,26270003,,\n';
const result=previewMigration(data);
assert.equal(result.valid.length,2);
assert.equal(result.rejected.length,2);
assert.equal(result.valid[0].party,'Acme, Engineering Pvt Ltd');
assert.equal(result.valid[0].legacyStatus,'Delivered');
assert.ok(!('status' in result.valid[0]));
const existing=previewMigration(data,['654321']);
assert.equal(existing.valid.length,1);
assert.ok(existing.rejected.some(r=>/Already exists/.test(r.reason)));
assert.throws(()=>previewMigration('Process No.,Party Name\n123456,Company'),/Missing CSV headings/);
assert.throws(()=>splitCsv('a,b\n"unterminated'),/quoted field/);
console.log('PASS: 7 historical CSV migration checks');
