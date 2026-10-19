/** Validates the four-column Shree Maruti spreadsheet before any cloud writes.
 * The workbook parser is separate so tests do not need the browser/ExcelJS.
 * Existing OMS processes are never overwritten by a tracking-only import.
 */
export type TrackingExcelRow={
 line:number;process:string;credit:'Credit'|'Non Credit';sales:string;lr:string;
};
export type TrackingExcelRejection={line:number;process:string;reason:string};
export type TrackingExcelPreview={
 total:number;valid:TrackingExcelRow[];rejected:TrackingExcelRejection[];
};
export const TRACKING_EXCEL_HEADERS=[
 'Process No.','Credit / Non-Credit','Sales Person Name','Tracking ID'
] as const;
export const TRACKING_EXCEL_LIMIT=500;
const aliases:Record<string,readonly string[]>={
 process:['processno','processnumber','process','processid'],
 credit:['creditnoncredit','creditnon','credittype','paymentcategory','credit'],
 sales:['salespersonname','salesperson','salesname','salesexecutive'],
 lr:['trackingid','trackingno','trackingnumber','consignmentno','consignmentnumber','docketno','docketnumber','lrno','lrnumber','lr'],
};
const value=(v:unknown)=>String(v??'').trim();
const headerKey=(v:unknown)=>value(v).toLowerCase().replace(/[^a-z0-9]/g,'');
export function normalizeTrackingCredit(valueToNormalize:unknown):'Credit'|'Non Credit'|null{
 const s=value(valueToNormalize).toLowerCase().replace(/[^a-z0-9]/g,'');
 if(s==='credit'||s==='c')return 'Credit';
 if(['noncredit','noncred','nc'].includes(s))return 'Non Credit';
 return null;
}
function locateHeaders(values:readonly unknown[]):Record<string,number>|null{
 const found:Record<string,number>={};
 for(let col=0;col<values.length;col++){
  const h=headerKey(values[col]);
  for(const [field,names] of Object.entries(aliases)){
   if(names.includes(h)&&found[field]===undefined)found[field]=col;
  }
 }
 return Object.keys(aliases).every(k=>found[k]!==undefined)?found:null;
}
export function previewShreeMarutiImport(
 rows:readonly (readonly unknown[])[],existingProcessNos:readonly string[]
):TrackingExcelPreview{
 if(!rows.length)throw Error('The spreadsheet is empty. Use the four-column template.');
 let headerRow=-1,columns:Record<string,number>|null=null;
 for(let i=0;i<Math.min(rows.length,12);i++){
  const found=locateHeaders(rows[i]||[]);
  if(found){headerRow=i;columns=found;break}
 }
 if(!columns)throw Error('Required columns: Process No., Credit / Non-Credit, Sales Person Name, Tracking ID.');
 const all=rows.slice(headerRow+1).map((cells,i)=>({line:headerRow+i+2,cells}))
  .filter(({cells})=>cells.some(cell=>value(cell)!==''));
 if(all.length>TRACKING_EXCEL_LIMIT)throw Error('Import at most '+TRACKING_EXCEL_LIMIT+' rows per Excel file.');
 const existing=new Set(existingProcessNos.map(value));
 const seen=new Set<string>();
 const valid:TrackingExcelRow[]=[],rejected:TrackingExcelRejection[]=[];
 for(const {line,cells} of all){
  const process=value(cells[columns.process]);
  const credit=normalizeTrackingCredit(cells[columns.credit]);
  const sales=value(cells[columns.sales]);
  const lr=value(cells[columns.lr]);
  let reason='';
  if(!/^\d{5,10}$/.test(process))reason='Process No. must contain 5–10 digits.';
  else if(existing.has(process))reason='Process already exists in PJS OMS; no overwrite.';
  else if(seen.has(process))reason='Duplicate Process No. in this Excel file.';
  else if(!credit)reason='Credit category must be Credit or Non Credit.';
  else if(sales.length<2||sales.length>100||/[\r\n<>]/.test(sales))reason='Enter a valid Sales Person name.';
  else if(!/^[a-z0-9][a-z0-9._/-]{3,79}$/i.test(lr))reason='Tracking ID must be 4–80 letters/numbers (.-_/ allowed). Store long IDs as text in Excel.';
  seen.add(process);
  if(reason)rejected.push({line,process,reason});
  else valid.push({line,process,credit:credit!,sales,lr});
 }
 return {total:all.length,valid,rejected};
}
