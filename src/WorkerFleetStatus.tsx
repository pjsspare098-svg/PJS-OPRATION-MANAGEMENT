import {useCallback,useEffect,useState} from 'react';
import {Activity,Clock3,Mail,Truck,RefreshCw} from 'lucide-react';
import {supabase} from './independentClient';

type Worker={status:string;last_seen_at:string;worker_name:string;machine_name?:string};
const alive=(worker:Worker|null,now:number)=>Boolean(worker&&Number.isFinite(Date.parse(worker.last_seen_at))&&now-Date.parse(worker.last_seen_at)>=0&&now-Date.parse(worker.last_seen_at)<120000);
export default function WorkerFleetStatus({authenticated}:{authenticated:boolean}){
 const [datadoc,setDatadoc]=useState<Worker|null>(null);
 const [outlook,setOutlook]=useState<Worker|null>(null);
 const [tracking,setTracking]=useState<Worker|null>(null);
 const [checkedAt,setCheckedAt]=useState(0);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!authenticated){setDatadoc(null);setOutlook(null);setTracking(null);return}
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw Error('Sign in required to see office worker status.');
   const [a,b,c]=await Promise.all([
    supabase.from('oms_office_workers').select('worker_name,machine_name,status,last_seen_at').eq('owner_id',user.id).maybeSingle(),
    supabase.from('oms_outlook_workers').select('worker_name,machine_name,status,last_seen_at').eq('owner_id',user.id).maybeSingle(),
    supabase.from('oms_tracking_workers').select('worker_name,machine_name,status,last_seen_at').eq('owner_id',user.id).maybeSingle()
   ]);
   if(a.error||b.error||c.error)throw Error(a.error?.message||b.error?.message||c.error?.message);
   setDatadoc(a.data||null);setOutlook(b.data||null);setTracking(c.data||null);setError('');
  }catch(e:any){setError(e?.message||'Worker status is unavailable');setDatadoc(null);setOutlook(null);setTracking(null)}
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
  {key:'DataDoc',name:'DataDoc Bill Worker',Icon:Activity,worker:datadoc,href:'https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/tree/main/worker'},
  {key:'Outlook',name:'Outlook Reply All Draft Worker',Icon:Mail,worker:outlook,href:'https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/blob/main/docs/OUTLOOK_AUTOMATION_SETUP.md'},
  {key:'Tracking',name:'Carrier Tracking Worker',Icon:Truck,worker:tracking,href:'https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/blob/main/docs/DISPATCH_TRACKING_SETUP.md'}
 ];
 return <>
  {rows.map(({key,name,Icon,worker,href})=>{const status=state(worker);return <div key={key}>
   <span className={'ux-ready-icon '+status.color}><Icon size={19}/></span>
   <div><strong>{name}</strong><small>{status.detail} · <a href={href} target='_blank' rel='noreferrer'>Setup instructions</a></small></div>
   <b className={status.color}>{status.label}</b>
  </div>})}

  <div className='ux-worker-quickstart'><small>On an office PC, use the <a href='https://github.com/pjsspare098-svg/PJS-OPRATION-MANAGEMENT/blob/main/docs/ONE_CLICK_OFFICE_START.md' target='_blank' rel='noreferrer'>one-click website + worker desktop shortcut</a> to start missing agents. A normal browser tab cannot launch Windows programs.</small></div>
  {error&&<div className='ux-worker-error'><Clock3 size={16}/> {error} <button type='button' onClick={()=>void refresh()}><RefreshCw size={14}/> Retry</button></div>}
 </>;
}
