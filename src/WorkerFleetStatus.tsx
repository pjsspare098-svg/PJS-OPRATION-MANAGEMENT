import {useCallback,useEffect,useState} from 'react';
import {Activity,Clock3,RefreshCw} from 'lucide-react';
import {supabase} from './independentClient';

type Worker={status:string;last_seen_at:string;worker_name:string;machine_name?:string};
const alive=(worker:Worker|null,now:number)=>Boolean(worker&&Number.isFinite(Date.parse(worker.last_seen_at))&&now-Date.parse(worker.last_seen_at)>=0&&now-Date.parse(worker.last_seen_at)<120000);
export default function WorkerFleetStatus({authenticated}:{authenticated:boolean}){
 const [datadoc,setDatadoc]=useState<Worker|null>(null);
 const [checkedAt,setCheckedAt]=useState(0);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!authenticated){setDatadoc(null);return}
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw Error('Sign in required to see office worker status.');
   const {data,error:heartbeatError}=await supabase.from('oms_office_workers')
     .select('worker_name,machine_name,status,last_seen_at').eq('owner_id',user.id).maybeSingle();
   if(heartbeatError)throw heartbeatError;
   setDatadoc(data||null);setError('');
  }catch(e:any){setError(e?.message||'Worker status is unavailable');setDatadoc(null)}
  finally{setCheckedAt(Date.now())}
 },[authenticated]);
 useEffect(()=>{void refresh();const poll=window.setInterval(()=>void refresh(),30000);return()=>window.clearInterval(poll)},[refresh]);
 const state=(worker:Worker|null)=>{
  if(!alive(worker,checkedAt))return {label:'Offline',color:'orange',detail:'No recent heartbeat from an office PC'};
  if(worker?.status==='paused')return {label:'Paused',color:'orange',detail:'Connected but live execution disabled'};
  if(worker?.status==='idle'||worker?.status==='ready'||worker?.status==='busy')return {label:worker.status==='busy'?'Busy':'Online',color:'green',detail:worker.worker_name+' · '+(worker.machine_name||'office PC')};
  return {label:'Attention',color:'orange',detail:worker?.status||'Unrecognized worker state'};
 };
 const rows=[
  {key:'DataDoc',name:'DataDoc Submit Worker',Icon:Activity,worker:datadoc,href:'https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/tree/main/worker'}
 ];
 return <>
  {rows.map(({key,name,Icon,worker,href})=>{const status=state(worker);return <div key={key}>
   <span className={'ux-ready-icon '+status.color}><Icon size={19}/></span>
   <div><strong>{name}</strong><small>{status.detail} · <a href={href} target='_blank' rel='noreferrer'>Setup instructions</a></small></div>
   <b className={status.color}>{status.label}</b>
  </div>})}

  <div className='ux-worker-quickstart'><small>Only DataDoc submissions use office automation. Start the DataDoc worker from the authorized PC using the <a href='https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/tree/main/worker' target='_blank' rel='noreferrer'>DataDoc worker instructions</a>. Other legacy workers should remain stopped.</small></div>
  {error&&<div className='ux-worker-error'><Clock3 size={16}/> {error} <button type='button' onClick={()=>void refresh()}><RefreshCw size={14}/> Retry</button></div>}
 </>;
}
