/** Presentation-only filtering. Never delete a finished job or change its automation state. */
export const ACTIVE_AUTOMATION_STATUSES = ['queued','running'] as const;
export const AUDIT_ONLY_AUTOMATION_STATUSES = ['completed','failed','cancelled'] as const;

export function isActiveAutomationJob(job:{status?:string}|null|undefined):boolean {
 return Boolean(job && ACTIVE_AUTOMATION_STATUSES.some(status=>status===job.status));
}
export function isAuditOnlyAutomationJob(job:{status?:string}|null|undefined):boolean {
 return Boolean(job && AUDIT_ONLY_AUTOMATION_STATUSES.some(status=>status===job.status));
}
export function latestProcessAutomationJob<T extends {process_id?:string;job_type?:string;created_at?:string;updated_at?:string}>(
 jobs:T[],processId:string,jobType:string
):T|undefined {
 return jobs.filter(job=>job.process_id===processId&&job.job_type===jobType)
  .sort((a,b)=>(Date.parse(b.created_at||b.updated_at||'')||0)-(Date.parse(a.created_at||a.updated_at||'')||0))[0];
}
export function hasAuditOnlyAutomationOutcome(
 jobs:Array<{process_id?:string;job_type?:string;status?:string;created_at?:string;updated_at?:string}>,
 processId:string,jobType:string
):boolean {
 return isAuditOnlyAutomationJob(latestProcessAutomationJob(jobs,processId,jobType));
}
