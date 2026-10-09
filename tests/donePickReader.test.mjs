import assert from 'node:assert/strict';
import {parseDonePickProcess} from '../src/donePickReader.ts';

const tests=[
  ['labeled process', 'DONE PICK LIST\nPROCESS NO: 123456\nSO NO: 89012345', '123456','detected'],
  ['split heading', 'PROCESS\nNUMBER\n654321\nPICK SLIP NO. 8888888','654321','detected'],
  ['common OCR digit confusion', 'Process No : 123I56\nSO No: 98765432','123156','detected'],
  ['ignore SO and pick numbers', 'SALES ORDER NO 98765432\nPICK SLIP NO 5544667','','missing'],
  ['ignore unlabelled number', 'DONE PICK LIST\n123456\nDATE 10-SEP','','missing'],
  ['reject inconsistent process labels', 'PROCESS NO 123456\nPROCESS NUMBER 654321','','ambiguous'],
  ['repeated same process accepted', 'Process Number: 123456\nProcess No. 123456','123456','detected'],
];
for(const [name,input,expected,status] of tests){
  const got=parseDonePickProcess(input);
  assert.equal(got.process,expected,name+' process');
  assert.equal(got.status,status,name+' status');
}
console.log('PASS: '+tests.length+' Done Pick List parser tests');
