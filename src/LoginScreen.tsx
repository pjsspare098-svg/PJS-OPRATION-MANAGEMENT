import { useState } from 'react';
import { LockKeyhole, ArrowRight } from 'lucide-react';
import { auth, cloudConfigured } from './independentClient';
export default function LoginScreen({onLogin}:{onLogin:(name:string)=>void}) {
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function signIn() {
    setBusy(true);setMessage('');
    try {
      const result=await auth.signIn(email);
      if (result.pending) setMessage('Check your email for the secure sign-in link. After confirming, return to OMS.');
      else if(result.user)onLogin(result.user.name||result.user.email||'OMS User');
    } catch(e:any){setMessage(e?.message||'Sign-in failed. Try again.')}
    finally{setBusy(false)}
  }
  return <main className='oms-login'>
    <div className='oms-login-brand'><div className='oms-login-logo'>O</div><strong>OMS<span>.</span></strong><small>OPERATION MANAGEMENT SYSTEM</small></div>
    <section className='oms-login-card'>
      <div className='oms-login-lock'><LockKeyhole size={24}/></div>
      <h1>{cloudConfigured?'Welcome back':'Independent OMS Preview'}</h1>
      <p>{cloudConfigured?'Secure access to your independent OMS workspace.':'The new website is running independently. Connect Supabase to enable cloud records, protected file storage, and secure accounts.'}</p>
      {cloudConfigured&&<label>Email address<input type='email' required placeholder='you@company.com' autoComplete='email' value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      <button className='oms-login-submit' style={{width:'100%',marginTop:20}} disabled={busy} onClick={signIn}>{busy?'Please wait...':cloudConfigured?'Email me a secure sign-in link':'Open Local Preview'} <ArrowRight size={18}/></button>
      {!cloudConfigured&&<p style={{fontSize:11,marginTop:16}}>Local preview is not private cloud storage. Do not upload confidential business documents until setup is complete.</p>}
      {message&&<p role='alert'>{message}</p>}
    </section>
  </main>;
}