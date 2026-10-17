import {useEffect,useRef,useState} from 'react';
import {Camera,Check,ExternalLink,FileImage,ImagePlus,Loader2,ShieldAlert,UploadCloud,X} from 'lucide-react';
import {cloud} from './cloud';
import {supabase} from './independentClient';
import {CAPTURE_STATUSES,extractTrackingStatus,type CaptureStatus} from './transportTracking';

type Props={process:any;onClose:()=>void;onSaved:()=>Promise<void>|void;onNotice:(notice:string)=>void};
export default function TransportTrackingCapture({process,onClose,onSaved,onNotice}:Props){
 const [file,setFile]=useState<File|null>(null);
 const [suggestion,setSuggestion]=useState<CaptureStatus>('Needs Review');
 const [ocrDetail,setOcrDetail]=useState('');
 const [busy,setBusy]=useState(false);
 const [scanning,setScanning]=useState(false);
 const [error,setError]=useState('');
 const [toolsOpen,setToolsOpen]=useState(true);
 const fileRef=useRef<HTMLInputElement>(null);
 const [preview,setPreview]=useState('');
 useEffect(()=>{
  if(!file){setPreview('');return}
  const url=URL.createObjectURL(file);setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[file]);
 async function evaluateScreenshot(selected:File){
  setFile(selected);setSuggestion('Needs Review');setOcrDetail('');setError('');
  setScanning(true);
  try{
   const {recognize}=await import('tesseract.js');
   const reading=await recognize(selected,'eng');
   const detected=extractTrackingStatus(reading.data.text);
   setSuggestion(detected.status);setOcrDetail(detected.detail);
  }catch(e:any){setOcrDetail('Screenshot ready. OCR unavailable — review and select the status manually.');}
  finally{setScanning(false)}
 }
 async function captureTab(){
  // Must be called directly from a click; browsers require explicit permission.
  if(!navigator.mediaDevices?.getDisplayMedia){setError('Tab capture is unavailable in this browser. Use Upload Screenshot instead.');return}
  let stream:MediaStream|undefined;
  setBusy(true);setError('');
  try{
   stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false});
   const video=document.createElement('video');
   video.srcObject=stream;video.muted=true;video.playsInline=true;
   await video.play();
   if(!video.videoWidth||!video.videoHeight){
    await new Promise<void>((resolve,reject)=>{
     const wait=window.setTimeout(()=>reject(new Error('No picture received from the selected tab')),6000);
     video.onloadeddata=()=>{window.clearTimeout(wait);resolve()};
    });
   }
   // Give the newly shared tab a moment to produce an actual frame.
   await new Promise(resolve=>window.setTimeout(resolve,240));
   const canvas=document.createElement('canvas');
   const scale=Math.min(1,2200/Math.max(video.videoWidth,video.videoHeight));
   canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
   canvas.getContext('2d')?.drawImage(video,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
   if(!blob)throw Error('Screenshot could not be created');
   await evaluateScreenshot(new File([blob],`Tracking_${String(process.process).replace(/[^a-zA-Z0-9_-]/g,'')}_${Date.now()}.jpg`,{type:'image/jpeg'}));
  }catch(e:any){setError(e?.name==='NotAllowedError'?'Tab sharing was cancelled or blocked. Use Upload Screenshot if needed.':e?.message||'Unable to capture the selected tab.')}
  finally{stream?.getTracks().forEach(track=>track.stop());setBusy(false)}
 }
 function selectImage(selected?:File){
  if(!selected)return;
  if(!['image/png','image/jpeg'].includes(selected.type)){setError('Use JPG or PNG screenshots only.');return}
  if(selected.size>5*1024*1024){setError('Screenshot exceeds the 5 MB attachment limit.');return}
  void evaluateScreenshot(selected);
 }
 async function saveCapture(){
  if(!file||!process?.id||scanning||busy)return;
  if(!supabase){setError('Sign in to the independent Supabase workspace before saving.');return}
  if(!window.confirm('Save this image and '+suggestion+' as an UNVERIFIED screenshot reading for Process '+process.process+'? This does not confirm delivery.'))return;
  setBusy(true);setError('');
  try{
   const saved=await cloud.upload(process.id,'trackingShotDoc',file);
   if(!saved.documentId)throw Error('Screenshot upload did not return a document reference.');
   const {data,error:dbError}=await supabase.rpc('oms_record_tracking_capture',{
    p_process_id:process.id,p_document_id:saved.documentId,p_status:suggestion,p_detail:ocrDetail.slice(0,600)
   });
   if(dbError||!data)throw Error('Image uploaded, but status could not be attached to the process. Open the process attachments and retry from a new screenshot: '+String(dbError?.message||'database refused status'));
   await onSaved();
   onNotice('Screenshot saved to Process '+process.process+'. OCR status: '+suggestion+' (not verified by the carrier worker).');
   onClose();
  }catch(e:any){setError(e?.message||'Could not save tracking screenshot.')}
  finally{setBusy(false)}
 }
 return <div className='ux-tracking-overlay' role='dialog' aria-modal='true' aria-label={'Tracking screenshot for '+process.process}>
  <div className='ux-tracking-capture-panel'>
   <header><div><small>TRACKING EVIDENCE · UNVERIFIED OCR</small><h3>Process {process.process}</h3><p>{process.party||'Customer'} · {process.transporter||'Transporter'} · LR {process.lr||'Not entered'}</p></div><button aria-label='Close screenshot capture' onClick={onClose} disabled={busy}><X size={20}/></button></header>
   <div className='ux-capture-intro'><ShieldAlert size={17}/> Only select the correct carrier tab. Avoid sharing unrelated tabs or private information. OCR suggestions require review before dispatch or delivery decisions.</div>
   <input ref={fileRef} hidden type='file' accept='image/jpeg,image/png,.jpg,.jpeg,.png' onChange={e=>{selectImage(e.target.files?.[0]);e.target.value=''}}/>
   <div className='ux-capture-actions'><button type='button' onClick={()=>void captureTab()} disabled={busy||scanning}><Camera size={17}/> Capture selected tab</button><button type='button' onClick={()=>fileRef.current?.click()} disabled={busy||scanning}><ImagePlus size={17}/> Upload screenshot</button></div>
   {file&&<div className='ux-capture-image'><img src={preview} alt='Selected carrier result screenshot'/><small>{file.name} · {(file.size/1024).toFixed(0)} KB</small></div>}
   <label className='ux-capture-status'>Carrier result suggested by screenshot OCR <select value={suggestion} disabled={busy||scanning} onChange={e=>setSuggestion(e.target.value as CaptureStatus)}>{CAPTURE_STATUSES.map(x=><option key={x}>{x}</option>)}</select></label>
   <small className='ux-capture-detail'>{scanning?'Reading screenshot with OCR…':ocrDetail||'Capture a tab or upload a screenshot to extract a suggested current status.'}</small>
   {error&&<p className='ux-capture-error' role='alert'>{error}</p>}
   <div className='ux-capture-footer'><button type='button' onClick={onClose} disabled={busy}>Cancel</button><button type='button' className='primary' onClick={()=>void saveCapture()} disabled={!file||busy||scanning}>{busy||scanning?<Loader2 size={16}/>:<UploadCloud size={16}/>} {busy?'Saving…':scanning?'Reading…':'Save to this process'}</button></div>
  </div>
  <div className='ux-capture-float'>
   <button type='button' className='ux-capture-bubble' onClick={()=>setToolsOpen(!toolsOpen)} aria-label='Toggle tracking capture tools'><Camera size={22}/></button>
   {toolsOpen&&<div className='ux-capture-bubble-menu'><strong>Tracking tools</strong><button type='button' disabled={busy||scanning} onClick={()=>void captureTab()}><Camera size={14}/> Capture tab</button><button type='button' disabled={busy||scanning} onClick={()=>fileRef.current?.click()}><FileImage size={14}/> Upload image</button></div>}
  </div>
 </div>;
}
