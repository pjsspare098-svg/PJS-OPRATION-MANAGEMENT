export type PickSlipFields={process:string;so:string;party:string};
export function parsePickSlipRows(rows:string[]):PickSlipFields {
  const result:PickSlipFields={process:'',so:'',party:''};
  if(!rows.some(x=>/SALES\s+ORDER\s+PICK\s+SLIP\s+REPORT/i.test(x)))throw Error('Not a Sales Order Pick Slip Report');
  for(const row of rows){
    const t=row.replace(/\s+/g,' ').trim();
    const so=t.match(/^Sales\s+Order(?:\s+No\.?)?\s+(\d{6,12})(?:\b|$)/i);
    const process=t.match(/^Process(?:\s+Number)?\s+(\d{5,9})(?:\b|$)/i);
    const party=t.match(/^Party\s+Name\s+(.+?)(?=\s+(?:Move\s+Order|Net\s+Weight)(?::|\s|$)|$)/i);
    for(const [key,m] of [['so',so],['process',process],['party',party]] as const){
      if(!m?.[1])continue;
      const v=m[1].trim();
      if(result[key]&&result[key].toLowerCase()!==v.toLowerCase())throw Error('Conflicting '+key+' in this PDF. Review manually.');
      result[key]=v;
    }
  }
  if(!result.process||!result.so||!result.party)throw Error('Could not confidently extract all three Pick Slip fields. Please review manually.');
  return result;
}
