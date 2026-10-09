export type PickSlipFields={process:string;so:string;party:string};
export type PickSlipKey=keyof PickSlipFields;
export class PickSlipParseError extends Error{
  partial:PickSlipFields;
  constructor(message:string, partial:PickSlipFields){
    super(message);
    this.name='PickSlipParseError';
    this.partial={...partial};
  }
}
const blank=():PickSlipFields=>({process:'',so:'',party:''});
const normalize=(text:string)=>text.replace(/\u00a0/g,' ').replace(/[\u200b-\u200d]/g,'').replace(/[ \t]+/g,' ').trim();
const stopAt=/\s+(?=(?:Move\s*Order|Net\s*Weight|Total\s*Weight|Material\s*Issuer|Material\s*Issue|Job\s*Number|Pick\s*Slip\s*No\.?|Process(?:\s*Number)?|Sales\s*Order(?:\s*No\.?)?)(?:\s|:|\.|$))/i;
function cleanParty(value:string){
  return normalize(value.split(stopAt)[0]).replace(/[\s:;,-]+$/g,'').slice(0,110);
}
function count(v:PickSlipFields){return (v.process?1:0)+(v.party?1:0)+(v.so?1:0)}
/**
 * The PJS report prints "Sales Order 26270965", "Party Name ...",
 * and "Process 292487", with the words "No." and "Number" on the
 * following line in the first column. Do not require those continuations
 * before the numeric value or mistake Pick Slip No. for Sales Order No.
 */
export function parsePickSlipRows(input:string[],options:{allowPartial?:boolean}={}):PickSlipFields{
  const lines=input.map(normalize).filter(Boolean);
  const result=blank();
  const reportName=/\bSALES\s+ORDER\s+PICK\s+SLIP\s+REPORT\b/i;
  const hasHeader=reportName.test(lines.slice(0,40).join(' '))||lines.some(l=>reportName.test(l));
  function setField(key:PickSlipKey,value:string){
    if(!value)return;
    if(result[key]&&result[key].toLowerCase()!==value.toLowerCase()){
      throw new PickSlipParseError('Conflicting '+key+' values found in this PDF. Please verify the original document.',result);
    }
    result[key]=value;
  }
  function scan(line:string){
    const so=line.match(/\bSales\s*Order(?:\s*(?:No\.?|Number))?\s*[:#.-]?\s*(\d{7,12})\b/i);
    const process=line.match(/\bProcess(?:\s*(?:No\.?|Number))?\s*[:#.-]?\s*(\d{5,9})\b/i);
    const party=line.match(/\bParty\s*Name\s*[:#.-]?\s*([A-Za-z][\s\S]{2,140})/i);
    // Do not accept numbers from the separate Pick Slip No., Invoice or SO Type fields.
    if(so)setField('so',so[1]);
    if(process)setField('process',process[1]);
    if(party){
      const value=cleanParty(party[1]);
      if(value.length>=3)setField('party',value);
    }
  }
  // Extract labelled fields from visual rows first; this is most reliable.
  for(const line of lines)scan(line);
  // If a PDF text engine split a label/value across adjacent baselines,
  // add small windows only for missing fields to avoid contaminating complete values.
  if(count(result)<3){
    for(let i=0;i<lines.length-1;i++){
      if(!/\b(?:Sales\s*Order|Party\s*Name|Process)\b/i.test(lines[i]))continue;
      if(!/^.{0,85}$/.test(lines[i]))continue;
      if(/\b(?:Lin(?:e)?\s*Task|Item\s+Description|Material\s+Not\s+in\s+Stock)\b/i.test(lines[i+1]))continue;
      const before={...result};
      try{scan(lines[i]+' '+lines[i+1])}catch(e){if(e instanceof PickSlipParseError){Object.assign(result,before);continue}throw e}
    }
  }
  if(!hasHeader&&count(result)<3){
    if(options.allowPartial)return result;
    throw new PickSlipParseError('This file does not have a recognizable Sales Order Pick Slip header.',result);
  }
  if(count(result)<3&&!options.allowPartial){
    const missing=(['process','party','so'] as const).filter(k=>!result[k]).join(', ');
    throw new PickSlipParseError('Could not read '+missing+' from the Pick Slip. Check the PDF or enter the missing fields.',result);
  }
  return result;
}
