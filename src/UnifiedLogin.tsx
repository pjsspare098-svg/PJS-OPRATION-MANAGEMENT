import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,LockKeyhole,ShieldCheck,AlertCircle,LayoutDashboard,Sparkles,Eye,EyeOff,ExternalLink} from 'lucide-react';
import {supabase} from './independentClient';
import './login-help.css';

const PROVIDER_URL='https://supabase.com/dashboard/project/tbkytdktututiyeoqkwa/auth/providers';
export default function UnifiedLogin({onDemo}:{onDemo:()=>void}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState<'google'|'password'|null>(null);
  const [message,setMessage]=useState('');
  const [needsSetup,setNeedsSetup]=useState(false);
  useEffect(()=>{
    const url=new URL(window.location.href);
    const error=url.searchParams.get('error_description')||url.searchParams.get('error')||'';
    if(!error)return;
    const setup=/provider|disabled|unsupported|not enabled|configuration/i.test(error);
    setNeedsSetup(setup);
    setMessage(setup?'Google sign-in needs to be enabled once in the independent Supabase project. See administrator settings below.':'Google sign-in could not finish: '+error);
    url.searchParams.delete('error');url.searchParams.delete('error_description');
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  },[]);
  async function google(){
    if(!supabase){setMessage('Cloud is not configured.');return}
    setBusy('google');setMessage('');setNeedsSetup(false);
    try{
      const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+'/',queryParams:{prompt:'select_account'}}});
      if(error)throw error;
    }catch(e:any){
      const raw=String(e?.message||'');
      const setup=/provider|unsupported|not enabled|disabled|configuration/i.test(raw);
      setNeedsSetup(setup);
      setMessage(setup?'Google Sign-In needs its one-time setup in Supabase Authentication → Providers. Enable Google and configure its OAuth client.':raw||'Google Sign-In could not start.');
    }finally{setBusy(null)}
  }
  async function passwordLogin(){
    if(!supabase){setMessage('Cloud is not configured.');return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||!password){setMessage('Enter your existing OMS email and password.');return}
    setBusy('password');setMessage('');setNeedsSetup(false);
    try{
      const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
      if(error)throw error;
    }catch(e:any){
      const m=String(e?.message||'');
      setMessage(/invalid login credentials/i.test(m)?'These credentials were not accepted. Use a pre-existing password account or Google Sign-In once configured.':/email not confirmed/i.test(m)?'This account is not confirmed. Use Google Sign-In instead of email approval.':m||'Sign-in failed.');
    }finally{setBusy(null)}
  }
  return <div className='ux-auth'>
    <div className='ux-auth-brand'><div className='ux-biglogo'>P</div><div><strong>PJS <i>Operations</i></strong><small>THE UNIFIED CONTROL SYSTEM</small></div></div>
    <div className='ux-auth-left'><div className='ux-kicker'><Sparkles size={16}/> ALL OPERATIONS. ONE WORKSPACE.</div><h1>From Pick Slip to <em>delivery proof.</em></h1><p>A private cloud workspace for PJS dispatch, DataDoc, client communication, transporter tracking, original documents, and Done Pick List photos.</p><div className='ux-features'><span><CheckCircle2 size={17}/> Cloud process records</span><span><CheckCircle2 size={17}/> Private document storage</span><span><CheckCircle2 size={17}/> Photo OCR matching</span><span><CheckCircle2 size={17}/> Audit and exceptions</span></div></div>
    <div className='ux-auth-right'><div className='ux-login-card'>
      <div className='ux-lock'><LockKeyhole size={23}/></div>
      <div className='ux-kicker dark'>PRIVATE CLOUD LOGIN</div>
      <h2>Welcome to PJS Operations</h2>
      <p>Use your Google account or an existing OMS password. <strong>No email approval links or waiting timers.</strong></p>
      <button type='button' className='ux-google-login' onClick={()=>void google()} disabled={busy!==null}><b>G</b>{busy==='google'?'Connecting to Google…':'Continue with Google'} <ArrowRight size={17}/></button>
      <div className='ux-divider'>OR EXISTING ACCOUNT</div>
      <form onSubmit={e=>{e.preventDefault();void passwordLogin()}}>
        <label className='ux-field'>Email address<input type='email' value={email} autoComplete='username' placeholder='name@company.com' onChange={e=>setEmail(e.target.value)}/></label>
        <label className='ux-field ux-pw-label'>Password<span className='ux-password-input'><input type={showPassword?'text':'password'} value={password} autoComplete='current-password' onChange={e=>setPassword(e.target.value)} placeholder='Your existing password'/><button type='button' aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>
        <button className='ux-primary ux-full' type='submit' disabled={busy!==null}>{busy==='password'?'Signing in…':'Sign in securely'} <ArrowRight size={17}/></button>
      </form>
      {message&&<div className='ux-auth-error' role='alert'><AlertCircle size={16}/><span>{message}</span></div>}
      {needsSetup&&<div className='ux-auth-setup'><strong>Administrator: enable Google Sign-In once</strong><p>In the independent Supabase project, enable Google as an Auth provider and register its Google OAuth client. This is separate from Gmail SMTP.</p><a href={PROVIDER_URL} target='_blank' rel='noopener noreferrer'>Open Google provider settings <ExternalLink size={14}/></a></div>}
      <div className='ux-divider'>OR</div>
      <button type='button' className='ux-demo-btn' onClick={onDemo}><LayoutDashboard size={16}/> Browse local-only workspace <ArrowRight size={16}/></button>
      <div className='ux-auth-foot'><ShieldCheck size={15}/> Cloud data is private to your authenticated account. The local workspace cannot upload or share documents.</div>
    </div></div>
  </div>;
}
