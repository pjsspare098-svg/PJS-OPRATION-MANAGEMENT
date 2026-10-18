/**
 * Local-only UI preferences. Never contains credentials, Supabase changes,
 * worker authorization, or workflow state.
 */
export const SETTINGS_V2_KEY='pjs_oms_local_settings_v2';
export const SETTINGS_V2_EVENT='pjs-oms-settings-v2-changed';

export const mobileChoices=[
 'Control Tower','Universal Process','Data Store','Dispatch Tracking',
 'DataDoc','Email to Client','Done Pick List','Check List',
 'Excel & LR Finder','AI Command Center','Audit & Reports','Settings'
] as const;
export type MobilePage=typeof mobileChoices[number];

export const dashboardChoices=['total','workflow','attention','completed'] as const;
export type DashboardCard=typeof dashboardChoices[number];

export type LocalSettingsV2={
 fontSize:'normal'|'large'|'extra';
 highContrast:boolean;
 reduceMotion:boolean;
 mobileNav:MobilePage[];
 dashboardCards:DashboardCard[];
};
export const defaultSettingsV2:LocalSettingsV2={
 fontSize:'normal',highContrast:false,reduceMotion:false,
 mobileNav:['Control Tower','Universal Process','Data Store','Dispatch Tracking'],
 dashboardCards:['total','workflow','attention','completed']
};
function uniqueAllowed<T extends string>(value:unknown,allowed:readonly T[]):T[]{
 if(!Array.isArray(value))return [];
 return [...new Set(value.filter((v):v is T=>typeof v==='string'&&allowed.includes(v as T)))];
}
export function normalizeSettingsV2(input:unknown):LocalSettingsV2{
 if(!input||typeof input!=='object')return {...defaultSettingsV2,mobileNav:[...defaultSettingsV2.mobileNav],dashboardCards:[...defaultSettingsV2.dashboardCards]};
 const raw=input as Record<string,unknown>;
 const nav=uniqueAllowed(raw.mobileNav,mobileChoices);
 const cards=uniqueAllowed(raw.dashboardCards,dashboardChoices);
 return {
  fontSize:raw.fontSize==='large'||raw.fontSize==='extra'?raw.fontSize:'normal',
  highContrast:raw.highContrast===true,
  reduceMotion:raw.reduceMotion===true,
  mobileNav:nav.length===4?nav:[...defaultSettingsV2.mobileNav],
  dashboardCards:cards.length>0?cards:[...defaultSettingsV2.dashboardCards]
 };
}
export function readSettingsV2():LocalSettingsV2{
 try{return normalizeSettingsV2(JSON.parse(localStorage.getItem(SETTINGS_V2_KEY)||'null'))}
 catch{return normalizeSettingsV2(null)}
}
export function saveSettingsV2(next:LocalSettingsV2):LocalSettingsV2{
 const safe=normalizeSettingsV2(next);
 try{localStorage.setItem(SETTINGS_V2_KEY,JSON.stringify(safe))}
 catch{ /* Browser may block local storage; controls still work this session. */ }
 applySettingsV2(safe);
 if(typeof window!=='undefined')window.dispatchEvent(new Event(SETTINGS_V2_EVENT));
 return safe;
}
export function applySettingsV2(prefs:LocalSettingsV2){
 if(typeof document==='undefined')return;
 const el=document.documentElement;
 el.dataset.omsFont=prefs.fontSize;
 el.dataset.omsContrast=prefs.highContrast?'on':'off';
 el.dataset.omsReduceMotion=prefs.reduceMotion?'on':'off';
}
