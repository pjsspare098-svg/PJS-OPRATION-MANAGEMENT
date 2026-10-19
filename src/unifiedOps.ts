import { supabase } from './independentClient';
import {normalizeCarrier} from './carrierRegistry';
import { cloud } from './cloud';
import {checkBill,checkJob,type RulePrefs} from './businessRules';
import {OUTLOOK_DRAFT_VERSION,emailDraftReadiness} from './emailWorkflow';

export type JobType='bill_submit'|'datadoc_submit'|'tracking'|'delivery_proof_submit'|'email_reply';
export type Job={id:string;process_id:string;process_no:string;job_type:JobType;status:string;progress:number;error_message:string|null;created_at:string;updated_at:string;started_at?:string|null;finished_at?:string|null;worker_name?:string|null;user_id?:string;payload:any;result:any};
export type AuditEvent={id:string;process_id:string|null;process_no:string;action:string;details:any;created_at:string};
export type Preferences={ebill_threshold:number;retrack_days:number;reminder_days:number};
export const defaults:Preferences={ebill_threshold:50000,retrack_days:3,reminder_days:10};
const DEMO_KEY='oms-unified-local-v1';
function demoData(){try{return JSON.parse(localStorage.getItem(DEMO_KEY)||'{}')}catch{return {}}}
export function showDate(value:any){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
export function missingDocs(r:any){const kinds=new Set((r.documents||[]).map((d:any)=>d.kind));const warnings:string[]=[];if(!kinds.has('pickDoc'))warnings.push('Pick Slip');if(!r.so)warnings.push('SO No.');if(!r.party)warnings.push('Party Name');return warnings}
export function readyForBill(r:any,threshold=50000){return checkBill(r,threshold).ready}
export function stageName(r:any){return r.stage||'Universal Process'}
export function isException(r:any){return /check list|exception|rto|delay|return|error|failed/i.test([r.stage,r.status,r.trackingStatus,r.exceptionReason].join(' '))}
export function mockRecords():any[]{const saved=demoData();return Array.isArray(saved.records)?saved.records:[];}
export function saveDemo(r:any){const records=mockRecords();const row={...r,id:r.id||'demo-'+Date.now()};const ix=records.findIndex(x=>x.id===row.id);if(ix>=0)records[ix]=row;else records.unshift(row);localStorage.setItem(DEMO_KEY,JSON.stringify({records}));return row}
async function currentUser(){if(!supabase)throw Error('Sign in is required');const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw Error('Sign in is required');return data.user}
export const ops={
  async listRecords(){return await cloud.list()},
  async listJobs():Promise<Job[]>{await currentUser();const {data,error}=await supabase!.from('oms_jobs').select('*').order('created_at',{ascending:false}).limit(150);if(error)throw error;return data||[]},
  async listExceptions():Promise<any[]>{
    await currentUser();
    const {data,error}=await supabase!.from('oms_exceptions').select('*').order('created_at',{ascending:false}).limit(250);
    if(error)throw error;return data||[];
  },
  async reportException(r:any,category:string,description:string){
    const u=await currentUser();
    const {data,error}=await supabase!.from('oms_exceptions').insert({
      process_id:r.id,created_by:u.id,category,description:description.trim(),status:'open'
    }).select().single();
    if(error)throw error;
    await ops.audit(r,'Exception reported',{exceptionId:data.id,category});
    return data;
  },
  async resolveException(item:any,r:any,resolution:string){
    await currentUser();
    if(resolution.trim().length<8)throw Error('Enter at least 8 characters describing the resolution');
    const {data,error}=await supabase!.from('oms_exceptions').update({
      status:'resolved',resolution:resolution.trim()
    }).eq('id',item.id).select().single();
    if(error)throw error;
    await ops.audit(r,'Exception resolved',{exceptionId:item.id,category:item.category,resolution:resolution.trim()});
    return data;
  },
  async listEvents():Promise<AuditEvent[]>{await currentUser();const {data,error}=await supabase!.from('oms_events').select('*').order('created_at',{ascending:false}).limit(160);if(error)throw error;return data||[]},

  async auditScopes():Promise<{scope:string;hidden_before:string}[]>{
    const user=await currentUser();
    const {data,error}=await supabase!.from('oms_audit_view_scopes')
      .select('scope,hidden_before').eq('user_id',user.id);
    if(error)throw error;
    return data||[];
  },
  async archiveAuditView(scope:string){
    await currentUser();
    const target=String(scope||'').trim();
    if(target!=='*'&&!/^\d{5,10}$/.test(target))throw Error('Enter an exact Process No. to clear its displayed audit history.');
    const {data,error}=await supabase!.rpc('oms_archive_audit_view',{p_scope:target});
    if(error)throw error;
    if(!data)throw Error('Audit display was not cleared. Refresh and retry.');
    return data as string;
  },
  async restoreAuditView(scope:string){
    await currentUser();
    const target=String(scope||'').trim();
    if(target!=='*'&&!/^\d{5,10}$/.test(target))throw Error('Select an exact Process No. or All processes.');
    const {data,error}=await supabase!.rpc('oms_restore_audit_view',{p_scope:target});
    if(error)throw error;
    if(data!==true)throw Error('There is no hidden audit history to restore for this scope.');
    return true;
  },
  async cancelQueuedJob(job:Job){
    await currentUser();
    if(!job.id||!job.process_no||job.status!=='queued')throw Error('Only jobs still waiting in the queue can be cancelled.');
    const {data,error}=await supabase!.rpc('oms_cancel_queued_job',{
      p_job_id:job.id,p_process_no:job.process_no
    });
    if(error)throw error;
    if(data!==true)throw Error('The job may have been claimed or already changed. Refresh first.');
    return true;
  },
  async reconcileStaleTrackingJob(job:Job,reason:string,workerStopped:boolean){
    await currentUser();
    if(job.job_type!=='tracking'||job.status!=='running')throw Error('Only stale Running carrier tracking jobs are eligible.');
    if(reason.trim().length<12||reason.trim().length>500)throw Error('Enter 12–500 characters describing the manual reconciliation.');
    if(!workerStopped)throw Error('Confirm the Windows carrier worker was stopped first.');
    const {data,error}=await supabase!.rpc('oms_reconcile_stale_tracking_job',{
      p_job_id:job.id,p_process_no:job.process_no,
      p_reason:reason.trim(),p_worker_stopped:true
    });
    if(error)throw error;
    if(data!==true)throw Error('The job changed while you reviewed it. Refresh; do not retry automatically.');
    return true;
  },

  async preferences():Promise<Preferences>{const u=await currentUser();const {data,error}=await supabase!.from('oms_preferences').select('*').eq('user_id',u.id).maybeSingle();if(error)throw error;return data?{ebill_threshold:Number(data.ebill_threshold),retrack_days:data.retrack_days,reminder_days:data.reminder_days}:defaults},
  async updatePreferences(p:Preferences){const u=await currentUser();const {error}=await supabase!.from('oms_preferences').upsert({user_id:u.id,ebill_threshold:p.ebill_threshold,retrack_days:p.retrack_days,reminder_days:p.reminder_days,updated_at:new Date().toISOString()});if(error)throw error},
  async audit(r:any,action:string,details:any={}){const u=await currentUser();const {error}=await supabase!.from('oms_events').insert({user_id:u.id,process_id:r.id||null,process_no:r.process||'',action,details});if(error)throw error},
  async save(r:any,action='Process saved'){const result=await cloud.save(r);await ops.audit(result,action,{stage:result.stage||'Universal Process'});return result},
  async stage(r:any,stage:string,status?:string){const saved=await cloud.save({...r,stage,status:status||r.status||'Pending'});await ops.audit(saved,'Moved to '+stage,{previousStage:r.stage||'Universal Process',newStage:stage});return saved},
  async queue(r:any,type:JobType,existing:Job[],prefs:RulePrefs=defaults){
    if(type==='tracking')throw Error('Automatic carrier tracking is disabled. Use Dispatch Tracking → Track → Capture to save manual tracking evidence.');
    const u=await currentUser();
    if(!r.id||!r.process)throw Error('Save this process first.');
    if(existing.some(j=>j.process_id===r.id&&j.job_type===type&&['queued','running'].includes(j.status)))throw Error('A '+type.replaceAll('_',' ')+' job is already queued for '+r.process);
    if(type==='bill_submit'&&existing.some(j=>j.process_id===r.id&&j.job_type==='bill_submit'&&j.status==='completed'))throw Error('DataDoc bill was already submitted for this process. Verify DataDoc instead of creating a duplicate.');
    if(type==='bill_submit'&&r.owner_id&&r.owner_id!==u.id)throw Error('Only the process owner can approve this DataDoc bill request.');
    if(type==='bill_submit'&&!['datadoc','datadoc bill submit'].includes(String(r.stage||'').trim().toLowerCase()))throw Error('Move the process to DataDoc before queueing a bill request.');
    if(type==='tracking'&&r.owner_id&&r.owner_id!==u.id)throw Error('Only the process owner can authorize office carrier lookups.');
    if(type==='tracking'&&String(r.stage||'').trim().toLowerCase()!=='dispatch tracking')throw Error('Move the process to Dispatch Tracking before queuing a carrier lookup.');
    if(type==='tracking'&&!normalizeCarrier(r.transporter))throw Error('Unsupported transporter. Choose Shree Maruti, VRL, ACPL, V Express, TCI Freight or ARC.');
    if(type==='email_reply'&&r.owner_id&&r.owner_id!==u.id)throw Error('The owner of this process must queue the Outlook draft. Team-wide mailbox access is not enabled yet.');
    const verification=type==='email_reply'?emailDraftReadiness(r,existing):checkJob(r,type,prefs,existing);
    if(!verification.ready&&type!=='bill_submit')throw Error('Cannot queue '+type.replaceAll('_',' ')+'. Missing: '+verification.missing.join(', '));
    const {data,error}=await supabase!.from('oms_jobs').insert({user_id:u.id,process_id:r.id,process_no:r.process,job_type:type,status:'queued',progress:0,office_execution:type==='bill_submit'?'auto_on_login':'manual',payload:{process:r.process,so:r.so||'',transporter:r.transporter||'',tracking_id:r.lr||'',stage:r.stage||'Universal Process',authorized_by:u.id,requested_at:new Date().toISOString(),...(type==='bill_submit'?{office_policy:'zip_v2',bill_package:'zip_invoice_and_available_pdfs',full_payment_verified:'Yes',needs_bill_details:!verification.ready,advisory_notes:[...verification.missing,...verification.warnings].slice(0,15)}:{}),...(type==='tracking'?{tracking_version:'carrier_track_v1',approved_for_tracking:true,read_only_carrier_lookup:true}:{}),...(type==='email_reply'?{reply_all:true,automation_version:OUTLOOK_DRAFT_VERSION,approved_for_draft:true,auto_send:false,email_document_id:r.selected_email_document_id||((r.documents||[]).filter((d:any)=>d.kind==='emailDoc').length===1?(r.documents||[]).find((d:any)=>d.kind==='emailDoc')?.id:null),dispatch_details:{party:r.party||'',process:r.process||'',so:r.so||'',product_name:r.productName||'',sales_person:r.sales||'',invoice:r.invoice||'',transporter:r.transporter||'',lr:r.lr||'',ready:r.ready||''}}:{})}}).select().single();
    if(error)throw error;
    try{await ops.audit(r,'Job queued · '+type,{jobId:data.id,worker:type==='bill_submit'?'approved_office_auto_queue':'manual_worker_pending'});}catch(e){console.warn('Job queued successfully but activity log could not be written',e)}
    return data as Job;
  },
  async approveTrackingProof(record:any,documentId:string){
    const u=await currentUser();
    if(!record?.id||record.owner_id!==u.id)throw Error('Only the process owner can approve a real DataDoc proof submission.');
    if(!documentId)throw Error('Select one saved tracking screenshot.');
    const {data,error}=await supabase!.rpc('oms_approve_datadoc_tracking_proof',{
      p_process_id:record.id,p_document_id:documentId,p_acknowledged:true
    });
    if(error)throw error;
    if(!data)throw Error('The proof request was not queued; refresh and check its status.');
    return data as string;
  },
  async cancelEmailJob(job:Job){
    const u=await currentUser();
    if(job.job_type!=='email_reply'||job.status!=='queued')throw Error('Only waiting Outlook draft requests can be cancelled');
    const {data,error}=await supabase!.rpc('oms_cancel_outlook_draft',{p_job_id:job.id});
    if(error)throw error;
    if(!data)throw Error('The request may already be running. Refresh and verify before changing it.');
    await ops.audit({id:job.process_id,process:job.process_no},'Outlook draft request cancelled',{jobId:job.id,by:u.id});
    return true;
  }
};
