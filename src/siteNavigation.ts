/** Seven visible modules. Keep stage labels unchanged in Supabase.
 * Navigation aliases are for older links/buttons and do not rewrite records.
 */
export const primaryPages=[
 'Dashboard',
 'DataDoc · Dispatch Process',
 'DataDoc · Submit Process',
 'Check List',
 'Sales Register',
 'Transport Bill',
 'Settings'
] as const;
export type SitePage=typeof primaryPages[number];
export type DispatchTab='pending'|'email'|'tracking';
export type SubmitTab='bill'|'email'|'proof';
export type CheckTab='exceptions'|'done';
export type SettingsTab='preferences'|'audit';
export type PendingView='work'|'documents';

export const dispatchTabs=[
 {id:'pending',title:'Pending for Dispatch',description:'Prepare and review process records'},
 {id:'email',title:'Email to Client',description:'Compose and confirm Outlook mail manually'},
 {id:'tracking',title:'Tracking',description:'Carrier status and evidence by Process No.'}
] as const;
export const submitTabs=[
 {id:'bill',title:'Bill Submit',description:'Invoice and DataDoc bill work'},
 {id:'email',title:'Email Submit',description:'Record DataDoc email submissions'},
 {id:'proof',title:'Tracking Proof Submit',description:'Review delivery-proof screenshots'}
] as const;

export const legacyPages=[
 'Control Tower','Data Store','Universal Process','DataDoc','Email to Client',
 'Dispatch Tracking','Done Pick List','Excel & LR Finder','Audit & Reports'
] as const;
export type LegacyPage=typeof legacyPages[number];
export type SiteRoute=SitePage|LegacyPage;
export type ResolvedSiteRoute={
 page:SitePage;dispatchTab?:DispatchTab;submitTab?:SubmitTab;
 checkTab?:CheckTab;settingsTab?:SettingsTab;pendingView?:PendingView
};
export function resolveSiteRoute(target:unknown):ResolvedSiteRoute{
 switch(target){
  case 'Dashboard':case 'Control Tower':return {page:'Dashboard'};
  case 'DataDoc · Dispatch Process':return {page:'DataDoc · Dispatch Process'};
  case 'Data Store':return {page:'DataDoc · Dispatch Process',dispatchTab:'pending',pendingView:'documents'};
  case 'Universal Process':return {page:'DataDoc · Dispatch Process',dispatchTab:'pending',pendingView:'work'};
  case 'Email to Client':return {page:'DataDoc · Dispatch Process',dispatchTab:'email'};
  case 'Dispatch Tracking':return {page:'DataDoc · Dispatch Process',dispatchTab:'tracking'};
  case 'DataDoc · Submit Process':return {page:'DataDoc · Submit Process'};
  case 'DataDoc':return {page:'DataDoc · Submit Process',submitTab:'bill'};
  case 'Check List':return {page:'Check List',checkTab:'exceptions'};
  case 'Done Pick List':return {page:'Check List',checkTab:'done'};
  case 'Sales Register':return {page:'Sales Register'};
  case 'Transport Bill':case 'Excel & LR Finder':return {page:'Transport Bill'};
  case 'Settings':return {page:'Settings',settingsTab:'preferences'};
  case 'Audit & Reports':return {page:'Settings',settingsTab:'audit'};
  default:return {page:'Dashboard'};
 }
}
export function creditCategory(value:unknown):'Credit'|'Non Credit'|'Unknown'{
 const text=String(value??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
 if(text==='credit')return 'Credit';
 if(text==='noncredit'||text==='nc')return 'Non Credit';
 return 'Unknown';
}
export function pendingDispatchRecords<T extends {stage?:string}>(records:T[]):T[]{
 return records.filter(row=>['universal process','datadoc','new','intake',''].includes(String(row.stage??'').trim().toLowerCase()));
}
export function submitRecords<T extends {stage?:string;documents?:{kind:string}[]}>(records:T[],tab:SubmitTab):T[]{
 if(tab==='bill')return records.filter(row=>String(row.stage??'').trim().toLowerCase()==='datadoc');
 if(tab==='email')return records.filter(row=>['email to client','dispatch tracking','delivery proof','complete'].includes(String(row.stage??'').trim().toLowerCase()));
 return records.filter(row=>['dispatch tracking','delivery proof','complete'].includes(String(row.stage??'').trim().toLowerCase()));
}
export const manualSubmitFields={
 bill:'omsBillSubmittedAt',
 email:'omsEmailSubmittedAt',
 proof:'omsTrackingProofSubmittedAt'
} as const;
