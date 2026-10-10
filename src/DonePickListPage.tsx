import {useEffect,useMemo,useState} from 'react';
import {Camera,CheckCircle2,Download,ExternalLink,FileImage,FilePlus2,Images,Plus,RefreshCw,Search,ShieldCheck,Upload,AlertCircle} from 'lucide-react';
import {Button,Empty,Heading,Panel} from './UnifiedKit';
import {donePickAlbums,validateAlbumProcess,type PickAlbum,type AlbumPhoto} from './donePickAlbums';
import {cloud} from './cloud';
import './done-pick-albums.css';

export default function DonePickListPage({records,authenticated,onLegacyOCR}:{records:any[];authenticated:boolean;onLegacyOCR:()=>void}){
 const [albums,setAlbums]=useState<PickAlbum[]>([]);
 const [processNo,setProcessNo]=useState('');
 const [search,setSearch]=useState('');
 const [adding,setAdding]=useState(false);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selected,setSelected]=useState('');
 const [previewUrls,setPreviewUrls]=useState<Record<string,string>>({});
 const historical=records.flatMap(r=>(r.documents||[]).filter((d:any)=>d.kind==='donePickDoc').map((doc:any)=>({record:r,doc})));
 async function reload(){
  if(!authenticated){setAlbums([]);return}
  const result=await donePickAlbums.list();
  setAlbums(result);
 }
 useEffect(()=>{void reload().catch(e=>setError(e.message))},[authenticated]);
 async function addAlbum(){
  setError('');setNotice('');
  try{
   const no=validateAlbumProcess(processNo);
   setBusy(true);
   const album=await donePickAlbums.add(no);
   setProcessNo('');setAdding(false);setSelected(album.id);
   await reload();
   setNotice('Created Done Pick List entry for Process '+no+'. Add photos below.');
  }catch(e:any){setError(e.message||'Could not add Process No.')}
  finally{setBusy(false)}
 }
 async function addPhotos(album:PickAlbum,files:FileList|null){
  if(!files?.length)return;
  setError('');setNotice('');setUploading(album.id);
  try{
   const result=await donePickAlbums.upload(album,Array.from(files));
   await reload();
   setSelected(album.id);
   if(result.failures.length)setError(result.successes+' uploaded; '+result.failures.length+' failed: '+result.failures.slice(0,3).join('; '));
   else setNotice(result.successes+' photo(s) safely uploaded to Process '+album.process_no+'.');
  }catch(e:any){setError(e.message||'Could not upload selected photos')}
  finally{setUploading('')}
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
 return <>
  <Heading eyebrow='DONE PICK LIST · PHOTO RECORDS' title='Done Pick List' description='Create an entry using only a Process No., then store multiple Done Pick List photos under it. Open or download any photo later.' actions={<><Button onClick={()=>void reload()}><RefreshCw size={16}/> Refresh</Button><Button variant='primary' onClick={()=>setAdding(!adding)}><Plus size={16}/> Add Process No.</Button></>}/>
  <div className='dpa-status'><ShieldCheck size={17}/>{authenticated?'Photos are saved in private Supabase storage and grouped by the Process No. you enter.':'Sign in to your cloud workspace to create entries and upload photos. Local preview does not retain file bytes.'}</div>
  {error&&<div className='dpa-message error' role='alert'><AlertCircle size={16}/>{error}</div>}
  {notice&&<div className='dpa-message success' role='status'><CheckCircle2 size={16}/>{notice}</div>}
  {adding&&<Panel title='Create a Done Pick List entry' subtitle='No Party Name, SO No., invoice or other document is required.'>
   <div className='dpa-add-form'>
    <label className='ux-field'>Process No.<input value={processNo} inputMode='numeric' maxLength={9} placeholder='e.g. 295845' onChange={e=>setProcessNo(e.target.value.replace(/[^0-9]/g,''))} onKeyDown={e=>{if(e.key==='Enter')void addAlbum()}}/></label>
    <Button variant='primary' disabled={!authenticated||busy||processNo.length<5} onClick={()=>void addAlbum()}><FilePlus2 size={16}/> {busy?'Creating…':'Create entry'}</Button>
   </div>
  </Panel>}
  <Panel title={'Saved Done Pick List entries ('+albums.length+')'} subtitle='One entry per Process No.; as many separate uploads as needed. Up to 25 photos per batch, 5 MB per photo.' actions={<div className='dpa-search'><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search Process No.'/></div>}>
   {!filtered.length?<Empty icon={Images} title={search?'No matching Process No.':'No Done Pick List entries yet'} help='Click Add Process No. to create an entry, then upload its photos.'/>:
    <div className='dpa-albums'>{filtered.map(album=><article key={album.id} className='dpa-album'>
     <div className='dpa-album-bar'>
      <div className='dpa-album-name'><span className='dpa-number'>{album.process_no}</span><small>{album.photos.length} photo{album.photos.length===1?'':'s'} saved · {new Date(album.created_at).toLocaleDateString('en-IN')}</small></div>
      <div className='dpa-actions'>
       <label className={'ux-button primary dpa-upload '+(uploading===album.id?'disabled':'')}><Upload size={15}/>{uploading===album.id?'Uploading…':'Add photos'}
        <input type='file' accept='image/jpeg,image/png,image/webp' multiple disabled={!authenticated||Boolean(uploading)||busy} onChange={e=>{const files=e.target.files;void addPhotos(album,files);e.target.value=''}}/>
       </label>
       <Button onClick={()=>void loadPreview(album)}>{selected===album.id?'Hide photos':'View photos'} ({album.photos.length})</Button>
      </div>
     </div>
     {selected===album.id&&<div className='dpa-photo-grid'>
      {album.photos.length?album.photos.map(photo=><div className='dpa-photo' key={photo.id}>
       {previewUrls[photo.id]?<img src={previewUrls[photo.id]} alt={'Done Pick List '+photo.name} loading='lazy'/>:<div className='dpa-photo-placeholder'><FileImage size={32}/></div>}
       <div className='dpa-photo-info'><strong title={photo.name}>{photo.name}</strong><small>{(photo.size_bytes/1024/1024).toFixed(2)} MB · {new Date(photo.created_at).toLocaleDateString('en-IN')}</small></div>
       <div className='dpa-photo-actions'><Button onClick={()=>void view(photo)}><ExternalLink size={14}/> Open</Button><Button onClick={()=>void download(photo)}><Download size={14}/> Download</Button></div>
      </div>):<div className='dpa-empty-album'><Camera size={22}/> No photos yet. Click Add photos above to upload one or more images.</div>}
     </div>}
    </article>)}</div>}
  </Panel>
  {historical.length>0&&<Panel title={'Previously uploaded Done Pick Lists ('+historical.length+')'} subtitle='Photos that were already attached directly to master processes remain available. No existing documents were moved or deleted.'>
    <div className='dpa-history'>{historical.map(({record,doc})=><div key={doc.id}><strong>Process {record.process}</strong><span>{doc.name}</span><Button onClick={()=>void cloud.open(record.id,doc.id).catch(e=>setError(e.message||'Could not open photo'))}><ExternalLink size={14}/> Open</Button><Button onClick={()=>void cloud.download(record.id,doc.id).catch(e=>setError(e.message||'Could not download photo'))}><Download size={14}/> Download</Button></div>)}</div>
  </Panel>}
 </>;
}
