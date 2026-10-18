import {useEffect,useState} from 'react';
import {CheckCircle2,LayoutDashboard,MonitorSmartphone,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {
 readSettingsV2,saveSettingsV2,defaultSettingsV2,SETTINGS_V2_EVENT,
 mobileChoices,dashboardChoices,type MobilePage,type DashboardCard,type LocalSettingsV2
} from './settingsV2Preferences';

type Panel='appearance'|'mobile'|'dashboard';
const navLabel:Record<MobilePage,string>={
 'Control Tower':'Home / Control Tower','Universal Process':'Universal Process',
 'Data Store':'Documents / Data Store','Dispatch Tracking':'Dispatch Tracking',
 'DataDoc':'DataDoc','Email to Client':'Email to Client','Done Pick List':'Done Pick List',
 'Check List':'Check List','Excel & LR Finder':'Excel & LR Finder',
 'AI Command Center':'AI Command Center','Audit & Reports':'Audit & Reports','Settings':'Settings'
};
const cardLabel:Record<DashboardCard,string>={
 total:'Total processes',workflow:'In workflow',attention:'Needs attention',completed:'Completed'
};
export default function SettingsPersonalization({section}:{section:Panel}){
 const [prefs,setPrefs]=useState<LocalSettingsV2>(readSettingsV2);
 useEffect(()=>{
  const sync=()=>setPrefs(readSettingsV2());
  window.addEventListener(SETTINGS_V2_EVENT,sync);window.addEventListener('storage',sync);
  return()=>{window.removeEventListener(SETTINGS_V2_EVENT,sync);window.removeEventListener('storage',sync)};
 },[]);
 function update(patch:Partial<LocalSettingsV2>){setPrefs(saveSettingsV2({...prefs,...patch}));}
 function selectNav(index:number,chosen:MobilePage){
  const updated=[...prefs.mobileNav];
  const previous=updated.indexOf(chosen);
  if(previous>=0){updated[previous]=updated[index];}
  updated[index]=chosen;
  update({mobileNav:updated});
 }
 function toggleCard(card:DashboardCard){
  const exists=prefs.dashboardCards.includes(card);
  if(exists&&prefs.dashboardCards.length===1)return;
  const cards=exists?prefs.dashboardCards.filter(id=>id!==card):
   dashboardChoices.filter(id=>id===card||prefs.dashboardCards.includes(id));
  update({dashboardCards:cards});
 }
 if(section==='appearance')return <section className='sc-card'>
  <div className='sc-section-head'><div><h2>Readability and accessibility</h2><p>Saved on this device. Changes take effect immediately across the OMS interface without changing cloud records.</p></div><span className='sc-chip'>ACTIVE LOCAL SETTINGS</span></div>
  <div className='sv2-content'>
   <fieldset className='sv2-fieldset'><legend>Text size</legend><div className='sv2-segments'>
    {(['normal','large','extra'] as const).map(value=><button type='button' key={value} aria-pressed={prefs.fontSize===value} className={prefs.fontSize===value?'selected':''} onClick={()=>update({fontSize:value})}>{value==='extra'?'Extra large':value==='large'?'Large':'Normal'}</button>)}
   </div></fieldset>
   <label className='sv2-toggle'><span><strong>High contrast</strong><small>Stronger borders and text contrast for easier reading.</small></span><input type='checkbox' checked={prefs.highContrast} onChange={e=>update({highContrast:e.target.checked})}/></label>
   <label className='sv2-toggle'><span><strong>Reduce animations</strong><small>Minimize nonessential movement across pages.</small></span><input type='checkbox' checked={prefs.reduceMotion} onChange={e=>update({reduceMotion:e.target.checked})}/></label>
   <div className='sv2-actions'><button type='button' onClick={()=>update({fontSize:defaultSettingsV2.fontSize,highContrast:false,reduceMotion:false})}><RotateCcw size={15}/> Reset readability</button></div>
  </div>
 </section>;
 if(section==='mobile')return <>
  <section className='sc-card'>
   <div className='sc-section-head'><div><h2>Android bottom navigation</h2><p>Choose which four workflow pages appear along the bottom of your phone. The More menu always gives access to every page.</p></div><span className='sc-chip'>ACTIVE LOCAL SETTING</span></div>
   <div className='sv2-content'>
    <p className='sv2-explainer'><MonitorSmartphone size={18}/> This affects only mobile screens, not desktop navigation. Selecting an already-used page swaps its position to avoid duplicates.</p>
    <div className='sv2-nav-preview' aria-label='Current mobile navigation preview'>
     {prefs.mobileNav.map((page,index)=><div key={index}><span>{index+1}</span><strong>{navLabel[page]}</strong></div>)}<div><span>+</span><strong>More</strong></div>
    </div>
    <div className='sv2-nav-fields'>
     {prefs.mobileNav.map((page,index)=><label key={index}>Position {index+1}
       <select value={page} onChange={e=>selectNav(index,e.target.value as MobilePage)}>{mobileChoices.map(option=><option key={option} value={option}>{navLabel[option]}</option>)}</select>
      </label>)}
    </div>
    <div className='sv2-actions'><button type='button' onClick={()=>update({mobileNav:[...defaultSettingsV2.mobileNav]})}><RotateCcw size={15}/> Restore default navigation</button></div>
   </div>
  </section>
  <section className='sc-card'><div className='sc-section-head'><div><h2>Mobile shortcuts and gestures</h2><p>Additional improvements that need device testing and dedicated implementation.</p></div><span className='sc-chip'>PLANNED</span></div><div className='sv2-planned'>Swipe between workflow pages, offline photo queue, and configurable camera shortcut are not connected yet.</div></section>
 </>;
 return <>
  <section className='sc-card'>
   <div className='sc-section-head'><div><h2>Control Tower cards</h2><p>Show only the overview metrics you want. This does not modify the underlying process counts or records.</p></div><span className='sc-chip'>ACTIVE LOCAL SETTING</span></div>
   <div className='sv2-content'>
    <div className='sv2-check-grid'>{dashboardChoices.map(card=><label className='sv2-dashboard-card' key={card}><input type='checkbox' checked={prefs.dashboardCards.includes(card)} disabled={prefs.dashboardCards.length===1&&prefs.dashboardCards.includes(card)} onChange={()=>toggleCard(card)}/><LayoutDashboard size={20}/><strong>{cardLabel[card]}</strong>{prefs.dashboardCards.includes(card)&&<CheckCircle2 size={17}/>}</label>)}</div>
    <small className='sv2-help'>At least one card must remain visible. The new selection applies to Control Tower immediately.</small>
    <div className='sv2-actions'><button type='button' onClick={()=>update({dashboardCards:[...defaultSettingsV2.dashboardCards]})}><RotateCcw size={15}/> Restore all cards</button></div>
   </div>
  </section>
  <section className='sc-card'><div className='sc-section-head'><div><h2>Advanced dashboard layout</h2><p>Drag-and-drop card ordering, per-user synchronized layouts and custom data queries require additional implementation.</p></div><span className='sc-chip'>PLANNED</span></div><div className='sv2-planned'><SlidersHorizontal size={17}/> These options have not been activated.</div></section>
 </>;
}
