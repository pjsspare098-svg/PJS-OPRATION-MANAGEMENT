import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const ALLOWED_ORIGINS = new Set([
  "https://pjs-oms-independent-pjsspare098-2655.vercel.app",
]);
const MAX_PROCESSES = 1000;
const MAX_FILES = 10000;
const CONFIRM_TEXT = "DELETE ALL MY PROCESSES";
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
type Process = {id:string;process_no:string;deleted_at:string|null};
type Manifest={processes:Process[]; paths:{bucket:string;path:string}[];albums:number; queued:number;running:number};

function json(body:unknown,status=200,origin=""){
  return new Response(JSON.stringify(body),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "vary":"Origin",
    ...(ALLOWED_ORIGINS.has(origin)?{"access-control-allow-origin":origin}:{}),
    "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
    "access-control-allow-methods":"POST,OPTIONS",
  }});
}
function required<T>(result:{data:T|null;error:unknown},context:string):T{
 if(result.error)throw new Error(context+" failed");
 return result.data as T;
}
function batches<T>(items:T[],max=100):T[][]{
 const result:T[][]=[];
 for(let i=0;i<items.length;i+=max)result.push(items.slice(i,i+max));
 return result;
}
async function getManifest(owner:string):Promise<Manifest>{
 const processes=required((await db.from("oms_processes")
   .select("id,process_no,deleted_at").eq("user_id",owner)
   .is("team_id",null).order("id").limit(MAX_PROCESSES+1)) as any,"Process preview") as Process[];
 if(processes.length>MAX_PROCESSES)throw new Error("Workspace exceeds the safe one-operation limit; contact administrator");
 const ids=processes.map(p=>p.id);
 const numbers=[...new Set(processes.map(p=>p.process_no))];
 if(!ids.length)return {processes,paths:[],albums:0,queued:0,running:0};
 const docRows: {path:string;user_id:string}[]=[];
 const albumRows: {id:string}[]=[];
 let queued=0,running=0;
 for(const batch of batches(ids,80)){
   const docs=required((await db.from("oms_documents").select("path,user_id").eq("user_id",owner).in("process_id",batch).limit(MAX_FILES+1)) as any,"Documents") as typeof docRows;
   docRows.push(...docs);
   for(const table of ["oms_jobs","oms_cloud_jobs"]){
     const jobs=required((await db.from(table).select("status").eq("user_id",owner).in("process_id",batch).in("status",["queued","running"]).limit(MAX_FILES+1)) as any,"Job count") as {status:string}[];
     queued+=jobs.filter(j=>j.status==="queued").length;
     running+=jobs.filter(j=>j.status==="running").length;
   }
 }
 for(const batch of batches(numbers,80)){
   const albums=required((await db.from("oms_done_pick_albums").select("id").eq("user_id",owner).in("process_no",batch).limit(MAX_FILES+1)) as any,"Albums") as typeof albumRows;
   albumRows.push(...albums);
 }
 const photoRows:{path:string;user_id:string}[]=[];
 for(const batch of batches(albumRows.map(x=>x.id),80)){
   const photos=required((await db.from("oms_done_pick_photos").select("path,user_id").eq("user_id",owner).in("album_id",batch).limit(MAX_FILES+1)) as any,"Photo records") as typeof photoRows;
   photoRows.push(...photos);
 }
 if(docRows.length+photoRows.length>MAX_FILES)throw new Error("Too many attachments for one reset; contact administrator");
 const files=[
   ...docRows.map(x=>({bucket:"oms-documents",path:x.path,user_id:x.user_id})),
   ...photoRows.map(x=>({bucket:"oms-done-pick-photos",path:x.path,user_id:x.user_id}))
 ];
 if(files.some(x=>x.user_id!==owner||!x.path.startsWith(owner+"/")||x.path.includes("..")))
   throw new Error("Attachment ownership path inconsistent; reset not allowed");
 const distinct=new Map(files.map(x=>[x.bucket+"|"+x.path,{bucket:x.bucket,path:x.path}]));
 return {processes,paths:[...distinct.values()],albums:albumRows.length,queued,running};
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")??"";
 if(req.method==="OPTIONS")return json({},200,origin);
 if(req.method!=="POST")return json({error:"POST required"},405,origin);
 // No unauthenticated website or cross-origin browser may call the service-role-backed route.
 if(!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,origin);
 try{
   const token=(req.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim();
   if(!token||!ANON_KEY||!SERVICE_KEY||!URL) return json({error:"Unauthorized"},401,origin);
   const client=createClient(URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:{user},error:authError}=await client.auth.getUser(token);
   if(authError||!user||user.is_anonymous) return json({error:"Sign in required"},401,origin);
   const body=await req.json().catch(()=>({}));
   if(!["preview","execute"].includes(body.action))return json({error:"Unknown action"},400,origin);
   const manifest=await getManifest(user.id);
   if(body.action==="preview"){
     const pending=required((await db.from("oms_workspace_reset_sessions")
       .select("id").eq("user_id",user.id).eq("state","preparing").maybeSingle()) as any,"Pending cleanup") as {id:string}|null;
     return json({scope:"personal_only",process_count:manifest.processes.length,
       trashed_count:manifest.processes.filter(x=>Boolean(x.deleted_at)).length,
       document_count:manifest.paths.filter(x=>x.bucket==="oms-documents").length,
       photo_count:manifest.paths.filter(x=>x.bucket==="oms-done-pick-photos").length,
       album_count:manifest.albums,queued_count:manifest.queued,running_count:manifest.running,
       pending_cleanup:Boolean(pending), managed_backups_removed:false},200,origin);
   }
   if(body.confirm!==CONFIRM_TEXT||body.expected_count!==manifest.processes.length)
     return json({error:"Confirmation or preview count mismatch. Refresh before proceeding."},409,origin);
   if(manifest.running) return json({error:"Running jobs exist. Wait for completion before deleting."},409,origin);
   if(!manifest.processes.length) return json({error:"No personal processes to delete."},409,origin);
   const session=required((await db.rpc("oms_prepare_personal_reset",{
      p_owner:user.id,p_expected_count:manifest.processes.length
   })) as any,"Reset preparation") as string;
   // Once prepared, all requests are cancelled and process records are hidden
   // from both website and agent claim RPC. Storage delete uses official API,
   // never direct SQL storage.objects deletion.
   for(const bucket of ["oms-documents","oms-done-pick-photos"]){
     const paths=manifest.paths.filter(x=>x.bucket===bucket).map(x=>x.path);
     for(const group of batches(paths,100)){
       const {error}=await db.storage.from(bucket).remove(group);
       if(error)throw new Error(bucket+" storage cleanup interrupted; retry the same confirmed reset to finish");
     }
   }
   const result=required((await db.rpc("oms_complete_personal_reset",{p_owner:user.id,p_session:session})) as any,"Reset finalization");
   return json({ok:true,result,managed_backups_removed:false},200,origin);
 }catch(e){
   const message=e instanceof Error?e.message:"Reset interrupted";
   return json({error:message,partial_cleanup_possible:true,
     instruction:"Refresh the preview and retry if a pending cleanup is shown. Never assume deletion completed."},409,origin);
 }
});
