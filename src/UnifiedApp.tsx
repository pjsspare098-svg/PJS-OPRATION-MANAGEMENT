import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,Upload,X} from 'lucide-react';
import {supabase} from './independentClient';
import {cloud} from './cloud';
import {dispatchDetailsText} from './emailWorkflow';
import {ops,mockRecords,saveDemo,missingDocs,isException,defaults,type Job,type AuditEvent,type Preferences} from './unifiedOps';
import {teamsApi} from './teamOps';
import {canCloseProcess} from './businessRules';
import {processTransferIssues,transferStageStatus} from './processTransfer.ts';
import {normalizedStage,type WorkflowStage} from './workflowStages.ts';
import {resolveSiteRoute,manualSubmitFields,creditCategory,submitRecords,type SitePage,type DispatchTab,type SubmitTab,type CheckTab,type SettingsTab,type PendingView} from './siteNavigation';
import {missingSubmissionRequirements} from './manualSubmitRules';
import {displayedTrackingResult} from './manualDispatchTracking';
import DispatchProcessPage from './DispatchProcessPage';
import SubmitProcessPage from './SubmitProcessPage';
import SalesRegisterPage from './SalesRegisterPage';
import UnifiedDialog,{blankProcess} from './UnifiedDialog';
import UnifiedLogin from './UnifiedLogin';
import DonePickListUpload from './DonePickListUpload';
import UnifiedShell,{type Section} from './UnifiedShell';
import UnifiedCorePages from './UnifiedCorePages';
import UnifiedStagePagesA from './UnifiedStagePagesA';
import UnifiedStagePagesB from './UnifiedStagePagesB';
import './excel-lr.css';
import './unified.css';
import './unified-extra.css';
import './responsive-redesign.css';
import './settings-v2.css';
import './seven-page.css';
import {applySettingsV2,readSettingsV2,SETTINGS_V2_EVENT} from './settingsV2Preferences';

