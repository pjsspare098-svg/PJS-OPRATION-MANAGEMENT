/** Audit visibility is an owner-specific display preference, never deletion.
 * Jobs with queued/running status always remain visible regardless of cutoff.
 */
export type AuditScope={scope:string;hidden_before:string};
export const STALE_TRACKING_JOB_MS=15*60*1000;
export const STALE_TRACKING_HEARTBEAT_MS=5*60*1000;
const time=(value:unknown)=>{
 const n=Date.parse(String(value||''));
 return Number.isFinite(n)?n:NaN;
};
export function scopeCutoff(scopes:readonly AuditScope[],processNo:unknown):number {
 const wanted=String(processNo??'').trim();
 let cutoff=0;
 for(const item of scopes){
  if(item.scope!=='*'&&item.scope!==wanted)continue;
  const value=time(item.hidden_before);
  if(Number.isFinite(value))cutoff=Math.max(cutoff,value);
 }
 return cutoff;
}
export function auditEventVisible(event:{process_no?:string;created_at?:string},scopes:readonly AuditScope[]):boolean{
 const cutoff=scopeCutoff(scopes,event.process_no);
 const created=time(event.created_at);
 return !cutoff||!Number.isFinite(created)||created>=cutoff;
}
export function auditJobVisible(job:{process_no?:string;status?:string;updated_at?:string;created_at?:string},scopes:readonly AuditScope[]):boolean{
 if(['queued','running'].includes(String(job.status||'')))return true;
 const cutoff=scopeCutoff(scopes,job.process_no);
 const lastUpdated=time(job.updated_at||job.created_at);
 return !cutoff||!Number.isFinite(lastUpdated)||lastUpdated>=cutoff;
}
export function isStaleTrackingJob(
 job:{job_type?:string;status?:string;started_at?:string|null},
 workerLastSeen:unknown,now=Date.now()
):boolean{
 const started=time(job.started_at),seen=time(workerLastSeen);
 return job.job_type==='tracking'&&job.status==='running'
  &&Number.isFinite(started)&&Number.isFinite(seen)
  &&started<=now-STALE_TRACKING_JOB_MS
  &&seen<=now-STALE_TRACKING_HEARTBEAT_MS;
}
export function mayTrashAuditProcess(
 record:{id?:string;owner_id?:string;team_id?:string|null},jobs:readonly {process_id?:string;status?:string}[],
 userId:string
):boolean{
 return Boolean(record.id&&userId&&record.owner_id===userId&&!record.team_id
   &&!jobs.some(j=>j.process_id===record.id&&['queued','running'].includes(String(j.status))));
}
