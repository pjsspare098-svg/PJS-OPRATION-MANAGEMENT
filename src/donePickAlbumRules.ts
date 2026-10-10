export function validateAlbumProcess(raw:string){
 const value=raw.trim();
 if(!/^[0-9]{5,9}$/.test(value)||/^0+$/.test(value))throw Error('Enter a valid 5–9 digit Process No.');
 return value;
}
export function validateAlbumPhoto(file:{type:string;size:number}){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Upload JPG, PNG or WebP photos only.');
 if(file.size<1||file.size>5242880)throw Error('Each photo must be between 1 byte and 5 MB.');
}
