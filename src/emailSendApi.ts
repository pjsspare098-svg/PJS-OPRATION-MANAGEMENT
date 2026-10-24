import {supabase} from './independentClient';
import type {EmailSendDocs} from './emailSend';
export type EmailSendRequest={
 id:string;owner_id:string;process_id:string;process_no:string;status:string;
 requested_at:string;error_message:string|null;result:any;worker_name:string|null;
};
export type EmailSendWorkerStatus={
 worker_name:string;status:string;last_seen_at:string;details:any;
};
export async function listEmailSendRequests():Promise<EmailSendRequest[]>{
 if(!supabase)throw Error('Sign in to view email requests');
 const {data:userInfo,error:authError}=await supabase.auth.getUser();
 if(authError||!userInfo.user)throw Error('Sign in to view email requests');
 const {data,error}=await supabase.from('oms_email_send_requests')
  .select('id,owner_id,process_id,process_no,status,requested_at,error_message,result,worker_name')
  .eq('owner_id',userInfo.user.id).order('requested_at',{ascending:false}).limit(200);
 if(error)throw error;
 return (data||[]) as EmailSendRequest[];
}
export async function getEmailSendWorkerStatus():Promise<EmailSendWorkerStatus|null>{
 if(!supabase)return null;
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth.user)return null;
 const {data,error}=await supabase.from('oms_outlook_workers')
  .select('worker_name,status,last_seen_at,details')
  .eq('owner_id',auth.user.id).maybeSingle();
 if(error)throw error;
 if(!data||data.details?.mode!=='email_send')return null; // Old draft worker is not this agent.
 return data as EmailSendWorkerStatus;
}
export function emailWorkerActive(worker:EmailSendWorkerStatus|null){
 if(!worker||worker.details?.mode!=='email_send'||worker.details?.live_enabled!==true)return false;
 const when=Date.parse(worker.last_seen_at);
 return Number.isFinite(when)&&Date.now()-when>=0&&Date.now()-when<120000&&
  ['idle','busy'].includes(worker.status);
}
export async function requestEmailSend(record:any,docs:EmailSendDocs,confirmation:string){
 if(!supabase)throw Error('Sign in before approving email send');
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth.user)throw Error('Sign in before approving email send');
 if(record.owner_id!==auth.user.id||record.team_id)throw Error('Only a personal-process owner may send');
 const {data,error}=await supabase.rpc('oms_request_email_send',{
  p_process_id:record.id,
  p_original_document_id:docs.original,
  p_invoice_document_id:docs.invoice,
  p_lr_document_id:docs.lr,
  p_confirmation:confirmation
 });
 if(error)throw error;
 if(!data||data.process_id!==record.id||data.status!=='queued')
  throw Error('Email request not confirmed by server. Refresh; do not resend blindly.');
 return data as EmailSendRequest;
}
export async function cancelEmailSend(request:EmailSendRequest){
 if(!supabase)throw Error('Sign in to cancel');
 const {data,error}=await supabase.rpc('oms_cancel_email_send',{p_request_id:request.id});
 if(error)throw error;
 if(data!==true)throw Error('Cancellation was not confirmed; refresh and check status');
}
