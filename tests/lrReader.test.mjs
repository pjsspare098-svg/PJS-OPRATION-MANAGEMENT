import assert from 'node:assert/strict';
import {extractLRs,normalizeLR,matchLRs} from '../src/lrReader.ts';
assert.deepEqual(extractLRs('TCI FREIGHT LR NO 12345678 Docket No: AB-1234567'),['12345678','AB-1234567']);
assert.deepEqual(extractLRs('LR No.: LR-12345\nLR No LR-12345'),['LR-12345']);
assert.deepEqual(extractLRs('Invoice Number: 26270965\nSales Order 9999999'),[]);
assert.equal(normalizeLR('lr-123/45'),'LR12345');
const records=[
 {id:'a',lr:'LR-12345',process:'292184'},
 {id:'b',lr:'AB-888888',process:'292487'},
 {id:'c',lr:'AB888888',process:'292999'}
];
const result=matchLRs(['lr12345','AB-888888','MISSING-9001','LR-12345'],records);
assert.equal(result.length,3);
assert.equal(result[0].status,'matched');
assert.equal(result[1].status,'ambiguous');
assert.equal(result[2].status,'unmatched');
console.log('PASS: 8 LR extraction and matching tests');
