import {useCallback,useEffect,useState} from 'react';
import {Bell,CheckCircle2,RefreshCw} from 'lucide-react';
import {supabase} from './independentClient';
import {Button} from './UnifiedKit';
type Message={id:string;kind:string;title:string;body:string;created_at:string;read_at:string|null};
export default function SettingsNotifications({authenticated}:{authenticated:boolean}){
 const [messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!authenticated){setMessages([]);return}
  setLoading(true);
  try{
   const {data:{user},error:e}=await supabase.auth.getUser();
   if(e||!user)throw Error('Sign in to read private notifications.');
   const {data,error}=await supabase.from('oms_agent_notifications')
    .select('id,kind,title,body,created_at,read_at').eq('user_id',user.id)
    .order('created_at',{ascending:false}).limit(50);
   if(error)throw error;
   setMessages((data||[]) as Message[]);setError('');
  }catch(e:any){setError(e?.message||'Could not load notifications')}
  finally{setLoading(false)}
 },[authenticated]);
 useEffect(()=>{void refresh()},[refresh]);
 async function markRead(){
  if(!supabase||loading)return;setLoading(true);
  try{
   const ids=messages.filter(x=>!x.read_at).map(x=>x.id);
   if(!ids.length)return;
   const {error}=await supabase.from('oms_agent_notifications')
    .update({read_at:new Date().toISOString()}).in('id',ids);
   if(error)throw error;
   await refresh();
  }catch(e:any){setError(e?.message||'Could not mark notifications as read')}
  finally{setLoading(false)}
 }
 return <section className='sc-card'>
  <div className='sc-section-head'><div><h2>In-app notifications</h2>
   <p>Real notifications associated with your signed-in Supabase account.
    Delivery through email, SMS and WhatsApp is not enabled.</p>
  </div><span className='sc-chip'>{messages.filter(x=>!x.read_at).length} UNREAD</span></div>
  <div className='sc-actions'>
    <Button disabled={loading||!authenticated} onClick={()=>void refresh()}><RefreshCw size={15}/>Refresh</Button>
    <Button variant='primary' disabled={loading||!authenticated||!messages.some(x=>!x.read_at)} onClick={()=>void markRead()}>
      <CheckCircle2 size={15}/>Mark all read</Button>
  </div>
  {error&&<p className='sc-invalid' role='alert'>{error}</p>}
  <div className='sc-notification-list'>
  {messages.length===0?<div className='sc-setting-row'><Bell size={16}/> No notifications to review.</div>:
    messages.map(m=><div key={m.id} className={'sc-notification '+(!m.read_at?'sc-unread':'')}>
      <div><strong>{m.title||'PJS Operations'}</strong><small>{m.kind} · {new Date(m.created_at).toLocaleString('en-IN')}</small></div>
      <p>{m.body}</p>
    </div>)}
  </div>
 </section>;
}
