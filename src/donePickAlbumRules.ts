export function validateAlbumProcess(raw:string){
 const value=raw.trim();
 if(!/^[0-9]{5,9}$/.test(value)||/^0+$/.test(value))throw Error('Enter a valid 5–9 digit Process No.');
 return value;
}
export function validateAlbumPhoto(file:{type:string;size:number}){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Upload JPG, PNG or WebP photos only.');
 if(file.size<1||file.size>5242880)throw Error('Each photo must be between 1 byte and 5 MB.');
}

export type OCRRead={process:string;status:'detected'|'missing'|'ambiguous';candidates:string[];confidence?:number};
export type MatchStatus='matched'|'mismatch'|'ambiguous'|'unreadable';
export function comparePhotoProcess(read:OCRRead|null,expected:string):MatchStatus{
 const process=validateAlbumProcess(expected);
 if(!read||read.status==='missing')return 'unreadable';
 if(read.status==='ambiguous')return 'ambiguous';
 return read.process===process?'matched':'mismatch';
}
export function photoCanUpload(status:MatchStatus,manualConfirmed:boolean):boolean{
 return status==='matched'||((status==='ambiguous'||status==='unreadable')&&manualConfirmed);
}
