import {Activity,AlertTriangle,BarChart3,ChevronRight,ClipboardCheck,Cloud,Database,FileCheck2,Images,FileSpreadsheet,LayoutDashboard,LogOut,LogIn,Mail,Menu,PackageCheck,RefreshCw,Settings2,ShieldCheck,Truck,UserRound,X} from 'lucide-react';
import {type ReactNode,useEffect,useState} from 'react';
import {readSettingsV2,SETTINGS_V2_EVENT,type MobilePage} from './settingsV2Preferences';
export type Section='Control Tower'|'Data Store'|'Universal Process'|'DataDoc'|'Email to Client'|'Dispatch Tracking'|'Done Pick List'|'Check List'|'Excel & LR Finder'|'Audit & Reports'|'Settings';
const nav:{name:string;items:[Section,any][]}[]=[
 {name:'COMMAND CENTER',items:[['Control Tower',LayoutDashboard],['Data Store',Database],['Universal Process',ClipboardCheck]]},
 {name:'DISPATCH WORKFLOW',items:[['DataDoc',FileCheck2],['Email to Client',Mail],['Dispatch Tracking',Truck],['Done Pick List',Images],['Check List',AlertTriangle]]},
 {name:'INTELLIGENCE & TOOLS',items:[['Excel & LR Finder',FileSpreadsheet],['Audit & Reports',BarChart3],['Settings',Settings2]]},
];
const mobileLabels:Partial<Record<MobilePage,string>>={
 'Control Tower':'Home','Universal Process':'Processes','Data Store':'Documents',
 'Dispatch Tracking':'Tracking','Email to Client':'Email','Done Pick List':'Photos',
 'Excel & LR Finder':'Excel','Audit & Reports':'Audit'
};
export default function UnifiedShell({page,onPage,onRefresh,onSignOut,demo,user,stats,notificationCount=0,busy,children}:{page:Section;onPage:(p:Section)=>void;onRefresh:()=>void;onSignOut:()=>void;demo:boolean;user:any;stats:any;notificationCount?:number;busy:boolean;children:ReactNode}){
 const [mobile,setMobile]=useState(false);
 const [phoneNav,setPhoneNav]=useState(()=>readSettingsV2().mobileNav);
 useEffect(()=>{
  const sync=()=>setPhoneNav(readSettingsV2().mobileNav);
  window.addEventListener(SETTINGS_V2_EVENT,sync);window.addEventListener('storage',sync);
  return()=>{window.removeEventListener(SETTINGS_V2_EVENT,sync);window.removeEventListener('storage',sync)};
 },[]);
 const mobileNav=phoneNav.map(page=>({page,label:mobileLabels[page]||page,Icon:nav.flatMap(group=>group.items).find(([id])=>id===page)?.[1]||LayoutDashboard}));
 function go(p:Section){onPage(p);setMobile(false)}
 return <div className='ux-shell'><a className='ux-skip-link' href='#oms-main-content'>Skip to main content</a><aside id='oms-sidebar' aria-label='PJS Operations sections' className={'ux-sidebar '+(mobile?'mobile-open':'')}>
  <div className='ux-brand'><div className='ux-logo'>P</div><div><strong>PJS <i>Operations</i></strong><small>UNIFIED CONTROL SYSTEM</small></div><button type='button' className='ux-mobile-close' aria-label='Close menu' onClick={()=>setMobile(false)}><X size={20}/></button></div>
  <nav className='ux-side-menu'>{nav.map(g=><div className='ux-nav-group' key={g.name}><div className='ux-nav-heading'>{g.name}</div>{g.items.map(([id,Icon])=><button className={'ux-nav-btn '+(page===id?'active':'')} key={id} onClick={()=>go(id)}><Icon size={18}/><span>{id}</span>{id==='Check List'&&stats.exceptions>0&&<b>{stats.exceptions}</b>}</button>)}</div>)}</nav>
  <div className='ux-side-bottom'><div className='ux-account'><div className='ux-account-avatar'><UserRound size={17}/></div><div><b>{demo?'Local preview':user?.email?.split('@')[0]||'OMS User'}</b><small>{demo?'This browser only':'Private workspace'}</small></div><button onClick={onSignOut} title={demo?'Sign in to cloud':'Sign out'} aria-label={demo?'Sign in to cloud':'Sign out'}>{demo?<LogIn size={18}/>:<LogOut size={18}/>}</button></div></div>
 </aside>
 {mobile&&<button className='ux-mobile-scrim' onClick={()=>setMobile(false)} aria-label='Close navigation'/>}
 <main id='oms-main-content' className='ux-main'><header className='ux-topbar'><div className='ux-crumb'><button type='button' className='ux-mobile-menu' aria-label='Open menu' aria-expanded={mobile} aria-controls='oms-sidebar' onClick={()=>setMobile(true)}><Menu size={23}/></button><span>Workspace</span><ChevronRight size={15}/><strong className='ux-desktop-page-title'>{page}</strong><strong className='ux-mobile-page-title'>{page}</strong></div><div className='ux-top-actions'><span className={'ux-online '+(demo?'preview':'')}><i/>{demo?'LOCAL ONLY':'PRIVATE CLOUD'}</span><button onClick={onRefresh} disabled={busy} aria-label='Refresh'><RefreshCw size={18} className={busy?'ux-spin':''}/></button><div className='ux-top-avatar'>{demo?'D':(user?.email?.[0]||'P').toUpperCase()}</div></div></header>
 <div className='ux-content'><div className={'ux-context-strip '+(demo?'preview':'')}><ShieldCheck size={16}/>{demo?'NO LOGIN · Process fields saved in this browser only. PDF files and cloud backups are NOT saved. No agents or background automations run.':'MANUAL-ONLY WORKSPACE · Private cloud records and attachments. Agent execution is disabled.'}</div>{children}<footer className='ux-footer'><span><ShieldCheck size={15}/> PJS Operations · Independent OMS</span><span>Original PJS site unchanged · Vercel + Supabase</span></footer></div></main><nav className='ux-mobile-bottom-nav' aria-label='Mobile primary navigation'>{mobileNav.map(({page:id,label,Icon})=><button key={id} type='button' className={'ux-mobile-tab '+(page===id?'active':'')} aria-current={page===id?'page':undefined} onClick={()=>go(id)}><Icon size={22} strokeWidth={page===id?2.4:1.9}/><span>{label}</span></button>)}<button type='button' className={'ux-mobile-tab '+(!mobileNav.some(item=>item.page===page)?'active':'')} aria-label='More sections' aria-expanded={mobile} aria-controls='oms-sidebar' onClick={()=>setMobile(true)}><Menu size={22}/><span>More</span></button></nav></div>;
}
