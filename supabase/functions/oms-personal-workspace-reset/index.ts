import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Requires a valid signed-in user's JWT and an authorized PJS website origin.
// This route has NO scheduled deletion; it runs only after typed confirmation.
const ALLOWED_ORIGINS = new Set([
  "https://pjs-oms-independent-pjsspare098-2655.vercel.app",
]);
const MAX_PROCESSES = 1000;
const MAX_FILES = 10000;
const MAX_RECORDS = 10000;
const CONFIRM_TEXT = "DELETE ALL MY PROCESSES";
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const db = createClient(URL, SERVICE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});

type Process = {id:string;process_no:string;deleted_at:string|null};
type StoredPath = {bucket:string;path:string};
type Manifest = {
 processes:Process[];paths:StoredPath[];albums:number;
 jobs:number;cloud_jobs:number;email_requests:number;
 queued:number;running:number;
 agent_messages:number;agent_notifications:number;agent_tasks:number;
};
function json(body:unknown,status=200,origin=""){
 return new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","vary":"Origin",
  ...(ALLOWED_ORIGINS.has(origin)?{"access-control-allow-origin":origin}:{}),
  "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
  "access-control-allow-methods":"POST,OPTIONS"
 }});
}
function required<T>(result:{data:T|null;error:unknown},name:string):T{
 if(result.error)throw new Error(name+" could not be verified; no further deletion performed");
 return result.data as T;
}
function batches<T>(items:T[],size=80):T[][]{
 const result:T[][]=[];
 for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size));
 return result;
}
async function countForOwner(table:string,field:string,userId:string):Promise<number>{
 const {count,error}=await db.from(table).select("*",{head:true,count:"exact"}).eq(field,userId);
 if(error||count===null)throw new Error(table+" ownership preview failed");
 return count;
}
async function getManifest(owner:string):Promise<Manifest>{
 const processes=required((await db.from("oms_processes")
  .select("id,process_no,deleted_at").eq("user_id",owner).is("team_id",null)
  .order("id").limit(MAX_PROCESSES+1)) as any,"Process inventory") as Process[];
 if(processes.length>MAX_PROCESSES)throw new Error("Too many personal processes for a single reset; contact administrator");
 const ids=processes.map(p=>p.id);
 let jobs=0,cloud_jobs=0,email_requests=0,queued=0,running=0;
 const docs:{path:string;user_id:string}[]=[];
 // Fetch process-bound records in small chunks without a global table scan.
 for(const ids80 of batches(ids)){
  const rows=required((await db.from("oms_documents").select("path,user_id")
   .eq("user_id",owner).in("process_id",ids80).limit(MAX_RECORDS+1)) as any,"Documents") as typeof docs;
  docs.push(...rows);
  if(docs.length>MAX_FILES)throw new Error("Too many documents for a single reset");
  for(const [table,userField] of [["oms_jobs","user_id"],["oms_cloud_jobs","user_id"],["oms_email_send_requests","owner_id"]] as const){
   const rows=required((await db.from(table).select("status")
     .eq(userField,owner).in("process_id",ids80).limit(MAX_RECORDS+1)) as any,table) as {status:string}[];
   if(rows.length>MAX_RECORDS)throw new Error("Too many historical job rows for a single reset");
   if(table==="oms_jobs")jobs+=rows.length;
   if(table==="oms_cloud_jobs")cloud_jobs+=rows.length;
   if(table==="oms_email_send_requests")email_requests+=rows.length;
   queued+=rows.filter(x=>x.status==="queued").length;
   running+=rows.filter(x=>x.status==="running").length;
  }
 }
 if(jobs+cloud_jobs+email_requests>MAX_RECORDS)throw new Error("Too many historical jobs for a single reset");
 // Albums are user-owned independently of the current process register.
 // Include orphan albums even if their Process No. was deleted months ago.
 const albumRows=required((await db.from("oms_done_pick_albums")
  .select("id").eq("user_id",owner).limit(MAX_RECORDS+1)) as any,"Personal photo albums") as {id:string}[];
 if(albumRows.length>MAX_RECORDS)throw new Error("Too many photo albums for a single reset");
 const photos:{path:string;user_id:string}[]=[];
 for(const idBatch of batches(albumRows.map(a=>a.id))){
  const rows=required((await db.from("oms_done_pick_photos")
   .select("path,user_id").eq("user_id",owner).in("album_id",idBatch)
   .limit(MAX_RECORDS+1)) as any,"Personal photos") as typeof photos;
  photos.push(...rows);
  if(docs.length+photos.length>MAX_FILES)throw new Error("Too many files for a single reset");
 }
 const files=[
  ...docs.map(x=>({bucket:"oms-documents",path:x.path,user_id:x.user_id})),
  ...photos.map(x=>({bucket:"oms-done-pick-photos",path:x.path,user_id:x.user_id}))
 ];
 // Fail closed if any row has another user's path, malformed separator or path traversal.
 if(files.some(x=>x.user_id!==owner||!x.path.startsWith(owner+"/")||
    x.path.split("/").some(part=>!part||part==="."||part==="..")))
  throw new Error("Private storage ownership mismatch; no deletion allowed");
 const paths=[...new Map(files.map(x=>[
  x.bucket+"|"+x.path,{bucket:x.bucket,path:x.path}
 ])).values()];
 const [agent_messages,agent_notifications,agent_tasks]=await Promise.all([
  countForOwner("oms_agent_messages","user_id",owner),
  countForOwner("oms_agent_notifications","user_id",owner),
  countForOwner("oms_agent_tasks","user_id",owner)
 ]);
 return {processes,paths,albums:albumRows.length,jobs,cloud_jobs,email_requests,
  queued,running,agent_messages,agent_notifications,agent_tasks};
}

