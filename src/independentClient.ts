import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined;
export const cloudConfigured=Boolean(url&&key);
export const supabase=cloudConfigured?createClient(url!,key!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export const auth={
  async getUser():Promise<{name:string;email:string}|null>{
    if(!supabase)return null;
    const {data,error}=await supabase.auth.getUser();
    if(error||!data.user)return null;
    return {name:data.user.user_metadata?.full_name||data.user.email||'OMS User',email:data.user.email||''};
  },
  async signIn(email=''):Promise<{pending?:boolean;user?:{name:string;email:string}}>{
    if(!supabase)return {user:{name:'OMS Local Preview',email:''}};
    if(!email.trim()||!email.includes('@'))throw Error('Enter a valid email address.');
    const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin}});
    if(error)throw error;
    return {pending:true};
  },
  async signOut(){if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error}}
};
