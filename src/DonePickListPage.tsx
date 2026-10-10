import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Camera,CheckCircle2,Download,ExternalLink,FileImage,FilePlus2,Images,Plus,RefreshCw,Search,ShieldCheck,Upload,Trash2,RotateCcw,X} from 'lucide-react';
import {Button,Empty,Heading,Panel} from './UnifiedKit';
import {donePickAlbums,validateAlbumProcess,validatePhoto,type PickAlbum,type AlbumPhoto,type VerifiedAlbumUpload} from './donePickAlbums';
import {cloud} from './cloud';
import BatchCamera from './BatchCamera';
import './done-pick-albums.css';

type PendingPhoto={id:string;file:File;preview:string};
type Review={processNo:string;items:PendingPhoto[]};
type CameraSession={album:PickAlbum|null};
export default function DonePickListPage({records,authenticated}:{records:any[];authenticated:boolean}){
 const [albums,setAlbums]=useState<PickAlbum[]>([]);
 const [trash,setTrash]=useState<PickAlbum[]>([]);
 const [showTrash,setShowTrash]=useState(false);
 const [processNo,setProcessNo]=useState('');
 const [search,setSearch]=useState('');
 const [adding,setAdding]=useState(false);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selected,setSelected]=useState('');
 const [previewUrls,setPreviewUrls]=useState<Record<string,string>>({});
 const [review,setReview]=useState<Review|null>(null);
 const [cameraSession,setCameraSession]=useState<CameraSession|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<PickAlbum|null>(null);
 const [deleteConfirm,setDeleteConfirm]=useState('');
 const previews=useRef<string[]>([]);
 const historical=records.flatMap(r=>(r.documents||[]).filter((d:any)=>d.kind==='donePickDoc').map((doc:any)=>({record:r,doc})));
 useEffect(()=>()=>{for(const url of previews.current)URL.revokeObjectURL(url)},[]);
 async function reload(){
  if(!authenticated){setAlbums([]);setTrash([]);return}
  const [all,deleted]=await Promise.all([donePickAlbums.list(),showTrash?donePickAlbums.list(true):Promise.resolve([])]);
  setAlbums(all);
  if(showTrash)setTrash(deleted);
 }
 useEffect(()=>{void reload().catch(e=>setError(e.message))},[authenticated,showTrash]);

 function closeReview(){
  if(review)for(const item of review.items){
   URL.revokeObjectURL(item.preview);
   previews.current=previews.current.filter(v=>v!==item.preview);
  }
  setReview(null);setConfirmed(false);
 }
 async function addAlbum(){
  setError('');setNotice('');
  try{
   const no=validateAlbumProcess(processNo);
   setBusy(true);
   const album=await donePickAlbums.add(no);
   setProcessNo('');setAdding(false);setSelected(album.id);
   await reload();
   setNotice('Created Process '+no+'. Select Add photos or Take photo to save images directly.');
  }catch(e:any){setError(e.message||'Could not add Process No.')}
  finally{setBusy(false)}
 }
 function prepareBatch(files:File[],album:PickAlbum|null){
  if(!files.length)return;
  setError('');setNotice('');
  try{
   if(files.length>25)throw Error('Choose no more than 25 photos in one batch.');
   files.forEach(validatePhoto);
   if(review)closeReview();
   const items=files.map(file=>{
    const preview=URL.createObjectURL(file);
    previews.current.push(preview);
    return {id:crypto.randomUUID(),file,preview};
   });
   setConfirmed(false);
   setReview({processNo:album?.process_no||'',items});
  }catch(e:any){setError(e?.message||'Could not select photos.')}
 }
 function choosePhotos(album:PickAlbum,list:FileList|null){
  if(list?.length)prepareBatch(Array.from(list),album);
 }
 async function uploadReviewed(){
  if(!review||!confirmed||busy||uploading)return;
  const {items}=review;
  let process:string;
  try{process=validateAlbumProcess(review.processNo)}
  catch(e:any){setError('Enter the correct Process No. for these photos.');return}
  setUploading(process);setError('');setNotice('');
  try{
   // Create a standalone album only at the final confirmed upload step.
   // Existing Process Nos. are reused and their original photos are preserved.
   let album=albums.find(a=>a.process_no===process);
   if(!album)album=await donePickAlbums.add(process);
   const files:VerifiedAlbumUpload[]=items.map(({file})=>({
    file,verification:'manual_review',ocrProcessNo:null,confidence:null
   }));
   const result=await donePickAlbums.upload(album,files);
   // Uploads are already committed. Never ask the user to retry an entire
   // successful batch just because refreshing the gallery happens to fail.
   closeReview();
   setSelected(album.id);
   try{
    const fresh=await donePickAlbums.list();
    setAlbums(fresh);
    const latest=fresh.find(a=>a.id===album.id);
    if(latest)await fetchPreviews(latest);
   }catch(e:any){
    setError('Photos were saved, but the gallery could not refresh. Tap Refresh; do not upload the same batch again. '+String(e?.message||''));
   }
   if(result.failures.length){
    setError(result.successes+' photo(s) saved to Process '+process+'. '+result.failures.length+' failed: '+result.failures.slice(0,3).join('; ')+'. Only select failed photos again to retry.');
   }else{
    setNotice(result.successes+' photo(s) saved to Process '+process+'.');
   }
  }catch(e:any){
   setError(e?.message||'Photo upload failed. You can retry without taking new photos.');
  }finally{setUploading('')}
 }
 async function archive(){
  if(!deleteTarget||deleteConfirm!==deleteTarget.process_no)return;
  setBusy(true);setError('');setNotice('');
  try{
   const no=deleteTarget.process_no;
   const count=deleteTarget.photos.length;
   await donePickAlbums.setTrash(deleteTarget);
   if(selected===deleteTarget.id)setSelected('');
   setDeleteTarget(null);setDeleteConfirm('');
   await reload();
   setNotice('Process '+no+' moved to Trash. Its '+count+' photo(s) are preserved and can be restored.');
  }catch(e:any){setError(e?.message||'Could not delete process')}
  finally{setBusy(false)}
 }
 async function restore(album:PickAlbum){
  setBusy(true);setError('');
  try{await donePickAlbums.setTrash(album,true);await reload();setNotice('Process '+album.process_no+' restored with its photos.')}
  catch(e:any){setError(e?.message||'Restore failed')}
  finally{setBusy(false)}
 }
 async function view(photo:AlbumPhoto){
  try{await donePickAlbums.open(photo)}catch(e:any){setError(e.message||'Could not open photo')}
 }
 async function download(photo:AlbumPhoto){
  try{await donePickAlbums.download(photo)}catch(e:any){setError(e.message||'Could not download photo')}
 }
 async function fetchPreviews(album:PickAlbum){
  const fetched=await Promise.allSettled(album.photos.slice(0,24).map(async photo=>({id:photo.id,url:await donePickAlbums.url(photo)})));
  const links=Object.fromEntries(fetched.filter((x):x is PromiseFulfilledResult<{id:string;url:string}>=>x.status==='fulfilled').map(x=>[x.value.id,x.value.url]));
  setPreviewUrls(previous=>({...previous,...links}));
 }
 async function loadPreview(album:PickAlbum){
  setSelected(album.id===selected?'':album.id);
  if(selected===album.id)return;
  await fetchPreviews(album);
 }
 const filtered=useMemo(()=>albums.filter(album=>album.process_no.includes(search.trim())),[albums,search]);
 return <>
  <Heading eyebrow='DONE PICK LIST · PHOTO RECORDS' title='Done Pick List' description='Open the camera once, take as many photos as needed, then tap Done and choose the Process No. for the whole batch.' actions={<><Button variant='primary' disabled={!authenticated||Boolean(uploading)} onClick={()=>setCameraSession({album:null})}><Camera size={16}/> Open camera</Button><Button onClick={()=>void reload()}><RefreshCw size={16}/> Refresh</Button><Button variant='primary' onClick={()=>setAdding(!adding)}><Plus size={16}/> Add Process No.</Button></>}/>
  <div className='dpa-status'><ShieldCheck size={17}/>{authenticated?'Keep taking photos without leaving the camera. Thumbnails appear as you shoot; when done, enter the destination Process No. and upload privately.':'Sign in to cloud to create private entries and store photos. Local preview cannot retain photos.'}</div>
  {error&&<div className='dpa-message error' role='alert'><AlertCircle size={16}/>{error}</div>}
  {notice&&<div className='dpa-message success' role='status'><CheckCircle2 size={16}/>{notice}</div>}
  {adding&&<Panel title='Add a Done Pick List Process No.' subtitle='Type the Process No. printed on the document. No invoice, Party Name, or other details are required.'>
   <div className='dpa-add-form'>
    <label className='ux-field'>Process No.<input value={processNo} inputMode='numeric' maxLength={9} placeholder='e.g. 295845' onChange={e=>setProcessNo(e.target.value.replace(/[^0-9]/g,''))} onKeyDown={e=>{if(e.key==='Enter')void addAlbum()}}/></label>
    <Button variant='primary' disabled={!authenticated||busy||processNo.length<5} onClick={()=>void addAlbum()}><FilePlus2 size={16}/> {busy?'Creating…':'Create entry'}</Button>
   </div>
  </Panel>}
  <Panel title={'Saved Done Pick List entries ('+albums.length+')'} subtitle='Take a full batch in one camera session. Photos can also be chosen from your gallery, with no OCR delay.' actions={<div className='dpa-search'><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search Process No.'/></div>}>
   {!filtered.length?<Empty icon={Images} title={search?'No matching Process No.':'No Done Pick List entries yet'} help='Click Add Process No. to create an entry, then upload photos.'/>:
    <div className='dpa-albums'>{filtered.map(album=><article key={album.id} className='dpa-album'>
     <div className='dpa-album-bar'>
      <div className='dpa-album-name'><span className='dpa-number'>{album.process_no}</span><small>{album.photos.length} photo{album.photos.length===1?'':'s'} saved · {new Date(album.created_at).toLocaleDateString('en-IN')}</small></div>
      <div className='dpa-actions'>
       <label className={'ux-button primary dpa-upload '+(uploading||busy?'disabled':'')}><Upload size={15}/>{uploading===album.id?'Saving…':'Add photos'}
        <input type='file' accept='image/jpeg,image/png,image/webp' multiple disabled={!authenticated||Boolean(uploading)||busy} onChange={e=>{choosePhotos(album,e.target.files);e.target.value=''}}/>
       </label>
       <Button disabled={!authenticated||Boolean(uploading)||busy} onClick={()=>setCameraSession({album})}><Camera size={15}/> Take multiple photos</Button>
       <Button onClick={()=>void loadPreview(album)}>{selected===album.id?'Hide photos':'View photos'} ({album.photos.length})</Button>
       <button type='button' className='dpa-delete-btn' disabled={busy||Boolean(uploading)} onClick={()=>{setDeleteTarget(album);setDeleteConfirm('')}}><Trash2 size={14}/> Delete Process</button>
      </div>
     </div>
     {selected===album.id&&<div className='dpa-photo-grid'>
      {album.photos.length?album.photos.map(photo=><div className='dpa-photo' key={photo.id}>
       {previewUrls[photo.id]?<img src={previewUrls[photo.id]} alt={'Done Pick List '+photo.name} loading='lazy'/>:<div className='dpa-photo-placeholder'><FileImage size={32}/></div>}
       <div className='dpa-photo-info'><strong title={photo.name}>{photo.name}</strong><small>{(photo.size_bytes/1024/1024).toFixed(2)} MB · {new Date(photo.created_at).toLocaleDateString('en-IN')}</small><small>{photo.verification_method==='ocr_match'?'Previously OCR-verified':photo.verification_method==='manual_review'?'Process confirmed manually':'Previously uploaded'}</small></div>
       <div className='dpa-photo-actions'><Button onClick={()=>void view(photo)}><ExternalLink size={14}/> Open</Button><Button onClick={()=>void download(photo)}><Download size={14}/> Download</Button></div>
      </div>):<div className='dpa-empty-album'><Camera size={22}/> No photos yet. Click Add photos above to save images.</div>}
     </div>}
    </article>)}</div>}
  </Panel>
  <section className='dpa-trash-section'>
   <button type='button' onClick={()=>setShowTrash(x=>!x)}><Trash2 size={16}/> {showTrash?'Hide Trash':'Deleted processes (Trash)'} <span>Recover deleted entries</span></button>
   {showTrash&&<div className='dpa-trash-content'>{trash.length?trash.map(album=><div key={album.id}><div><strong>Process {album.process_no}</strong><small>{album.photos.length} photo(s) preserved</small></div><Button disabled={busy} onClick={()=>void restore(album)}><RotateCcw size={15}/> Restore</Button></div>):<p>No deleted Done Pick List entries.</p>}</div>}
  </section>
  {historical.length>0&&<Panel title={'Previously uploaded Done Pick Lists ('+historical.length+')'} subtitle='Photos attached directly to master processes remain accessible. No existing documents were changed.'>
    <div className='dpa-history'>{historical.map(({record,doc})=><div key={doc.id}><strong>Process {record.process}</strong><span>{doc.name}</span><Button onClick={()=>void cloud.open(record.id,doc.id).catch(e=>setError(e.message||'Could not open photo'))}><ExternalLink size={14}/> Open</Button><Button onClick={()=>void cloud.download(record.id,doc.id).catch(e=>setError(e.message||'Could not download photo'))}><Download size={14}/> Download</Button></div>)}</div>
  </Panel>}
  {cameraSession&&<BatchCamera onClose={()=>setCameraSession(null)} onDone={files=>{
   const album=cameraSession.album;
   setCameraSession(null);
   prepareBatch(files,album);
  }}/>}
  {review&&<div className='dpa-screen' role='presentation'>
   <section className='dpa-review-dialog' role='dialog' aria-modal='true' aria-label='Confirm photo destination'>
    <header><div><span className='ux-kicker dark'>READY TO UPLOAD</span><h2>{review.items.length} Done Pick List photos</h2><p>Your camera batch is ready. Enter the Process No. to attach every photo to that entry.</p></div><button type='button' aria-label='Close review' disabled={Boolean(uploading)} onClick={closeReview}><X size={20}/></button></header>
    <div className='dpa-review-list'>
     <label className='ux-field dpa-destination-label'>Which Process No. do these photos belong to?
      <input value={review.processNo} inputMode='numeric' maxLength={9} placeholder='Enter Process No., e.g. 295845'
        disabled={Boolean(uploading)} onChange={e=>{setReview(old=>old?{...old,processNo:e.target.value.replace(/[^0-9]/g,'')}:old);setConfirmed(false);setError('')}}/>
     </label>
     {review.processNo.length>=5&&<div className='dpa-review-target'>
       {albums.some(a=>a.process_no===review.processNo)?'Adding photos to your existing Process '+review.processNo:
        'A new Done Pick List entry will be created for Process '+review.processNo+' when you upload.'}
     </div>}
     <div className='dpa-review-thumbnails'>
      {review.items.map((item,i)=><div key={item.id} className='dpa-review-tile'><img src={item.preview} alt={'Photo '+(i+1)}/><span>{i+1}</span></div>)}
     </div>
     <label className='dpa-confirm-check dpa-confirm-all'>
      <input type='checkbox' disabled={Boolean(uploading)||!(/^[0-9]{5,9}$/.test(review.processNo))} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      I confirm all {review.items.length} photos belong to Process <strong>{review.processNo||'—'}</strong>.
     </label>
    </div>
    <footer><span>{review.items.length} photo(s) ready · No OCR</span><button type='button' className='ux-secondary' disabled={Boolean(uploading)} onClick={closeReview}>Cancel</button><button type='button' className='ux-primary' disabled={!confirmed||Boolean(uploading)||review.processNo.length<5} onClick={()=>void uploadReviewed()}><Upload size={16}/>{uploading?'Uploading…':'Upload '+review.items.length+' photos'}</button></footer>
   </section>
  </div>}
  {deleteTarget&&<div className='dpa-screen' role='presentation'><section className='dpa-confirm-dialog' role='alertdialog' aria-modal='true' aria-label='Delete Process confirmation'>
   <Trash2 size={26}/><h2>Delete Done Pick List Process {deleteTarget.process_no}?</h2>
   <p>This moves the entry and its {deleteTarget.photos.length} photo(s) to Trash, not permanent deletion. You can restore everything later. Your master process remains unchanged.</p>
   <label className='ux-field'>Type {deleteTarget.process_no} to confirm<input autoFocus value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value.trim())} placeholder='Exact Process No.'/></label>
   <div><button type='button' className='ux-secondary' onClick={()=>{setDeleteTarget(null);setDeleteConfirm('')}}>Cancel</button><button type='button' className='dpa-danger' disabled={busy||deleteConfirm!==deleteTarget.process_no} onClick={()=>void archive()}><Trash2 size={15}/> {busy?'Moving…':'Delete Process'}</button></div>
  </section></div>}
 </>;
}
