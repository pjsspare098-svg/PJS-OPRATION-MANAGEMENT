import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Camera,CheckCircle2,Download,ExternalLink,FileImage,FilePlus2,Images,Plus,RefreshCw,Search,ShieldCheck,Upload,ScanText,Trash2,RotateCcw,X,LoaderCircle} from 'lucide-react';
import {Button,Empty,Heading,Panel} from './UnifiedKit';
import {donePickAlbums,validateAlbumProcess,validatePhoto,type PickAlbum,type AlbumPhoto,type VerifiedAlbumUpload} from './donePickAlbums';
import {comparePhotoProcess,photoCanUpload,type MatchStatus} from './donePickAlbumRules';
import {cloud} from './cloud';
import {type DonePickRead} from './donePickReader';
import './done-pick-albums.css';

type PendingPhoto={id:string;file:File;preview:string;read:DonePickRead|null;status:MatchStatus;manuallyApproved:boolean;error?:string};
type Review={album:PickAlbum;items:PendingPhoto[]};
const verified=(p:PendingPhoto)=>photoCanUpload(p.status,p.manuallyApproved);
export default function DonePickListPage({records,authenticated,onLegacyOCR}:{records:any[];authenticated:boolean;onLegacyOCR:()=>void}){
 const [albums,setAlbums]=useState<PickAlbum[]>([]);
 const [trash,setTrash]=useState<PickAlbum[]>([]);
 const [showTrash,setShowTrash]=useState(false);
 const [processNo,setProcessNo]=useState('');
 const [search,setSearch]=useState('');
 const [adding,setAdding]=useState(false);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState('');
 const [scanning,setScanning]=useState('');
 const [scanProgress,setScanProgress]=useState('');
 const [createScanBusy,setCreateScanBusy]=useState(false);
 const [createScanInfo,setCreateScanInfo]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selected,setSelected]=useState('');
 const [previewUrls,setPreviewUrls]=useState<Record<string,string>>({});
 const [review,setReview]=useState<Review|null>(null);
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
  if(review)for(const item of review.items){URL.revokeObjectURL(item.preview);previews.current=previews.current.filter(v=>v!==item.preview)}
  setReview(null);
 }
 async function addAlbum(){
  setError('');setNotice('');
  try{
   const no=validateAlbumProcess(processNo);
   setBusy(true);
   const album=await donePickAlbums.add(no);
   setProcessNo('');setAdding(false);setSelected(album.id);
   await reload();
   setNotice('Created Process '+no+'. Click Add photos to scan and upload multiple images.');
  }catch(e:any){setError(e.message||'Could not add Process No.')}
  finally{setBusy(false)}
 }
 async function scanNewProcess(file:File|null){
  if(!file)return;
  setError('');setCreateScanInfo('');setCreateScanBusy(true);
  try{
   validatePhoto(file);
   const result=await cloud.readDonePick(file);
   if(result.status==='detected'){
    setProcessNo(result.process);
    setCreateScanInfo('OCR found Process '+result.process+'. Confirm the printed number before creating its entry.');
   }else{
    setCreateScanInfo(result.status==='ambiguous'?'OCR found multiple Process Nos.; inspect the photo and enter the correct one.':'OCR could not read a labelled Process No.; type it manually.');
   }
  }catch(e:any){setCreateScanInfo('OCR unavailable: '+(e?.message||'Please enter Process No. manually.'))}
  finally{setCreateScanBusy(false)}
 }
 async function scanPhotos(album:PickAlbum,list:FileList|null){
  if(!list?.length)return;
  setError('');setNotice('');
  const files=Array.from(list);
  try{
   if(files.length>25)throw Error('Choose up to 25 photos at a time.');
   for(const file of files)validatePhoto(file);
  }catch(e:any){setError(e?.message||'Invalid photos');return}
  if(review)closeReview();
  setScanning(album.id);
  const pending:PendingPhoto[]=[];
  for(let i=0;i<files.length;i++){
   const file=files[i];
   setScanProgress('OCR reading photo '+(i+1)+' of '+files.length+': '+file.name);
   let read:DonePickRead|null=null;let scanError='';
   try{read=await cloud.readDonePick(file)}
   catch(e:any){scanError=e?.message||'OCR could not read this photo.'}
   const preview=URL.createObjectURL(file);previews.current.push(preview);
   pending.push({id:crypto.randomUUID(),file,preview,read,status:comparePhotoProcess(read,album.process_no),manuallyApproved:false,error:scanError});
  }
  setReview({album,items:pending});
  setScanning('');setScanProgress('');
 }
 function markManual(id:string,approved:boolean){
  setReview(old=>old?{...old,items:old.items.map(x=>x.id===id?{...x,manuallyApproved:approved}:x)}:old);
 }
 async function uploadReviewed(){
  if(!review||busy||uploading)return;
  const {album,items}=review;
  const eligible=items.filter(verified);
  if(!eligible.length){setError('No verified photos yet. Review unreadable photos manually; wrong Process Nos. cannot be uploaded.');return}
  setUploading(album.id);setError('');setNotice('');
  try{
   const requests:VerifiedAlbumUpload[]=eligible.map(item=>({
    file:item.file,
    verification:item.status==='matched'?'ocr_match':'manual_review',
    ocrProcessNo:item.status==='matched'?item.read!.process:null,
    confidence:typeof item.read?.confidence==='number'?item.read.confidence:null
   }));
   const result=await donePickAlbums.upload(album,requests);
   const excluded=items.length-eligible.length;
   await reload();
   setSelected(album.id);
   if(result.failures.length){
    setError(result.successes+' saved; '+result.failures.length+' failed: '+result.failures.slice(0,3).join('; ')+'. Retry only failed images.');
    // Keep the review available, but remove photos already successfully saved is not
    // deterministically knowable here, so do not repeat the batch automatically.
    closeReview();
   }else{
    closeReview();
    setNotice(result.successes+' photo(s) saved to Process '+album.process_no+(excluded?' · '+excluded+' not uploaded (mismatch/unreviewed).':'')+'.');
   }
  }catch(e:any){setError(e?.message||'Photo upload failed. No mismatched photos were approved.')}
  finally{setUploading('')}
 }
 async function archive(){
  if(!deleteTarget||deleteConfirm!==deleteTarget.process_no)return;
  setBusy(true);setError('');setNotice('');
  try{
   const no=deleteTarget.process_no;
   await donePickAlbums.setTrash(deleteTarget);
   if(selected===deleteTarget.id)setSelected('');
   setDeleteTarget(null);setDeleteConfirm('');
   await reload();
   setNotice('Process '+no+' moved to Trash. Its '+deleteTarget.photos.length+' photo(s) are preserved and can be restored.');
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
 async function loadPreview(album:PickAlbum){
  setSelected(album.id===selected?'':album.id);
  if(selected===album.id)return;
  const fetched=await Promise.allSettled(album.photos.slice(0,24).map(async photo=>({id:photo.id,url:await donePickAlbums.url(photo)})));
  const links=Object.fromEntries(fetched.filter((x):x is PromiseFulfilledResult<{id:string;url:string}>=>x.status==='fulfilled').map(x=>[x.value.id,x.value.url]));
  setPreviewUrls(previous=>({...previous,...links}));
 }
 const filtered=useMemo(()=>albums.filter(album=>album.process_no.includes(search.trim())),[albums,search]);
 const eligible=review?.items.filter(verified).length||0;
 return <>
  <Heading eyebrow='DONE PICK LIST · PHOTO RECORDS' title='Done Pick List' description='Type a Process No. or read it from a photo. Every uploaded photo is checked against the selected Process No. before saving.' actions={<><Button onClick={onLegacyOCR}><Camera size={16}/> Legacy master-process OCR</Button><Button onClick={()=>void reload()}><RefreshCw size={16}/> Refresh</Button><Button variant='primary' onClick={()=>setAdding(!adding)}><Plus size={16}/> Add Process No.</Button></>}/>
  <div className='dpa-status'><ShieldCheck size={17}/>{authenticated?'Every photo is OCR checked; a detected wrong Process No. is blocked. If OCR cannot read it, manual verification is required.':'Sign in to cloud to create private entries and store photos. Local preview cannot retain photos.'}</div>
  {error&&<div className='dpa-message error' role='alert'><AlertCircle size={16}/>{error}</div>}
  {notice&&<div className='dpa-message success' role='status'><CheckCircle2 size={16}/>{notice}</div>}
  {adding&&<Panel title='Add a Done Pick List Process No.' subtitle='Only Process No. is required. OCR can suggest the number from a photo, but you must verify it.'>
   <div className='dpa-add-form'>
    <label className='ux-field'>Process No.<input value={processNo} inputMode='numeric' maxLength={9} placeholder='e.g. 295845' onChange={e=>setProcessNo(e.target.value.replace(/[^0-9]/g,''))} onKeyDown={e=>{if(e.key==='Enter')void addAlbum()}}/></label>
    <label className='dpa-scan-create'><ScanText size={16}/>{createScanBusy?'Scanning…':'Read number from photo'}<input type='file' disabled={!authenticated||createScanBusy||busy} accept='image/jpeg,image/png,image/webp' onChange={e=>{const f=e.target.files?.[0]||null;void scanNewProcess(f);e.target.value=''}}/></label>
    <Button variant='primary' disabled={!authenticated||busy||createScanBusy||processNo.length<5} onClick={()=>void addAlbum()}><FilePlus2 size={16}/> {busy?'Creating…':'Create entry'}</Button>
   </div>{createScanInfo&&<p className='dpa-create-info' role='status'>{createScanInfo}</p>}
  </Panel>}
  <Panel title={'Saved Done Pick List entries ('+albums.length+')'} subtitle='One entry per Process No. · multiple photos · OCR match before upload · Open or Download later.' actions={<div className='dpa-search'><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search Process No.'/></div>}>
   {!filtered.length?<Empty icon={Images} title={search?'No matching Process No.':'No Done Pick List entries yet'} help='Click Add Process No. to create an entry, then upload photos for OCR review.'/>:
    <div className='dpa-albums'>{filtered.map(album=><article key={album.id} className='dpa-album'>
     <div className='dpa-album-bar'>
      <div className='dpa-album-name'><span className='dpa-number'>{album.process_no}</span><small>{album.photos.length} photo{album.photos.length===1?'':'s'} saved · {new Date(album.created_at).toLocaleDateString('en-IN')}</small></div>
      <div className='dpa-actions'>
       <label className={'ux-button primary dpa-upload '+(scanning||uploading||busy?'disabled':'')}><Upload size={15}/>{scanning===album.id?'OCR reading…':uploading===album.id?'Saving…':'Add photos'}
        <input type='file' accept='image/jpeg,image/png,image/webp' multiple disabled={!authenticated||Boolean(scanning)||Boolean(uploading)||busy} onChange={e=>{const files=e.target.files;void scanPhotos(album,files);e.target.value=''}}/>
       </label>
       <label className={'ux-button secondary dpa-upload '+(scanning||uploading||busy?'disabled':'')}><Camera size={15}/> Take photo
        <input type='file' accept='image/*' capture='environment' disabled={!authenticated||Boolean(scanning)||Boolean(uploading)||busy} onChange={e=>{const files=e.target.files;void scanPhotos(album,files);e.target.value=''}}/>
       </label>
       <Button onClick={()=>void loadPreview(album)}>{selected===album.id?'Hide photos':'View photos'} ({album.photos.length})</Button>
       <button type='button' className='dpa-delete-btn' disabled={busy||Boolean(uploading)||Boolean(scanning)} onClick={()=>{setDeleteTarget(album);setDeleteConfirm('')}}><Trash2 size={14}/> Delete Process</button>
      </div>
     </div>
     {selected===album.id&&<div className='dpa-photo-grid'>
      {album.photos.length?album.photos.map(photo=><div className='dpa-photo' key={photo.id}>
       {previewUrls[photo.id]?<img src={previewUrls[photo.id]} alt={'Done Pick List '+photo.name} loading='lazy'/>:<div className='dpa-photo-placeholder'><FileImage size={32}/></div>}
       <div className='dpa-photo-info'><strong title={photo.name}>{photo.name}</strong><small>{(photo.size_bytes/1024/1024).toFixed(2)} MB · {new Date(photo.created_at).toLocaleDateString('en-IN')}</small><small>{photo.verification_method==='ocr_match'?'OCR matched Process '+photo.ocr_process_no:photo.verification_method==='manual_review'?'Manually reviewed': 'Previously uploaded'}</small></div>
       <div className='dpa-photo-actions'><Button onClick={()=>void view(photo)}><ExternalLink size={14}/> Open</Button><Button onClick={()=>void download(photo)}><Download size={14}/> Download</Button></div>
      </div>):<div className='dpa-empty-album'><Camera size={22}/> No photos yet. Add photos above; OCR will check each one.</div>}
     </div>}
    </article>)}</div>}
  </Panel>
  <section className='dpa-trash-section'>
   <button type='button' onClick={()=>setShowTrash(x=>!x)}><Trash2 size={16}/> {showTrash?'Hide Trash':'Deleted processes (Trash)'} <span>Recover deleted entries</span></button>
   {showTrash&&<div className='dpa-trash-content'>{trash.length?trash.map(album=><div key={album.id}><div><strong>Process {album.process_no}</strong><small>{album.photos.length} photo(s) preserved</small></div><Button disabled={busy} onClick={()=>void restore(album)}><RotateCcw size={15}/> Restore</Button></div>):<p>No deleted Done Pick List entries.</p>}</div>}
  </section>
  {historical.length>0&&<Panel title={'Previously uploaded Done Pick Lists ('+historical.length+')'} subtitle='Attachments directly linked to master processes are kept separately. None were deleted or moved.'>
    <div className='dpa-history'>{historical.map(({record,doc})=><div key={doc.id}><strong>Process {record.process}</strong><span>{doc.name}</span><Button onClick={()=>void cloud.open(record.id,doc.id).catch(e=>setError(e.message||'Could not open photo'))}><ExternalLink size={14}/> Open</Button><Button onClick={()=>void cloud.download(record.id,doc.id).catch(e=>setError(e.message||'Could not download photo'))}><Download size={14}/> Download</Button></div>)}</div>
  </Panel>}
  {scanning&&<div className='dpa-screen'><div><LoaderCircle size={27} className='dpa-spinning'/><h3>Reading photo Process Nos.</h3><p>{scanProgress}</p><small>Checking each image locally with OCR. No photos have been uploaded yet.</small></div></div>}
  {review&&<div className='dpa-screen' role='presentation'>
   <section className='dpa-review-dialog' role='dialog' aria-modal='true' aria-label='Confirm photo Process No. matching'>
    <header><div><span className='ux-kicker dark'>OCR PHOTO VERIFICATION</span><h2>Upload photos to Process {review.album.process_no}</h2><p>Confirm each photo belongs to this Process No. Mismatched photos cannot be uploaded to this entry.</p></div><button type='button' aria-label='Close review' disabled={Boolean(uploading)} onClick={closeReview}><X size={20}/></button></header>
    <div className='dpa-review-list'>{review.items.map(item=><article key={item.id} className={'dpa-review-item '+item.status}>
     <img src={item.preview} alt={item.file.name}/>
     <div className='dpa-review-description'>
      <strong>{item.file.name}</strong>
      {item.status==='matched'?<p className='dpa-good'><CheckCircle2 size={15}/> OCR matched Process {item.read?.process} {typeof item.read?.confidence==='number'?'· '+Math.round(item.read.confidence)+'% text confidence':''}</p>:item.status==='mismatch'?<p className='dpa-bad'><AlertCircle size={15}/> Blocked: OCR read Process {item.read?.process}, expected {review.album.process_no}. Use the correct album or another photo.</p>:<><p className='dpa-warning'><AlertCircle size={15}/>{item.status==='ambiguous'?'OCR found multiple possible numbers: '+(item.read?.candidates.join(', ')||'unknown'):'OCR could not read a labelled Process No.'} {item.error||''}</p>
       <label className='dpa-confirm-check'><input type='checkbox' checked={item.manuallyApproved} onChange={e=>markManual(item.id,e.target.checked)}/> I checked this image myself and confirm it belongs to Process {review.album.process_no}.</label></>}
     </div>
    </article>)}</div>
    <footer><span>{eligible} of {review.items.length} approved · mismatches excluded</span><button type='button' className='ux-secondary' disabled={Boolean(uploading)} onClick={closeReview}>Cancel</button><button type='button' className='ux-primary' disabled={!eligible||Boolean(uploading)} onClick={()=>void uploadReviewed()}><Upload size={16}/>{uploading?'Saving…':'Upload '+eligible+' approved photos'}</button></footer>
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
