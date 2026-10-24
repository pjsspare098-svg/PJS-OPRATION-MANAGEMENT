/** Safe preview of email-stage Excel data, independent of ExcelJS / browser APIs.
 * New process rows need only a valid Process No.; all remaining details can be uploaded later.
 * Existing records never change stage, status, owner, source documents or workflow history.
 * All updates require an explicit preview and caller must re-check process identity at write time.
 */
import {normalizedStage} from './workflowStages.ts';

export const EMAIL_EXCEL_LIMIT=300;
export const EMAIL_EXCEL_FIELDS=[
 ['process','Process No.'],
 ['party','Party Name'],
 ['so','SO No.'],
 ['invoice','Invoice No.'],
 ['po','PO No.'],
 ['poDate','PO Date'],
 ['invoiceDate','Invoice Date'],
 ['transporter','Courier'],
 ['lr','Tracking / LR No.'],
 ['courierDate','Courier Date'],
 ['weight','Weight (Kgs)'],
 ['productName','Product Name'],
 ['sales','Sales Person'],
 ['credit','Credit / Non-Credit']
] as const;
export type EmailExcelField=(typeof EMAIL_EXCEL_FIELDS)[number][0];
export type EmailExcelData=Partial<Record<EmailExcelField,string>>;
export type EmailExcelReady={
 line:number;process:string;action:'create'|'update';data:EmailExcelData;fieldsChanged:EmailExcelField[];
};
export type EmailExcelRejected={line:number;process:string;reason:string};
export type EmailExcelPreview={
 total:number;created:EmailExcelReady[];updated:EmailExcelReady[];unchanged:number;rejected:EmailExcelRejected[];
};
const fields=EMAIL_EXCEL_FIELDS.map(([key])=>key);
const text=(v:unknown)=>String(v??'').trim();
const key=(v:unknown)=>text(v).toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<EmailExcelField,readonly string[]>={
 process:['processno','processnumber','process','processid'],
 party:['partyname','party','customername','clientname','customer','client','name'],
 so:['sono','salesorderno','salesordernumber','salesorder','so'],
 invoice:['invoiceno','invoicenumber','invoice'],
 po:['pono','ponumber','purchaseorderno','purchaseordernumber','po'],
 poDate:['podate','purchaseorderdate'],
 invoiceDate:['invoicedate','billdate'],
 transporter:['courier','couriername','transport','transporter','carrier'],
 lr:['trackinglrno','trackingid','trackingnumber','trackingno','lrno','lrnumber','docketno','docketnumber','docno','awbno','awb'],
 courierDate:['courierdate','dispatchdate','lrdate'],
 weight:['weightkgs','weightkg','boxweightkgs','boxweight','weight'],
 productName:['productname','product','description'],
 sales:['salesperson','salespersonname','salesname','salesrepresentative'],
 credit:['creditnoncredit','credittype','creditcategory']
};
const dateKeys=new Set<EmailExcelField>(['poDate','invoiceDate','courierDate']);
function dateValue(raw:string):string|null{
 const s=text(raw);
 if(!s)return '';
 let y='',m='',d='';
 const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(s);
 const indian=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
 if(iso){[,y,m,d]=iso}
 else if(indian){[,d,m,y]=indian}
 else return null;
 const dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
 if(dt.getUTCFullYear()!==Number(y)||dt.getUTCMonth()!==Number(m)-1||dt.getUTCDate()!==Number(d))return null;
 return y.padStart(4,'0')+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');
}
function mappedHeaders(cells:readonly unknown[]):Partial<Record<EmailExcelField,number>>{
 const indexes:Partial<Record<EmailExcelField,number>>={};
 for(let i=0;i<cells.length;i++){
  const label=key(cells[i]);
  for(const field of fields)if(aliases[field].includes(label)&&indexes[field]===undefined)indexes[field]=i;
 }
 return indexes;
}
function creditValue(s:string):string|null{
 if(!s)return '';
 const v=key(s);
 if(v==='credit'||v==='c')return 'Credit';
 if(['noncredit','noncred','nc'].includes(v))return 'Non Credit';
 return null;
}
function fieldError(field:EmailExcelField,value:string):string|null{
 if(!value)return null;
 if(/[\x00-\x08\x0B\x0C\x0E-\x1F<>]/.test(value))return 'Invalid characters in '+field+'.';
 if(value.length>160)return field+' exceeds 160 characters.';
 if(dateKeys.has(field)&&dateValue(value)===null)return 'Invalid '+field+' date; use YYYY-MM-DD or DD/MM/YYYY.';
 if(field==='credit'&&creditValue(value)===null)return 'Credit category must be Credit or Non Credit.';
 if(field==='weight'&&(!/^\d+(?:\.\d{1,3})?$/.test(value)||Number(value)>100000))return 'Weight must be a positive numeric value of up to 3 decimal places.';
 return null;
}
export function normalizeEmailExcelRow(input:EmailExcelData):EmailExcelData{
 const o:EmailExcelData={};
 for(const field of fields){
  const v=text(input[field]);
  if(v)o[field]=dateKeys.has(field)?dateValue(v)||v:field==='credit'?creditValue(v)||v:v;
 }
 return o;
}
export function emailExcelChanges(record:any,data:EmailExcelData):EmailExcelField[]{
 return fields.filter(f=>f!=='process'&&Boolean(data[f])&&text(record?.[f])!==text(data[f]));
}
export function mergeEmailExcelFields(record:any,data:EmailExcelData){
 const updates:any={...record};
 for(const field of fields){
  if(field!=='process'&&data[field])updates[field]=data[field];
 }
 return updates;
}
export function previewEmailExcelImport(
 rows:readonly (readonly unknown[])[], existingRecords:readonly any[], userId:string
):EmailExcelPreview{
 if(!rows.length)throw Error('Excel file is empty. Download the Email to Client template.');
 let headerRow=-1,columns:Partial<Record<EmailExcelField,number>>={};
 for(let i=0;i<Math.min(12,rows.length);i++){
  const c=mappedHeaders(rows[i]||[]);
  if(c.process!==undefined){columns=c;headerRow=i;break}
 }
 if(headerRow<0)throw Error('Required column "Process No." was not found. Use the Email to Client template.');
 const all=rows.slice(headerRow+1).map((cells,i)=>({line:headerRow+2+i,cells}))
  .filter(({cells})=>cells.some(c=>text(c)!==''));
 if(all.length>EMAIL_EXCEL_LIMIT)throw Error('Import at most '+EMAIL_EXCEL_LIMIT+' rows at a time.');
 const existing=new Map(existingRecords.map(r=>[text(r.process),r]));
 const seen=new Set<string>(),created:EmailExcelReady[]=[],updated:EmailExcelReady[]=[],rejected:EmailExcelRejected[]=[];
 let unchanged=0;
 for(const {line,cells} of all){
  const data:EmailExcelData={};
  for(const field of fields){
   const col=columns[field];
   if(col!==undefined)data[field]=text(cells[col]);
  }
  const normalized=normalizeEmailExcelRow(data);
  const process=text(normalized.process);
  let reason='';
  if(!/^\d{5,10}$/.test(process))reason='Process No. must be 5–10 digits.';
  else if(seen.has(process))reason='Duplicate Process No. inside Excel file.';
  else for(const field of fields){
   const problem=fieldError(field,data[field]||'');
   if(problem){reason=problem;break}
  }
  seen.add(process);
  const current=existing.get(process);
  if(!reason&&current){
   if(current.owner_id&&current.owner_id!==userId)reason='Process belongs to another user. Use the process owner account.';
   else if(current.team_id)reason='Shared team processes must be edited manually.';
   else if(normalizedStage(current)!=='Email to Client')reason='Process already exists in '+(current.stage||'a different stage')+'. It will not be moved.';
   else if(normalized.party&&current.party&&key(normalized.party)!==key(current.party))reason='Party Name differs from the saved process; edit the process manually.';
   else if(normalized.so&&current.so&&normalized.so!==text(current.so))reason='SO No. differs from the saved process; edit manually.';
   if(!reason){
    const changes=emailExcelChanges(current,normalized);
    if(changes.length)updated.push({line,process,action:'update',data:normalized,fieldsChanged:changes});
    else unchanged++;
   }
  }else if(!reason){
   // Import the process identity immediately. Party, SO, invoice, courier, etc.
   // are optional intake fields that the operator can upload or edit later.
   // Confirmation is still required and the record is NOT marked email-sent.
   created.push({line,process,action:'create',data:normalized,fieldsChanged:fields.filter(f=>Boolean(normalized[f]))});
  }
  if(reason)rejected.push({line,process,reason});
 }
 return {total:all.length,created,updated,unchanged,rejected};
}
