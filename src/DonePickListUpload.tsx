import {useEffect,useRef,useState} from 'react';
import {AlertCircle,Camera,CheckCircle2,FileCheck2,FileImage,FileUp,LoaderCircle,ScanText,ShieldCheck,UploadCloud,X} from 'lucide-react';
import {cloud} from './cloud';
import {type DonePickRead} from './donePickReader';
import './done-pick.css';

const just=(value:any)=>String(value??'').trim();
type Props={
  records:any[];
  authenticated:boolean;
  onClose:()=>void;
  onAttach:(record:any,file:File,ocrProcess:string)=>Promise<void>;
  onGoToDataStore:()=>void;
};
export default function DonePickListUpload({records,authenticated,onClose,onAttach,onGoToDataStore}:Props){
  const chooseRef=useRef<HTMLInputElement>(null);
  const cameraRef=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [read,setRead]=useState<DonePickRead|null>(null);
  const [process,setProcess]=useState('');
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [done,setDone]=useState(false);
  const [remoteMatch,setRemoteMatch]=useState<any>(null);
  const [finding,setFinding]=useState(false);
  useEffect(()=>{
    if(!file||!file.type.startsWith('image/')){setPreview('');return}
    const uri=URL.createObjectURL(file);setPreview(uri);
    return()=>URL.revokeObjectURL(uri);
  },[file]);
  const matches=records.filter(r=>just(r.process)===process.trim());
  const matched=matches.length===1?matches[0]:remoteMatch&&just(remoteMatch.process)===process.trim()?remoteMatch:null;
  useEffect(()=>{
    setRemoteMatch(null);
    if(!authenticated||process.length<5||process.length>9||matches.length===1){setFinding(false);return}
    let cancelled=false;
    setFinding(true);
    const timer=window.setTimeout(()=>{
      void cloud.findByProcess(process).then(r=>{if(!cancelled)setRemoteMatch(r)}).catch(e=>{if(!cancelled)setError('Cloud search failed: '+(e?.message||'Please retry.'))}).finally(()=>{if(!cancelled)setFinding(false)});
    },350);
    return()=>{cancelled=true;window.clearTimeout(timer)};
  },[authenticated,process,records]);

  const duplicates=matched?.documents?.filter((d:any)=>d.kind==='donePickDoc')||[];
  async function selected(f?:File){
    if(!f)return;
    setFile(f);setRead(null);setProcess('');setError('');setDone(false);
    if(f.size>5*1024*1024){setError('Photo is larger than 5 MB. Please reduce its size before uploading.');return}
    setBusy(true);
    try{
      const result=await cloud.readDonePick(f);
      setRead(result);
      if(result.status==='detected')setProcess(result.process);
      if(result.status==='missing')setError('OCR could not find a labelled Process No. Enter it manually after checking the photo.');
      if(result.status==='ambiguous')setError('OCR found more than one Process No. Check the document and enter the correct one manually.');
    }catch(e:any){setError(e?.message||'Could not read the photo. Check its quality or enter Process No. manually.')}
    finally{setBusy(false)}
  }
  async function confirm(){
    if(!authenticated){setError('Private cloud attachment needs an authenticated login. Use Google or an existing password account to sign in.');return}
    if(!file||!matched||busy||saving||finding)return;
    setSaving(true);setError('');
    try{await onAttach(matched,file,read?.status==='detected'?read.process:'');setDone(true)}
    catch(e:any){setError(e?.message||'Could not attach the photo. Please try again.')}
    finally{setSaving(false)}
  }
  return <div className='dp-overlay' role='presentation' onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose()}}>
    <section className='dp-card' role='dialog' aria-modal='true' aria-label='Upload Done Pick List'>
      <div className='dp-head'><span className='dp-icon'><ScanText size={25}/></span><div><span className='dp-eyebrow'>DATA STORE · OCR MATCHING</span><h2>Upload Done Pick List</h2><p>Read the Process No. from a photo, match the existing process, then attach the original image privately.</p></div><button aria-label='Close' className='dp-close' onClick={onClose} disabled={saving}><X size={20}/></button></div>
      {done?<div className='dp-success'><CheckCircle2 size={36}/><h3>Done Pick List attached</h3><p>Saved in private cloud storage under <strong>Process {matched?.process}</strong>, {matched?.party}.</p><button className='dp-primary' onClick={onClose}>Return to Data Store</button></div>:<>
      <div className='dp-body'>
        <div className='dp-step'><b>1</b><strong>Choose a photo or PDF</strong></div>
        <div className='dp-choose'>
          <button onClick={()=>cameraRef.current?.click()} disabled={busy||saving}><Camera size={19}/><span>Take a photo</span><small>Mobile camera</small></button>
          <button onClick={()=>chooseRef.current?.click()} disabled={busy||saving}><FileUp size={19}/><span>Upload a file</span><small>JPG, PNG, WebP or PDF · max 5 MB</small></button>
        </div>
        <input ref={cameraRef} type='file' accept='image/*' capture='environment' hidden onChange={e=>{void selected(e.target.files?.[0]);e.target.value=''}}/>
        <input ref={chooseRef} type='file' accept='.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf' hidden onChange={e=>{void selected(e.target.files?.[0]);e.target.value=''}}/>
        {file&&<div className='dp-file'>{preview?<img src={preview} alt='Selected Done Pick List'/>:<FileImage size={28}/>}<div><strong>{file.name}</strong><small>{(file.size/(1024*1024)).toFixed(2)} MB · {busy?'Reading Process No.…':read?.status==='detected'?'Process No. found':'Review Process No. below'}</small></div>{busy&&<LoaderCircle className='dp-spin' size={21}/>}</div>}
        <div className='dp-step'><b>2</b><strong>Verify Process No.</strong></div>
        <label className='dp-label' htmlFor='done-process-no'>Process No. printed on the Done Pick List</label>
        <input id='done-process-no' className='dp-process-input' value={process} placeholder='e.g. 292184' inputMode='numeric' autoComplete='off' onChange={e=>{setProcess(e.target.value.replace(/[^0-9]/g,''));setError('')}} disabled={saving} />
        <div className='dp-hint'>{read?.status==='detected'&&process===read.process?<><CheckCircle2 size={15}/> OCR detected <b>{read.process}</b>. Please verify it against the photo.</>:read?.status==='ambiguous'?<>Multiple numbers detected: {read.candidates.join(', ')}. Choose the right one after checking the photo.</>:<>You can enter or correct the Process No. manually. Other numbers, including SO No., are not used for matching.</>}</div>
        <div className='dp-step'><b>3</b><strong>Match your cloud process</strong></div>
        {process.trim()?matched?<div className='dp-match'><CheckCircle2 size={23}/><div><strong>Process {matched.process} — {matched.party||'Unnamed party'}</strong><small>Sales Order {matched.so||'Not entered'} · {duplicates.length?duplicates.length+' Done Pick List(s) already attached':'No Done Pick List yet'}</small></div></div>:<div className='dp-no-match'><AlertCircle size={18}/><div><strong>No exact matching process in this workspace</strong><span>Confirm the number or upload its original Pick Slip first. No attachment will be saved without a match.</span><button onClick={onGoToDataStore}>Open Data Store</button></div></div>:<div className='dp-unmatched'>Enter the Process No. to find its saved cloud process.</div>}
        {!authenticated&&<div className='dp-warning'><ShieldCheck size={19}/><span>This workspace is not signed in. OCR runs on your device, but Done Pick List photos can be saved to private Supabase storage only after login.</span></div>}
        {error&&<div className='dp-error' role='alert'><AlertCircle size={17}/><span>{error}</span></div>}
      </div>
      <footer className='dp-foot'><span><ShieldCheck size={14}/> Never attaches a photo to an unmatched process</span><button onClick={onClose} className='dp-cancel' disabled={saving}>Cancel</button><button className='dp-primary' onClick={()=>void confirm()} disabled={!authenticated||!file||!matched||busy||saving}>{saving?'Attaching…':'Confirm & attach photo'} <UploadCloud size={16}/></button></footer>
      </>}
    </section>
  </div>
}
