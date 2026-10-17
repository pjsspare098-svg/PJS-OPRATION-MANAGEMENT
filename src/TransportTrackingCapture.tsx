import {useEffect,useRef,useState} from 'react';
import {Camera,FileImage,ImagePlus,Loader2,ShieldAlert,UploadCloud,X} from 'lucide-react';
import {cloud} from './cloud';
import {supabase} from './independentClient';
import {CAPTURE_STATUSES,type CaptureStatus} from './transportTracking';

type Props={process:any;onClose:()=>void;onSaved:()=>Promise<void>|void;onNotice:(notice:string)=>void};
export default function TransportTrackingCapture({process,onClose,onSaved,onNotice}:Props){
 const [file,setFile]=useState<File|null>(null);
 const [manualStatus,setManualStatus]=useState<CaptureStatus>('Needs Review');
 const [resultDetails,setResultDetails]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [toolsOpen,setToolsOpen]=useState(true);
 const fileRef=useRef<HTMLInputElement>(null);
 const [preview,setPreview]=useState('');
 useEffect(()=>{
  if(!file){setPreview('');return}
  const url=URL.createObjectURL(file);setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[file]);
 function selectScreenshot(selected:File){setFile(selected);setError('');}
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
   selectScreenshot(new File([blob],`Tracking_${String(process.process).replace(/[^a-zA-Z0-9_-]/g,'')}_${Date.now()}.jpg`,{type:'image/jpeg'}));
  }catch(e:any){setError(e?.name==='NotAllowedError'?'Tab sharing was cancelled or blocked. Use Upload Screenshot if needed.':e?.message||'Unable to capture the selected tab.')}
  finally{stream?.getTracks().forEach(track=>track.stop());setBusy(false)}
 }
 function selectImage(selected?:File){
  if(!selected)return;
  if(!['image/png','image/jpeg'].includes(selected.type)){setError('Use JPG or PNG screenshots only.');return}
  if(selected.size>5*1024*1024){setError('Screenshot exceeds the 5 MB attachment limit.');return}
  selectScreenshot(selected);
 }
 async function saveCapture(){
  if(!file||!process?.id||busy)return;
  if(!resultDetails.trim()){setError('Enter the tracking result details before saving.');return}
  if(!supabase){setError('Sign in to the independent Supabase workspace before saving.');return}
  if(!window.confirm('Save the screenshot and manually entered tracking result for Process '+process.process+'? This is NOT carrier-worker verified and does not confirm delivery.'))return;
  setBusy(true);setError('');
  try{
   const saved=await cloud.upload(process.id,'trackingShotDoc',file);
   if(!saved.documentId)throw Error('Screenshot upload did not return a document reference.');
   const {data,error:dbError}=await supabase.rpc('oms_record_tracking_capture',{
    p_process_id:process.id,p_document_id:saved.documentId,p_status:manualStatus,p_detail:resultDetails.trim().slice(0,600)
   });
   if(dbError||!data)throw Error('Image uploaded, but status could not be attached to the process. Open the process attachments and retry from a new screenshot: '+String(dbError?.message||'database refused status'));
   await onSaved();
   onNotice('Screenshot and manual tracking result saved to Process '+process.process+'. This result is not carrier-worker verified.');
   onClose();
  }catch(e:any){setError(e?.message||'Could not save tracking screenshot.')}
  finally{setBusy(false)}
 }
 return <div className='ux-tracking-overlay' role='dialog' aria-modal='true' aria-label={'Tracking screenshot for '+process.process}>
  <div className='ux-tracking-capture-panel'>
   <header><div><small>TRACKING EVIDENCE · MANUAL RESULT</small><h3>Process {process.process}</h3><p>{process.party||'Customer'} · {process.transporter||'Transporter'} · LR {process.lr||'Not entered'}</p></div><button aria-label='Close screenshot capture' onClick={onClose} disabled={busy}><X size={20}/></button></header>
   <div className='ux-capture-intro'><ShieldAlert size={17}/> Only select the correct carrier tab. Avoid sharing unrelated tabs or private information. Enter the shipment status and details yourself; this is not carrier-worker verified.</div>
   <input ref={fileRef} hidden type='file' accept='image/jpeg,image/png,.jpg,.jpeg,.png' onChange={e=>{selectImage(e.target.files?.[0]);e.target.value=''}}/>
   <div className='ux-capture-actions'><button type='button' onClick={()=>void captureTab()} disabled={busy}><Camera size={17}/> Capture selected tab</button><button type='button' onClick={()=>fileRef.current?.click()} disabled={busy}><ImagePlus size={17}/> Upload screenshot</button></div>
   {file&&<div className='ux-capture-image'><img src={preview} alt='Selected carrier result screenshot'/><small>{file.name} · {(file.size/1024).toFixed(0)} KB</small></div>}
   <label className='ux-capture-status'>Carrier status (manual entry)
    <select value={manualStatus} disabled={busy} onChange={e=>setManualStatus(e.target.value as CaptureStatus)}>{CAPTURE_STATUSES.map(x=><option key={x}>{x}</option>)}</select>
   </label>
   <label className='ux-capture-status'>Tracking result details
    <textarea className='ux-capture-detail-input' rows={4} maxLength={600} value={resultDetails} disabled={busy} onChange={e=>setResultDetails(e.target.value)} placeholder='Enter the result from the carrier website: location, date, remarks, expected delivery, etc.' aria-label='Tracking result details'/>
   </label>
   <small className='ux-capture-detail'>{resultDetails.length}/600 characters · These details will appear in Carrier result after saving.</small>
   {error&&<p className='ux-capture-error' role='alert'>{error}</p>}
   <div className='ux-capture-footer'><button type='button' onClick={onClose} disabled={busy}>Cancel</button><button type='button' className='primary' onClick={()=>void saveCapture()} disabled={!file||!resultDetails.trim()||busy}>{busy?<Loader2 size={16}/>:<UploadCloud size={16}/>} {busy?'Saving…':'Save to this process'}</button></div>
  </div>
  <div className='ux-capture-float'>
   <button type='button' className='ux-capture-bubble' onClick={()=>setToolsOpen(!toolsOpen)} aria-label='Toggle tracking capture tools'><Camera size={22}/></button>
   {toolsOpen&&<div className='ux-capture-bubble-menu'><strong>Tracking tools</strong><button type='button' disabled={busy} onClick={()=>void captureTab()}><Camera size={14}/> Capture tab</button><button type='button' disabled={busy} onClick={()=>fileRef.current?.click()}><FileImage size={14}/> Upload image</button></div>}
  </div>
 </div>;
}
