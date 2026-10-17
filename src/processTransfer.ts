/** Stage transfers change only the workflow destination and display status.
 * Data Store is the cross-stage master record and is never a separate stage.
 * Queueing or sending external work requires its own deliberate action.
 */
import {canCloseProcess} from './businessRules.ts';
import {normalizedStage,workflowStages,type WorkflowStage} from './workflowStages.ts';

export const transferDestinations=workflowStages;
export const stageDisplayNames:Record<WorkflowStage,string>={
 'Universal Process':'Universal Process',
 'DataDoc':'DataDoc · Bill Submit',
 'Email to Client':'Email to Client',
 'Dispatch Tracking':'Dispatch Tracking',
 'Done Pick List':'Done Pick List',
 'Check List':'Check List · Review',
 'Delivery Proof':'Delivery Proof',
 'Complete':'Complete · Close',
};
export function transferStageStatus(stage:WorkflowStage):string{
 switch(stage){
  case 'Universal Process':return 'Review';
  case 'Email to Client':return 'Ready for Email';
  case 'Check List':return 'Needs Review';
  case 'Complete':return 'Completed';
  default:return 'Pending';
 }
}
export function processTransferIssues(record:any,to:WorkflowStage,jobs:any[]=[],exceptions:any[]=[]):string[]{
 const problems:string[]=[];
 if(!transferDestinations.includes(to))return ['Choose a valid workflow destination'];
 if(normalizedStage(record)===to)return ['Process is already in this stage'];
 if(record?.id){
  const running=jobs.filter(job=>job.process_id===record.id&&['queued','running'].includes(job.status));
  if(running.length)problems.push('Resolve active automation requests first: '+running.map(j=>String(j.job_type||'job')+' ('+j.status+')').join(', '));
 }
 if((to==='Dispatch Tracking'||to==='Complete')&&exceptions.some(e=>e.process_id===record?.id&&e.status!=='resolved'))
  problems.push('Resolve the open Check List exceptions first');
 if(to==='Complete')problems.push(...canCloseProcess(record,jobs).missing);
 return [...new Set(problems)];
}
