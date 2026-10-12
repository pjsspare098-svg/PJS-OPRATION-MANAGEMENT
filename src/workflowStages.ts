/** Every live dispatch process has one current workflow stage.
 * Data Store and audits deliberately remain cross-stage master views.
 */
export const workflowStages=['Universal Process','DataDoc','Email to Client','Dispatch Tracking','Done Pick List','Check List','Delivery Proof','Complete'] as const;
export type WorkflowStage=typeof workflowStages[number];
export function normalizedStage(record:any):WorkflowStage|'Other'{
 const stage=String(record?.stage??'').trim().toLowerCase().replace(/\s+/g,' ');
 if(!stage||stage==='universal process'||stage==='new'||stage==='intake')return 'Universal Process';
 if(stage==='datadoc'||stage==='data doc'||stage==='datadoc bill submit'||stage==='bill submit')return 'DataDoc';
 if(stage==='email to client'||stage==='client email')return 'Email to Client';
 if(stage==='dispatch tracking'||stage==='tracking')return 'Dispatch Tracking';
 if(stage==='done pick list')return 'Done Pick List';
 if(stage==='check list'||stage==='exception')return 'Check List';
 if(stage==='delivery proof')return 'Delivery Proof';
 if(stage==='complete'||stage==='completed')return 'Complete';
 return 'Other';
}
export function inStage(record:any,stage:WorkflowStage):boolean{
 return normalizedStage(record)===stage;
}
export function filterStage<T>(records:T[],stage:WorkflowStage):T[]{
 return records.filter(r=>inStage(r,stage));
}
