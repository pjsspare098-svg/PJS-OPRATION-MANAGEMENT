import {supabase} from './independentClient';

export type AlbumPhoto={id:string;album_id:string;name:string;path:string;content_type:string;size_bytes:number;created_at:string};
export type PickAlbum={id:string;process_no:string;user_id:string;created_at:string;photos:AlbumPhoto[]};
const bucket='oms-done-pick-photos';
async function authenticated(){
 if(!supabase)throw Error('Sign in to private cloud to manage Done Pick List photos.');
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user)throw Error('Your session expired. Sign in again.');
 return data.user;
}
export function validateAlbumProcess(raw:string){
 const value=raw.trim();
 if(!/^[0-9]{5,9}$/.test(value)||/^0+$/.test(value))throw Error('Enter a valid 5–9 digit Process No.');
 return value;
}
export function validatePhoto(file:File){
 const allowed=['image/jpeg','image/png','image/webp'];
 if(!allowed.includes(file.type))throw Error('Upload JPG, PNG or WebP photos only.');
 if(file.size===0||file.size>5242880)throw Error('Each photo must be between 1 byte and 5 MB.');
}
export const donePickAlbums={
 async list():Promise<PickAlbum[]>{
  const user=await authenticated();
  const {data:albums,error}=await supabase!.from('oms_done_pick_albums').select('id,process_no,user_id,created_at')
   .eq('user_id',user.id).order('created_at',{ascending:false});
  if(error)throw error;
  if(!albums?.length)return [];
  const ids=albums.map(a=>a.id);
  const {data:photos,error:photoError}=await supabase!.from('oms_done_pick_photos')
   .select('id,album_id,name,path,content_type,size_bytes,created_at').in('album_id',ids)
   .order('created_at',{ascending:false});
  if(photoError)throw photoError;
  return albums.map(a=>({...a,photos:(photos||[]).filter(p=>p.album_id===a.id)}));
 },
 async add(processNo:string):Promise<PickAlbum>{
  const user=await authenticated();
  const process=validateAlbumProcess(processNo);
  const {data,error}=await supabase!.from('oms_done_pick_albums').insert({process_no:process,user_id:user.id})
   .select('id,process_no,user_id,created_at').single();
  if(error){
   if(error.code==='23505')throw Error('Process '+process+' already has a Done Pick List entry. Use its Add Photos button instead.');
   throw error;
  }
  return {...data,photos:[]};
 },
 async upload(album:PickAlbum,files:File[]):Promise<{successes:number;failures:string[]}>{
  const user=await authenticated();
  if(album.user_id!==user.id)throw Error('You cannot upload to another user’s album.');
  if(!files.length)throw Error('Select one or more photos.');
  if(files.length>25)throw Error('Upload no more than 25 photos at a time.');
  for(const file of files)validatePhoto(file);
  let successes=0;const failures:string[]=[];
  for(const file of files){
   const safe=file.name.slice(0,90).replace(/[^A-Za-z0-9_.-]/g,'_');
   const path=user.id+'/'+album.id+'/'+crypto.randomUUID()+'-'+safe;
   try{
    const {error:storeError}=await supabase!.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
    if(storeError)throw storeError;
    const {error:rowError}=await supabase!.from('oms_done_pick_photos').insert({
     album_id:album.id,user_id:user.id,name:file.name.slice(0,150),path,
     content_type:file.type,size_bytes:file.size
    });
    if(rowError){
     await supabase!.storage.from(bucket).remove([path]).catch(()=>{});
     throw rowError;
    }
    successes++;
   }catch(e:any){failures.push(file.name+': '+(e?.message||'Upload failed'))}
  }
  return {successes,failures};
 },
 async url(photo:AlbumPhoto){
  await authenticated();
  const {data,error}=await supabase!.storage.from(bucket).createSignedUrl(photo.path,300);
  if(error||!data?.signedUrl)throw Error('Cannot open this private photo. Try signing in again.');
  return data.signedUrl;
 },
 async open(photo:AlbumPhoto){
  const tab=window.open('about:blank','_blank');
  if(!tab)throw Error('Pop-ups are blocked. Allow pop-ups to view uploaded photos.');
  tab.opener=null;
  try{tab.location.replace(await donePickAlbums.url(photo))}
  catch(e){tab.close();throw e}
 },
 async download(photo:AlbumPhoto){
  await authenticated();
  const {data,error}=await supabase!.storage.from(bucket).download(photo.path);
  if(error||!data)throw Error('Could not download private photo.');
  const url=URL.createObjectURL(data);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=photo.name.replace(/[/\\:*?"<>|]/g,'_')||'DonePickPhoto';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),15000);
 }
};
