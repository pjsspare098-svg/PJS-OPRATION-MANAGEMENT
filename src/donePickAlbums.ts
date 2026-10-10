import {supabase} from './independentClient';
import {validateAlbumProcess,validateAlbumPhoto} from './donePickAlbumRules';
export {validateAlbumProcess} from './donePickAlbumRules';

export type AlbumPhoto={id:string;album_id:string;name:string;path:string;content_type:string;size_bytes:number;created_at:string;ocr_process_no?:string|null;ocr_confidence?:number|null;verification_method?:'ocr_match'|'manual_review'|'legacy'};
export type PickAlbum={id:string;process_no:string;user_id:string;created_at:string;deleted_at?:string|null;photos:AlbumPhoto[]};
export type VerifiedAlbumUpload={file:File;verification:'ocr_match'|'manual_review';ocrProcessNo:string|null;confidence:number|null};
const bucket='oms-done-pick-photos';
async function authenticated(){
 if(!supabase)throw Error('Sign in to private cloud to manage Done Pick List photos.');
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user)throw Error('Your session expired. Sign in again.');
 return data.user;
}
export function validatePhoto(file:File){validateAlbumPhoto(file)}
export const donePickAlbums={
 async list(trashed=false):Promise<PickAlbum[]>{
  const user=await authenticated();
  let query=supabase!.from('oms_done_pick_albums').select('id,process_no,user_id,created_at,deleted_at').eq('user_id',user.id);
  query=trashed?query.not('deleted_at','is',null):query.is('deleted_at',null);
  const {data:albums,error}=await query.order('created_at',{ascending:false});
  if(error)throw error;
  if(!albums?.length)return [];
  const ids=albums.map(a=>a.id);
  const {data:photos,error:photoError}=await supabase!.from('oms_done_pick_photos')
   .select('id,album_id,name,path,content_type,size_bytes,created_at,ocr_process_no,ocr_confidence,verification_method').in('album_id',ids)
   .order('created_at',{ascending:false});
  if(photoError)throw photoError;
  return albums.map(a=>({...a,photos:(photos||[]).filter(p=>p.album_id===a.id)}));
 },
 async add(processNo:string):Promise<PickAlbum>{
  const user=await authenticated();
  const process=validateAlbumProcess(processNo);
  const {data,error}=await supabase!.from('oms_done_pick_albums').insert({process_no:process,user_id:user.id})
   .select('id,process_no,user_id,created_at,deleted_at').single();
  if(error){
   if(error.code==='23505')throw Error('Process '+process+' already has an entry (possibly in Trash). Open the existing entry or Restore it instead.');
   throw error;
  }
  return {...data,photos:[]};
 },
 async setTrash(album:PickAlbum,restore=false):Promise<void>{
  const user=await authenticated();
  if(album.user_id!==user.id)throw Error('You cannot delete or restore another user’s process.');
  const {error}=await supabase!.rpc('oms_set_done_pick_trash',{p_album:album.id,p_process:album.process_no,p_restore:restore});
  if(error)throw error;
 },
 async upload(album:PickAlbum,files:VerifiedAlbumUpload[]):Promise<{successes:number;failures:string[]}>{
  const user=await authenticated();
  if(album.user_id!==user.id)throw Error('You cannot upload to another user’s album.');
  if(!files.length)throw Error('Select one or more photos.');
  if(files.length>25)throw Error('Upload no more than 25 photos at a time.');
  if(album.deleted_at)throw Error('Restore this Process No. before uploading photos.');
  for(const item of files){
   validatePhoto(item.file);
   if(item.verification==='ocr_match'&&item.ocrProcessNo!==album.process_no)throw Error('Detected Process No. does not match '+album.process_no+'.');
   if(item.verification==='manual_review'&&item.ocrProcessNo!==null)throw Error('A conflicting Process No. cannot be manually overridden.');
  }
  let successes=0;const failures:string[]=[];
  for(const item of files){
   const file=item.file;
   const safe=file.name.slice(0,90).replace(/[^A-Za-z0-9_.-]/g,'_');
   const path=user.id+'/'+album.id+'/'+crypto.randomUUID()+'-'+safe;
   try{
    const {error:storeError}=await supabase!.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
    if(storeError)throw storeError;
    const {error:rowError}=await supabase!.from('oms_done_pick_photos').insert({
     album_id:album.id,user_id:user.id,name:file.name.slice(0,150),path,
     content_type:file.type,size_bytes:file.size,ocr_process_no:item.ocrProcessNo,
     ocr_confidence:Number.isFinite(item.confidence)?item.confidence:null,verification_method:item.verification
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
