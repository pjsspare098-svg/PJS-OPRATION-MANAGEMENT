import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,LockKeyhole,Mail,ShieldCheck,AlertCircle,LayoutDashboard,Sparkles,Clock3,ExternalLink} from 'lucide-react';
import {supabase} from './independentClient';

const LOCK_KEY='pjs-oms-auth-email-retry-after';
const AUTH_SETTINGS='https://supabase.com/dashboard/project/tbkytdktututiyeoqkwa/auth/smtp';
const getLock=()=>{
 try{return Number(localStorage.getItem(LOCK_KEY)||0)||0}catch{return 0}
};
const putLock=(until:number)=>{
 try{localStorage.setItem(LOCK_KEY,String(until))}catch{/* storage disabled; in-memory limit still works */}
};
function formatWait(ms:number){
 const secs=Math.max(0,Math.ceil(ms/1000));
 return secs>=3600?Math.ceil(secs/60)+' minutes':secs>=60?Math.ceil(secs/60)+' minute'+(Math.ceil(secs/60)===1?'':'s'):secs+' seconds';
}
export default function UnifiedLogin({onDemo}:{onDemo:()=>void}){
 const [email,setEmail]=useState('');
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [serverLimited,setServerLimited]=useState(false);
 const [until,setUntil]=useState(()=>getLock());
 const [clock,setClock]=useState(()=>Date.now());

 useEffect(()=>{
  const t=window.setInterval(()=>{setClock(Date.now());setUntil(current=>Math.max(getLock(),current))},1000);
  return()=>window.clearInterval(t);
 },[]);
 useEffect(()=>{
  const url=new URL(window.location.href);
  const h=new URLSearchParams(url.hash.replace(/^#/,''));const p=url.searchParams;
  const error=(p.get('error_description')||h.get('error_description')||p.get('error')||h.get('error')||'').toLowerCase();
  if(error){
   setMessage(/expired|invalid|otp|token/.test(error)?'That approval link has expired or was already used. Request a new link when sending is available.':'Email approval could not be completed. Please retry using the latest message.');
   url.searchParams.delete('error');url.searchParams.delete('error_description');
   h.delete('error');h.delete('error_description');
   url.hash=h.size?'#'+h.toString():'';
   window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
 },[]);
 const wait=Math.max(0,until-clock);
 function lockFor(ms:number){const next=Date.now()+ms;setUntil(next);putLock(next);setClock(Date.now())}
 async function send(){
  if(!supabase){setMessage('Cloud authentication is not configured. Please contact your administrator.');return}
  if(wait>0){setMessage('Wait '+formatWait(wait)+' before requesting another email. Repeated requests will not bypass the sending limit.');return}
  const address=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){setMessage('Enter a valid email address.');return}
  if(busy)return;
  setBusy(true);setMessage('');setServerLimited(false);
  try{
   const {error}=await supabase.auth.signInWithOtp({email:address,options:{emailRedirectTo:window.location.origin,shouldCreateUser:true}});
   if(error)throw error;
   setSent(true);
   lockFor(90000);
  }catch(e:any){
   const msg=String(e?.message||'');
   const quota=/email rate limit exceeded|over_email_send_rate_limit|rate limit exceeded/i.test(msg);
   const cool=/for security purposes|after \d+ seconds|request this after/i.test(msg);
   if(quota){
    lockFor(3600000);
    setServerLimited(true);
    setMessage('Supabase has reached its built-in email sending quota. It cannot send another approval email right now. For dependable sign-in, the project administrator must enable custom SMTP once.');
   }else if(cool||e?.status===429){
    const match=msg.match(/after (\d+) seconds/i);
    lockFor((match?Number(match[1])+5:90)*1000);
    setMessage('Supabase is limiting repeated requests. Please wait for the countdown before trying again.');
   }else if(/not authorized|email address not authorized/i.test(msg)){
    setServerLimited(true);
    setMessage('The Supabase default sender can only email approved organization members. Configure custom SMTP for your address.');
   }else{
    setMessage(msg||'Unable to send the approval link. Please try again.');
   }
  }finally{setBusy(false)}
 }
 return <div className='ux-auth'>
  <div className='ux-auth-brand'><div className='ux-biglogo'>P</div><div><strong>PJS <i>Operations</i></strong><small>THE UNIFIED CONTROL SYSTEM</small></div></div>
  <div className='ux-auth-left'><div className='ux-kicker'><Sparkles size={16}/> ALL OPERATIONS. ONE WORKSPACE.</div><h1>From Pick Slip to <em>delivery proof.</em></h1><p>A single place for PJS dispatch, DataDoc, client communication, transporter tracking, process records and cloud documents.</p><div className='ux-features'><span><CheckCircle2 size={17}/> Unified process management</span><span><CheckCircle2 size={17}/> Private file storage</span><span><CheckCircle2 size={17}/> DataDoc & carrier queues</span><span><CheckCircle2 size={17}/> Audit and exceptions</span></div></div>
  <div className='ux-auth-right'><div className='ux-login-card'>
   <div className='ux-lock'><LockKeyhole size={23}/></div><div className='ux-kicker dark'>SECURE ACCESS</div>
   <h2>{sent?'Check your email':'Welcome back'}</h2>
   <p>{sent?'Open the newest PJS Operations sign-in email and click the approval link once. You will return here automatically.':'Enter your email and click the approval link we send. No password is needed.'}</p>
   <label className='ux-field'>Email address<input type='email' autoComplete='email' placeholder='you@example.com' value={email} disabled={sent||busy} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!sent)void send()}}/></label>
   {sent&&<div className='ux-sent'><Mail size={18}/><span>Approval link requested for <strong>{email.trim()}</strong>. Check your inbox and spam folder.</span></div>}
   <button className='ux-primary ux-full' type='button' disabled={busy||wait>0} onClick={()=>void send()}>
    {busy?'Sending email…':wait>0?<><Clock3 size={16}/> Try again in {formatWait(wait)}</>:sent?'Resend approval link':'Send approval email'} <ArrowRight size={16}/>
   </button>
   {sent&&<button className='ux-link' type='button' onClick={()=>{setSent(false);setMessage('')}}>Use a different email</button>}
   {message&&<div className='ux-auth-error' role='alert'><AlertCircle size={16}/><span>{message}</span></div>}
   {serverLimited&&<div className='ux-auth-setup'><strong>One-time administrator setup required</strong><p>Connect an email sender to Supabase Authentication → SMTP. This fixes the restrictive built-in email quota; no change to your OMS records is needed.</p><a href={AUTH_SETTINGS} target='_blank' rel='noopener noreferrer'>Open email settings <ExternalLink size={14}/></a></div>}
   <div className='ux-divider'>OR</div>
   <button className='ux-demo-btn' type='button' onClick={onDemo}><LayoutDashboard size={16}/> View design preview <ArrowRight size={16}/></button>
   <div className='ux-auth-foot'><ShieldCheck size={15}/> Real process records remain protected by Supabase email authentication. Design preview uses sample data only.</div>
  </div></div>
 </div>;
}