Deno.serve(async req=>{
 const origin=req.headers.get("origin")??"";
 if(req.method==="OPTIONS")return json({},200,origin);
 if(req.method!=="POST")return json({error:"POST required"},405,origin);
 if(!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,origin);
 try{
  const token=(req.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim();
  if(!token||!ANON_KEY||!SERVICE_KEY||!URL)return json({error:"Unauthorized"},401,origin);
  const client=createClient(URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await client.auth.getUser(token);
  if(authError||!user||user.is_anonymous)return json({error:"Sign in required"},401,origin);

  const body=await req.json().catch(()=>({}));
  if(!["preview","execute"].includes(body.action))return json({error:"Unknown action"},400,origin);
  const manifest=await getManifest(user.id);
  const pending=required((await db.from("oms_workspace_reset_sessions")
    .select("id").eq("user_id",user.id).eq("state","preparing")
    .maybeSingle()) as any,"Pending reset") as {id:string}|null;

  if(body.action==="preview")return json({
    scope:"personal_only",process_count:manifest.processes.length,
    trashed_count:manifest.processes.filter(x=>Boolean(x.deleted_at)).length,
    document_count:manifest.paths.filter(x=>x.bucket==="oms-documents").length,
    photo_count:manifest.paths.filter(x=>x.bucket==="oms-done-pick-photos").length,
    album_count:manifest.albums,job_count:manifest.jobs,
    cloud_job_count:manifest.cloud_jobs,email_request_count:manifest.email_requests,
    agent_message_count:manifest.agent_messages,
    agent_notification_count:manifest.agent_notifications,
    agent_task_count:manifest.agent_tasks,
    queued_count:manifest.queued,running_count:manifest.running,
    pending_cleanup:Boolean(pending),managed_backups_removed:false
  },200,origin);

  if(body.confirm!==CONFIRM_TEXT||
    !Number.isInteger(body.expected_count)||
    body.expected_count!==manifest.processes.length)
   return json({error:"Confirmation or process count mismatch. Refresh counts and try again."},409,origin);

  const hasPersonalData=manifest.processes.length>0||manifest.albums>0||
    manifest.jobs>0||manifest.cloud_jobs>0||manifest.email_requests>0||
    manifest.agent_messages>0||manifest.agent_notifications>0||manifest.agent_tasks>0;
  if(!hasPersonalData&&!pending)
   return json({error:"No personal process or agent history remains to delete."},409,origin);

  // Two-stage reset: transaction 1 cancels all job states and freezes
  // personal processes. User-owned storage is then deleted through Storage API.
  // Transaction 2 removes records and marks the reset completed.
  const session=required((await db.rpc("oms_prepare_personal_reset",{
    p_owner:user.id,p_expected_count:manifest.processes.length
  })) as any,"Reset preparation") as string;

  for(const bucket of ["oms-documents","oms-done-pick-photos"]){
   const items=manifest.paths.filter(x=>x.bucket===bucket).map(x=>x.path);
   for(const group of batches(items,100)){
    const {error}=await db.storage.from(bucket).remove(group);
    if(error)throw new Error(bucket+" file cleanup interrupted; reset remains pending. Refresh and retry.");
   }
  }

  const result=required((await db.rpc("oms_complete_personal_reset",{
   p_owner:user.id,p_session:session
  })) as any,"Reset finalization");
  return json({ok:true,result,managed_backups_removed:false},200,origin);
 }catch(e){
  const message=e instanceof Error?e.message:"Reset was interrupted";
  return json({error:message,partial_cleanup_possible:true,
   instruction:"Refresh the preview and retry. If cleanup is pending, do not assume all documents have been removed."},409,origin);
 }
});
