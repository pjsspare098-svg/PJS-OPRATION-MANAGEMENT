import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,LockKeyhole,Mail,ShieldCheck,AlertCircle,LayoutDashboard,Sparkles,ExternalLink} from 'lucide-react';
import {supabase} from './independentClient';

const AUTH_SETTINGS='https://supabase.com/dashboard/project/tbkytdktututiyeoqkwa/auth/smtp';
export default function UnifiedLogin({onDemo}:{onDemo:()=>void}){
 const [email,setEmail]=useState('');
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [serverLimited,setServerLimited]=useState(false);
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
 async function send(){
  if(!supabase){setMessage('Cloud authentication is not configured. Please contact your administrator.');return}
  const address=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){setMessage('Enter a valid email address.');return}
  if(busy)return;
  setBusy(true);setMessage('');setServerLimited(false);
  try{
   const {error}=await supabase.auth.signInWithOtp({email:address,options:{emailRedirectTo:window.location.origin,shouldCreateUser:true}});
   if(error)throw error;
   setSent(true);
  }catch(e:any){
   const msg=String(e?.message||'');
   const quota=/email rate limit exceeded|over_email_send_rate_limit|rate limit exceeded/i.test(msg);
   const cool=/for security purposes|after \d+ seconds|request this after/i.test(msg);
   if(quota){
    setServerLimited(true);
    setMessage('Supabase has reached its built-in email sending quota. It cannot send another approval email right now. For dependable sign-in, the project administrator must enable custom SMTP once.');
   }else if(cool||e?.status===429){
    setMessage('Supabase is limiting repeated email requests. You can try again later, or configure custom SMTP for reliable delivery.');
   }else if(/error sending magic link email|smtp|sending confirmation email|mail server|dial tcp|email service/i.test(msg)){
    setServerLimited(true);
    setMessage('Approval email could not be sent. Check Supabase SMTP settings: the Host must be the mail server (for Gmail, smtp.gmail.com), NOT the OMS website URL.');
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
   <button className='ux-primary ux-full' type='button' disabled={busy} onClick={()=>void send()}>
    {busy?'Sending email…':sent?'Resend approval link':'Send approval email'} <ArrowRight size={16}/>
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