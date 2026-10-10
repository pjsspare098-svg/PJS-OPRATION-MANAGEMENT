import assert from 'node:assert/strict';
import {validateAlbumProcess,validateAlbumPhoto} from '../src/donePickAlbumRules.ts';
assert.equal(validateAlbumProcess(' 295845 '),'295845');
assert.equal(validateAlbumProcess('292168'),'292168');
for(const value of ['','123','12345678901','0','000000','ABC123','292-168'])assert.throws(()=>validateAlbumProcess(value),/Process No/);
for(const type of ['image/jpeg','image/png','image/webp'])validateAlbumPhoto({type,size:5*1024*1024});
for(const input of [{type:'image/gif',size:1000},{type:'application/pdf',size:1000},{type:'image/png',size:0},{type:'image/jpeg',size:5242881}])assert.throws(()=>validateAlbumPhoto(input),/photo|photo|Each photo|Upload JPG/);
console.log('PASS: Process No. and multi-photo upload validation');