const includes=(value:any,query:string)=>String(value??'').toLowerCase().includes(query);
export default function UnifiedApp(){
 const [checking,setChecking]=useState(true),[user,setUser]=useState<any>(null),[demo,setDemo]=useState(false);
 const [page,setPage]=useState<SitePage>(()=>{const candidate=resolveSiteRoute(localStorage.getItem('pjs_oms_landing_page_v1')).page;return candidate==='Transport Bill'?'Dashboard':candidate});
 const [dispatchTab,setDispatchTab]=useState<DispatchTab>('pending');
 const [submitTab,setSubmitTab]=useState<SubmitTab>('bill');
 const [pendingView,setPendingView]=useState<PendingView>('work');
 const [checkTab,setCheckTab]=useState<CheckTab>('exceptions');
 const [settingsTab,setSettingsTab]=useState<SettingsTab>('preferences');
 const [records,setRecords]=useState<any[]>([]),[trashedProcesses,setTrashedProcesses]=useState<any[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]),[events,setEvents]=useState<AuditEvent[]>([]),[exceptions,setExceptions]=useState<any[]>([]),[settings,setSettings]=useState<Preferences>(defaults);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [search,setSearch]=useState(''),[dialog,setDialog]=useState(false),[record,setRecord]=useState<any>(null),[pickFile,setPickFile]=useState<File|null>(null);
 const [donePickOpen,setDonePickOpen]=useState(false);
 const [activeTeam,setActiveTeam]=useState('');
 const [importIssue,setImportIssue]=useState('');
 const picker=useRef<HTMLInputElement>(null);
 useEffect(()=>{document.documentElement.dataset.omsTheme=localStorage.getItem('pjs_oms_appearance_theme_v1')==='dark'?'dark':'light'},[]);
 useEffect(()=>{
  const sync=()=>applySettingsV2(readSettingsV2());
  sync();window.addEventListener(SETTINGS_V2_EVENT,sync);window.addEventListener('storage',sync);
  return()=>{window.removeEventListener(SETTINGS_V2_EVENT,sync);window.removeEventListener('storage',sync)};
 },[]);
 useEffect(()=>{
  let active=true;
  if(!supabase){setChecking(false);return}
  void supabase.auth.getSession().then(({data})=>{if(active){setUser(data.session?.user||null);if(data.session?.user)setDemo(false);setChecking(false)}}).catch(()=>{if(active)setChecking(false)});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(active){setUser(session?.user||null);if(session?.user)setDemo(false);setChecking(false)}});
  return()=>{active=false;data.subscription.unsubscribe()};
 },[]);
 useEffect(()=>{
  let active=true;
  if(demo){setRecords(mockRecords());setTrashedProcesses([]);setJobs([]);setEvents([]);setExceptions([]);return}
  if(!user){setRecords([]);setTrashedProcesses([]);setJobs([]);setEvents([]);setExceptions([]);return}
  setBusy(true);
  void Promise.all([ops.listRecords(),ops.listJobs(),ops.listEvents(),ops.preferences(),ops.listExceptions(),cloud.listTrashed()]).then(([r,j,e,s,x,trash])=>{if(active){setRecords(r);setTrashedProcesses(trash);setJobs(j);setEvents(e);setSettings(s);setExceptions(x);setError('')}}).catch(e=>{if(active)setError('Unable to load cloud workspace: '+(e?.message||'Try Refresh.'))}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[user?.id,demo]);
 useEffect(()=>{
   if(!user){setActiveTeam('');return}
   let alive=true;
   void teamsApi.list().then(t=>{if(alive&&t.length===1&&t[0].role!=='viewer')setActiveTeam(t[0].team_id)}).catch(()=>{});
   return()=>{alive=false};
 },[user?.id]);
 const results=useMemo(()=>records.filter(r=>[r.process,r.party,r.so,r.invoice,r.transporter,r.lr,r.stage,r.status].some(v=>includes(v,search))),[records,search]);
 const stats=useMemo(()=>({total:records.length,complete:records.filter(r=>String(r.stage||'').toLowerCase()==='complete').length,pending:records.filter(r=>missingDocs(r).length>0).length,exceptions:new Set([...records.filter(isException).map(r=>r.id),...exceptions.filter(x=>x.status!=='resolved').map(x=>x.process_id)]).size}),[records,exceptions]);
 const authenticated=Boolean(user&&!demo);
 function onNotice(v:string){setNotice(v);window.setTimeout(()=>setNotice(''),7500)}
 function onGoto(v:Section){
  const next=resolveSiteRoute(v);
  setPage(next.page==='Transport Bill'?'Dashboard':next.page);
  if(next.dispatchTab)setDispatchTab(next.dispatchTab);
  if(next.submitTab)setSubmitTab(next.submitTab);
  if(next.pendingView)setPendingView(next.pendingView);
  if(next.checkTab)setCheckTab(next.checkTab);
  if(next.settingsTab)setSettingsTab(next.settingsTab);
  setSearch('');
 }
 async function refresh(){
  if(demo){setRecords(mockRecords());return}
  if(!authenticated)return;
  setBusy(true);
  try{const [r,j,e,s,x,trash]=await Promise.all([ops.listRecords(),ops.listJobs(),ops.listEvents(),ops.preferences(),ops.listExceptions(),cloud.listTrashed()]);setRecords(r);setTrashedProcesses(trash);setJobs(j);setEvents(e);setSettings(s);setExceptions(x);setError('')}
  catch(e:any){setError('Refresh failed: '+(e?.message||'Please try again.'))}
  finally{setBusy(false)}
 }
 function onNew(){setRecord({...blankProcess(),team_id:activeTeam||null});setPickFile(null);setImportIssue('');setDialog(true)}
 function onEdit(r:any){setRecord({...r});setPickFile(null);setImportIssue('');setDialog(true)}
 async function onImportFile(file?:File){
  if(!file)return;
  setBusy(true);setError('');setImportIssue('');
  try{
    const fields=await cloud.extract(file,'pickDoc');
    setRecord({...blankProcess(),team_id:activeTeam||null,...fields});
    setImportIssue(fields._reviewRecommended?('This '+(fields._readMethod==='ocr_photo'?'photo':'scanned PDF')+' required OCR'+(typeof fields._ocrConfidence==='number'?', text confidence '+Math.round(fields._ocrConfidence)+'%':'')+'. Verify all three values against the original before saving.'):'');
    onNotice('Pick Slip identified. Review Process No., Party Name and SO No. before saving.');
  }catch(e:any){
    const partial=e?.partial&&typeof e.partial==='object'?e.partial:{};
    setRecord({...blankProcess(),team_id:activeTeam||null,...partial});
    const missing=['process','party','so'].filter(key=>!String(partial[key]||'').trim());
    setImportIssue('Automatic PDF reading could not fill '+(missing.length?missing.map(k=>k==='process'?'Process No.':k==='party'?'Party Name':'SO No.').join(', '):'all fields')+'. '+(e?.message||'Review the PDF and enter the missing values.'));
    onNotice('Pick Slip needs review; any successfully extracted fields were kept.');
  }finally{
    setPickFile(file);setDialog(true);setBusy(false);
  }
 }
 async function onSave(r:any,files:Record<string,File>,transferTo?:WorkflowStage){
  const process=String(r.process||'').trim(),party=String(r.party||'').trim(),so=String(r.so||'').trim();
  const current=records.find(x=>x.id===r.id);
  const pendingEmailEdit=Boolean(r.id&&current&&!transferTo&&normalizedStage(current)==='Email to Client'&&current.status==='Pending Details');
  if(!process||(!pendingEmailEdit&&(!party||!so)))throw Error('Process No., Party Name and SO No. are required. Existing Pending Details email records may save incomplete fields without transferring.');
  if(records.some(x=>x.process===process&&x.id!==r.id))throw Error('Process No. already exists: '+process);
  if(r.id&&!current&&!demo)throw Error('Process is no longer in the current workspace. Refresh before saving.');
  if(transferTo){
   const issues=processTransferIssues({...r,stage:current?.stage||r.stage},transferTo,jobs,exceptions);
   if(issues.length)throw Error('Cannot transfer: '+issues.join('. '));
  }
  const unchangedStage=current?.stage||r.stage||'Universal Process';
  const unchangedStatus=current?.status||r.status||'Review';
  // Save fields and attachments before changing stage: failed uploads do not
  // route a partially saved process into downstream workflow.
  const base={...r,process,party,so,stage:unchangedStage,status:unchangedStatus};
  if(demo){
   saveDemo({...base,stage:transferTo||unchangedStage,status:transferTo?transferStageStatus(transferTo):unchangedStatus});
   setRecords(mockRecords());setDialog(false);setPickFile(null);
   if(transferTo)onGoto(transferTo==='Complete'||transferTo==='Delivery Proof'?'Data Store':transferTo);
   onNotice('Saved in this browser'+(transferTo?' and moved to '+transferTo:'')+'. Uploaded document files were NOT stored.');
   return;
  }
  const saved=await ops.save({...base,team_id:r.id?r.team_id:(r.team_id||activeTeam||null)},r.id?'Process updated':'Process created');
  const failures:{kind:string;message:string}[]=[];
  for(const [kind,file] of Object.entries(files)){
   try{await cloud.upload(saved.id,kind,file)}
   catch(e:any){failures.push({kind,message:String(e?.message||'Upload failed')})}
  }
  if(failures.length){
   await refresh();
   onNotice('Process '+process+' saved, but '+failures.length+' attachment(s) failed. Transfer has NOT been performed; retry missing files.');
   return {saved,failed:failures.map(f=>f.kind),details:failures.map(f=>f.kind+': '+f.message).join('; ')};
  }
  if(transferTo){
   try{
    await ops.stage(saved,transferTo,transferStageStatus(transferTo));
   }catch(e:any){
    await refresh();
    return {saved,failed:[],details:'',transferFailed:String(e?.message||'Stage update failed')};
   }
  }
  await refresh();
  setDialog(false);setPickFile(null);
  if(transferTo){
   onGoto(transferTo==='Complete'||transferTo==='Delivery Proof'?'Data Store':transferTo);
   onNotice('Process '+process+' transferred to '+transferTo+'. All original documents are preserved. No bill, email or tracking automation was started.');
  }else{
   onNotice('Process '+process+' saved. '+Object.keys(files).length+' attachment(s) saved successfully.');
  }
 }
 async function onDeleteProcess(r:any){
  if(!authenticated)throw Error('Sign in before deleting a process.');
  await cloud.setTrash(r);
  setDialog(false);setPickFile(null);
  await refresh();
  onNotice('Process '+r.process+' moved to Deleted Processes. Documents are preserved; restore it from Data Store.');
 }
 async function onRestoreProcess(r:any){
  if(!authenticated)return;
  setBusy(true);
  try{await cloud.setTrash(r,true);await refresh();onNotice('Process '+r.process+' restored with its documents.')}
  catch(e:any){setError(e?.message||'Unable to restore process')}
  finally{setBusy(false)}
 }
 async function onAttach(r:any,kind:string,file?:File){
  if(!file)return;
  if(!authenticated){onNotice('Document uploads require protected cloud storage. Local workspace does not retain file bytes.');return}
  setBusy(true);
  try{
   await cloud.upload(r.id,kind,file);
   await ops.audit(r,'Document uploaded',{kind,name:file.name});
   await refresh();
   onNotice('Document added to '+r.process+(kind==='emailDoc'?'. Original Outlook conversation saved for Reply All; no email addresses extracted.':'.'));
  }catch(e:any){setError(e?.message||'Could not upload file.')}
  finally{setBusy(false)}
 }
 async function onAttachDonePick(r:any,file:File,extractedProcess:string){
  if(!authenticated)throw Error('Sign in to private cloud before attaching a Done Pick List.');
  const process=String(r.process||'').trim();
  await cloud.upload(r.id,'donePickDoc',file,{verifiedProcessNo:process,extractedProcessNo:extractedProcess});
  let auditWarning=false;
  try{await ops.audit(r,'Done Pick List attached',{filename:file.name,extractedProcessNo:extractedProcess||null,verifiedProcessNo:process})}catch{auditWarning=true}
  await refresh();
  onNotice('Done Pick List photo saved under Process '+process+'.'+(auditWarning?' Audit entry could not be recorded.':''));
 }
 async function onStage(r:any,stage:string,status?:string){
  if(stage==='Complete'){
    if(exceptions.some(x=>x.process_id===r.id&&x.status!=='resolved')){setError('Resolve all open Check List cases for Process '+r.process+' before closing.');return}
    const result=canCloseProcess(r,jobs);
    if(!result.ready){setError('Cannot close Process '+r.process+': '+result.missing.join(', '));return}
  }
  if(stage==='Dispatch Tracking'&&exceptions.some(x=>x.process_id===r.id&&x.status!=='resolved')){setError('Resolve open Check List cases before returning this process to tracking.');return}
  if(demo){saveDemo({...r,stage,status:status||r.status});setRecords(mockRecords());onNotice('Stage updated in this browser only.');return}
  setBusy(true);try{await ops.stage(r,stage,status);await refresh();onNotice('Process '+r.process+' moved to '+stage)}
  catch(e:any){setError(e?.message||'Unable to update stage.')}finally{setBusy(false)}
 }
 async function onReportException(r:any,category:string,description:string){
  if(!authenticated)throw Error('Cloud login is required for exception tracking.');
  await ops.reportException(r,category,description);
  await ops.stage({...r,exceptionReason:description},'Check List','Exception');
  await refresh();onNotice('Exception recorded for Process '+r.process+'.');
 }
 async function onResolveException(item:any,r:any,resolution:string){
  if(!authenticated)throw Error('Cloud login is required.');
  await ops.resolveException(item,r,resolution);
  const remaining=exceptions.filter(x=>x.process_id===r.id&&x.id!==item.id&&x.status!=='resolved');
  if(!remaining.length){await ops.save({...r,exceptionReason:''},'Exception reason cleared after resolution');}
  await refresh();onNotice('Resolution saved. Process stage is unchanged until you explicitly move it.');
 }
 async function onConfirmEmailSent(r:any){
  if(!authenticated){setError('Sign in before confirming a real Outlook dispatch.');return}
  if(String(r.stage||'').trim()!=='Email to Client'){setError('Process is not in Email to Client; refresh before confirming.');return}
  if(!records.some(row=>row.id===r.id&&row.stage==='Email to Client')){setError('This process is no longer in the Email to Client stage. Refresh before continuing.');return}
  if(!window.confirm('Confirm that you personally checked the Reply All recipients, attachments and dispatch details, and SENT this reply from Outlook. This is a manual confirmation, not automatic verification. Move to tracking?'))return;
  setBusy(true);
  try{
   await ops.audit(r,'Manual Outlook Reply All sent confirmed by operator',{method:'manual_confirmation',process:r.process,operator_confirmed_at:new Date().toISOString(),automation_used:false,automatic_sent_verification:false});
   await ops.stage(r,'Dispatch Tracking','Pending');
   await refresh();onNotice('Manual sent confirmation recorded. Process moved to Dispatch Tracking.');
  }catch(e:any){setError(e?.message||'Unable to record manual sent confirmation.')}
  finally{setBusy(false)}
 }
 async function onMarkManualSubmit(record:any,category:SubmitTab,reference:string){
  if(!authenticated||demo)throw Error('Sign in to record a manual DataDoc submission.');
  if(!/^[0-9]{5,9}$/.test(String(record.process||'')))throw Error('Valid Process No. is required.');
  if(!reference.trim()||reference.trim().length>120)throw Error('Enter a DataDoc transaction reference (up to 120 characters).');
  const latest=await cloud.findByProcess(String(record.process));
  if(!latest||latest.id!==record.id||latest.owner_id!==user?.id||latest.team_id)
   throw Error('The personal process was moved or is not owned by your login. Refresh.');
  if(creditCategory(latest.credit)==='Unknown')throw Error('Choose Credit or Non-credit before recording DataDoc work.');
  if(!submitRecords([latest],category).length)
   throw Error('Process stage changed. Open the correct DataDoc Submit register and review again.');
  const blockers=missingSubmissionRequirements(latest,category);
  if(blockers.length)throw Error('Complete these details first: '+blockers.join(', '));
  const field=manualSubmitFields[category], refKey=field.replace(/At$/,'Reference');
  if(latest[field])throw Error('Manual DataDoc submission is already recorded for this category. Do not duplicate it.');
  const now=new Date().toISOString();
  // No dispatch tracking status or stage is changed, no external portal call is made.
  const saved=await ops.save({...latest,[field]:now,[refKey]:reference.trim()},
    'Manual DataDoc '+category+' submission confirmed');
  await ops.audit(saved,'Manual DataDoc submit recorded',{
   category,reference:reference.trim(),confirmed_by_user:true,
   executed_in_datadoc_by_website:false,material_receipt_confirmed:false,
   agent_execution:false
  });
  await refresh();
  onNotice('Process '+record.process+': manual '+category+' submission recorded. No DataDoc agent ran.');
 }
 function onDraftEmail(r:any){
  void navigator.clipboard.writeText(dispatchDetailsText(r))
   .then(()=>onNotice('Dispatch details copied. Reply All in Outlook retains the original email recipients and thread.'))
   .catch(()=>setError('Clipboard unavailable; enable clipboard permissions and retry.'));
 }
 function onExport(){
  const keys=[['process','Process No.'],['so','SO No.'],['party','Party Name'],['productName','Product Name'],['sales','Sales Person'],['invoice','Invoice No.'],['transporter','Transporter'],['lr','LR'],['stage','Stage'],['status','Status']];
  const quote=(v:any)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv='\uFEFF'+keys.map(x=>quote(x[1])).join(',')+'\n'+results.map(r=>keys.map(x=>quote(r[x[0]])).join(',')).join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='PJS_OMS_'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);
 }
 async function onSignOut(){if(user&&supabase)await supabase.auth.signOut();setDemo(false);setUser(null);setRecords([]);setActiveTeam('');setPage('Dashboard');setError('')}
 if(checking)return <div className='ux-loading'><span/><b>Loading PJS Operations…</b></div>;
 if(!user&&!demo)return <UnifiedLogin onDemo={()=>{setDemo(true);setPage('Dashboard')}}/>;
 const p={records,trashedProcesses,onRestoreProcess,onDeleteProcess,results,stats,authenticated,onOpenDonePickOCR:()=>setDonePickOpen(true),jobs,events,exceptions,onReportException,onResolveException,settings,setSettings,busy,demo,userId:user?.id||'',activeTeam,onTeamSelect:setActiveTeam,onRefresh:refresh,search,setSearch,onEdit,onImport:()=>picker.current?.click(),onDonePick:()=>onGoto('Done Pick List'),onNew,onExport,onGoto,onStage,onAttach,onDraftEmail,onConfirmEmailSent,onError:setError,onNotice,dispatchTab,onDispatchTab:setDispatchTab,submitTab,onSubmitTab:setSubmitTab,
  pendingView,onPendingView:setPendingView,checkTab,onCheckTab:setCheckTab,
  settingsTab,onSettingsTab:setSettingsTab,onMarkManualSubmit};
 return <UnifiedShell page={page} onPage={onGoto} dispatchTab={dispatchTab} submitTab={submitTab} onDispatchTab={setDispatchTab} onSubmitTab={setSubmitTab} onRefresh={()=>void refresh()} onSignOut={()=>void onSignOut()} demo={demo} user={user} stats={stats} busy={busy}>
  {error&&<div className='ux-alert error' role='alert'><AlertCircle size={18}/><span>{error}</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
  {notice&&<div className='ux-alert info' role='status'><CheckCircle2 size={18}/><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  {page==='Dashboard'&&<UnifiedCorePages page='Control Tower' p={p}/>}
  {page==='DataDoc · Dispatch Process'&&<DispatchProcessPage p={p}/>}
  {page==='DataDoc · Submit Process'&&<SubmitProcessPage p={p}/>}
  {page==='Sales Register'&&<SalesRegisterPage p={p}/>}
  {(page==='Check List'||page==='Settings')&&<UnifiedStagePagesB page={page} p={p}/>}
  <input ref={picker} type='file' hidden accept='.pdf,.jpg,.jpeg,.png' onChange={e=>{void onImportFile(e.target.files?.[0]);e.target.value=''}}/>
  {donePickOpen&&<DonePickListUpload records={records} authenticated={authenticated} onClose={()=>setDonePickOpen(false)} onAttach={onAttachDonePick} onGoToDataStore={()=>{setDonePickOpen(false);onGoto('Data Store')}}/>}
  {dialog&&record&&<UnifiedDialog key={record.id||record.process||'new'} record={record} sourceFile={pickFile} importIssue={importIssue} demo={demo} userId={user?.id||''} jobs={jobs} exceptions={exceptions} onDelete={onDeleteProcess} onAttachmentChanged={refresh} onClose={()=>{setDialog(false);setPickFile(null)}} onSave={onSave}/>}
 </UnifiedShell>;
}
