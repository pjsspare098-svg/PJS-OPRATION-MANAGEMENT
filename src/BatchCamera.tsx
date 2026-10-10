import {useCallback,useEffect,useRef,useState} from 'react';
import {Camera,CameraOff,Check,FlipHorizontal2,ImagePlus,Trash2,X} from 'lucide-react';
import {validateAlbumPhoto} from './donePickAlbumRules';
import './batch-camera.css';

type Shot={id:string;file:File;url:string};
const LIMIT=25;
const MAX_EDGE=1800;

/** Continuous camera: locally capture many photos before any upload. */
export default function BatchCamera({onDone,onClose}:{onDone:(files:File[])=>void;onClose:()=>void}){
 const videoRef=useRef<HTMLVideoElement|null>(null);
 const streamRef=useRef<MediaStream|null>(null);
 const shotsRef=useRef<Shot[]>([]);
 const [shots,setShots]=useState<Shot[]>([]);
 const [facing,setFacing]=useState<'environment'|'user'>('environment');
 const [cameraError,setCameraError]=useState('');
 const [cameraReady,setCameraReady]=useState(false);
 const [capturing,setCapturing]=useState(false);
 const [selected,setSelected]=useState('');
 const [help,setHelp]=useState('');
 const count=shots.length;
 const stopCamera=useCallback(()=>{
  const stream=streamRef.current;
  streamRef.current=null;
  if(stream)stream.getTracks().forEach(track=>track.stop());
  if(videoRef.current)videoRef.current.srcObject=null;
 },[]);
 useEffect(()=>{shotsRef.current=shots},[shots]);
 useEffect(()=>()=>{stopCamera();shotsRef.current.forEach(s=>URL.revokeObjectURL(s.url))},[stopCamera]);
 useEffect(()=>{
  let cancelled=false;
  async function open(){
   stopCamera();setCameraReady(false);setCameraError('');
   if(!navigator.mediaDevices?.getUserMedia){
    setCameraError('This browser cannot open an in-page camera. Use the photo/gallery picker below instead.');
    return;
   }
   try{
    const media=await navigator.mediaDevices.getUserMedia({
     audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}
    });
    if(cancelled){media.getTracks().forEach(track=>track.stop());return}
    streamRef.current=media;
    const video=videoRef.current;
    if(!video){stopCamera();return}
    video.srcObject=media;
    await video.play();
    if(!cancelled)setCameraReady(true);
   }catch(e:any){
    if(cancelled)return;
    const denied=e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError';
    const busy=e?.name==='NotReadableError';
    setCameraError(denied?'Camera permission denied. Allow camera access in Chrome, or select existing photos below.':busy?'Camera unavailable because another application is using it. Close that camera or choose photos from your gallery.':'Cannot start camera. You can still add photos from your gallery.');
   }
  }
  void open();
  return()=>{cancelled=true;stopCamera()};
 },[facing,stopCamera]);
 useEffect(()=>{
  function onKey(e:KeyboardEvent){if(e.key==='Escape'&&!capturing)onClose()}
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[capturing,onClose]);

 function addFiles(files:File[]){
  const available=LIMIT-shotsRef.current.length;
  if(files.length>available){setHelp('Maximum '+LIMIT+' photos in one batch. Remove a photo or finish this batch.');return}
  try{
   for(const file of files)validateAlbumPhoto(file);
   const next=files.map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)}));
   shotsRef.current=[...shotsRef.current,...next];
   setShots(shotsRef.current);setHelp('');
   // Captured shots only appear in the miniature filmstrip; keep the live view uninterrupted.
   setSelected('');
  }catch(e:any){setHelp(e?.message||'Photo is too large or unsupported.')}
 }
 async function shutter(){
  if(capturing||!cameraReady||count>=LIMIT)return;
  const video=videoRef.current;
  if(!video||!video.videoWidth||!video.videoHeight){setHelp('Camera is still initializing. Please try again.');return}
  setCapturing(true);setHelp('');
  try{
   const scale=Math.min(1,MAX_EDGE/Math.max(video.videoWidth,video.videoHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.floor(video.videoWidth*scale));
   canvas.height=Math.max(1,Math.floor(video.videoHeight*scale));
   const context=canvas.getContext('2d');
   if(!context)throw Error('Could not capture this frame.');
   context.drawImage(video,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.87));
   if(!blob)throw Error('Could not save the captured frame.');
   const name='DonePick_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+(shotsRef.current.length+1)+'.jpg';
   const file=new File([blob],name,{type:'image/jpeg'});
   addFiles([file]);
  }catch(e:any){setHelp(e?.message||'Could not capture photo. Try again.')}
  finally{setCapturing(false)}
 }
 function removePhoto(id:string){
  const found=shotsRef.current.find(s=>s.id===id);
  if(found)URL.revokeObjectURL(found.url);
  shotsRef.current=shotsRef.current.filter(s=>s.id!==id);
  setShots(shotsRef.current);
  if(selected===id)setSelected('');
  setHelp('');
 }
 function complete(){
  if(capturing||!shotsRef.current.length)return;
  stopCamera();
  onDone(shotsRef.current.map(s=>s.file));
 }
 return <div className='pjs-cam-screen' role='presentation'>
  <section className='pjs-cam' role='dialog' aria-modal='true' aria-label='Capture multiple Done Pick List photos'>
   <header className='pjs-cam-head'>
    <button type='button' className='pjs-cam-icon' aria-label='Close camera without uploading' onClick={onClose}><X size={23}/></button>
    <div><strong>Done Pick List Camera</strong><small>Keep taking photos — no upload until you finish</small></div>
    <span className='pjs-cam-count'>{count}/{LIMIT}</span>
   </header>
   <div className='pjs-cam-view'>
    <video ref={videoRef} autoPlay playsInline muted aria-label='Live camera preview'/>
    {!cameraReady&&<div className='pjs-cam-camera-msg'><CameraOff size={27}/><p>{cameraError||'Opening camera…'}</p></div>}
    {cameraReady&&<span className='pjs-cam-live'>LIVE CAMERA</span>}
    {cameraReady&&<div className='pjs-cam-guide' aria-hidden='true'/>}
   </div>
   <div className='pjs-cam-controls'>
    <label className='pjs-cam-secondary' title='Choose photos from gallery'><ImagePlus size={22}/><input type='file' accept='image/jpeg,image/png,image/webp' multiple onChange={e=>{addFiles(Array.from(e.target.files||[]));e.target.value=''}}/></label>
    <button type='button' aria-label='Take a photo' className='pjs-cam-shutter' disabled={!cameraReady||capturing||count>=LIMIT} onClick={()=>void shutter()}><span/></button>
    <button type='button' className='pjs-cam-secondary' aria-label='Switch between front and back cameras' disabled={capturing} onClick={()=>setFacing(x=>x==='environment'?'user':'environment')}><FlipHorizontal2 size={23}/></button>
   </div>
   {help&&<p className='pjs-cam-error' role='alert'>{help}</p>}
   <div className='pjs-cam-tray'>
    <div className='pjs-cam-tray-heading'><strong>{count} photo{count===1?'':'s'} captured</strong><span>Tap any thumbnail to preview or remove it</span></div>
    <div className='pjs-cam-thumbs' aria-label='Captured photos'>
     {shots.length?shots.map((shot,i)=><button type='button' key={shot.id} className={selected===shot.id?'active':''} onClick={()=>setSelected(selected===shot.id?'':shot.id)} aria-label={'Preview captured photo '+(i+1)}>
       <img src={shot.url} alt={'Captured photo '+(i+1)}/><span>{i+1}</span>
      </button>):<div className='pjs-cam-no-shots'><Camera size={19}/> Captured photos will appear here</div>}
    </div>
    {selected&&shots.find(s=>s.id===selected)&&<div className='pjs-cam-selection'><img src={shots.find(s=>s.id===selected)!.url} alt='Selected captured photo'/><button type='button' onClick={()=>removePhoto(selected)}><Trash2 size={15}/> Remove this photo</button></div>}
   </div>
   <footer className='pjs-cam-footer'>
    <span>{!count?'Tap the shutter to take your first photo':count+' photo(s) ready. You can keep taking more.'}</span>
    <button type='button' disabled={!count||capturing} onClick={complete}><Check size={20}/> Done <span>{count}</span></button>
   </footer>
  </section>
 </div>;
}
