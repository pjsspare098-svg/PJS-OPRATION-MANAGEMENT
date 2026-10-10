// CSV importer intentionally does not import PDFs, credentials, completion states, or audit history.
export type ImportRow={process:string;party:string;so:string;invoice:string;transporter:string;lr:string;legacyStatus:string;line:number};
const aliases:Record<string,string[]>={
  process:['process','processno','processnumber','processid'],
  party:['party','partyname','customer','customername'],
  so:['so','sono','salesorder','salesorderno','salesordernumber'],
  invoice:['invoice','invoiceno','invoicenumber'],
  transporter:['transporter','carrier','transportname'],
  lr:['lr','lrno','docket','docketno','consignmentno'],
  legacyStatus:['status','stage','legacy status']
};
const normalize=(s:string)=>s.toLowerCase().trim().replace(/[^a-z0-9]/g,'');
export function splitCsv(text:string):string[][]{
  const rows:string[][]=[];let cells:string[]=[];let token='';let quoted=false;
  const input=text.replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){
      if(c==='"'&&input[i+1]==='"'){token+='"';i++}
      else if(c==='"'){quoted=false}
      else token+=c;
    }else if(c==='"'){if(token.trim())throw Error('Invalid CSV quoting near column '+(cells.length+1));quoted=true}
    else if(c===','){cells.push(token.trim());token=''}
    else if(c==='\r'||c==='\n'){
      if(c==='\r'&&input[i+1]==='\n')i++;
      cells.push(token.trim());token='';
      if(cells.some(Boolean))rows.push(cells);
      cells=[];
    }else token+=c;
  }
  if(quoted)throw Error('CSV ended inside a quoted field');
  cells.push(token.trim());
  if(cells.some(Boolean))rows.push(cells);
  if(rows.length>501)throw Error('Import at most 500 rows at a time');
  return rows;
}
export function previewMigration(text:string,existing:string[]=[]){
  const rows=splitCsv(text);
  if(rows.length<2)throw Error('CSV must contain a heading row and at least one process');
  const headers=rows[0].map(normalize);
  const idx=(key:string)=>headers.findIndex(h=>aliases[key].some(alias=>normalize(alias)===h));
  const indices:Record<string,number>={};
  for(const key of Object.keys(aliases))indices[key]=idx(key);
  if(['process','party','so'].some(k=>indices[k]===-1))throw Error('Missing CSV headings: Process No., Party Name and SO No. are required');
  const before=new Set(existing.map(x=>x.trim()));
  const seen=new Set<string>();
  const valid:ImportRow[]=[];const rejected:{line:number;process:string;reason:string}[]=[];
  rows.slice(1).forEach((cells,i)=>{
    const line=i+2;
    const get=(key:string)=>String(indices[key]===-1?'':cells[indices[key]]||'').trim();
    const process=get('process'),party=get('party'),so=get('so');
    let reason='';
    if(!/^\d{5,9}$/.test(process)||/^0+$/.test(process))reason='Invalid Process No.';
    else if(!party)reason='Missing Party Name';
    else if(!/^\d{6,12}$/.test(so))reason='Invalid SO No.';
    else if(before.has(process))reason='Already exists in this workspace';
    else if(seen.has(process))reason='Duplicate in this CSV';
    if(reason){rejected.push({line,process,reason});return}
    seen.add(process);
    valid.push({process,party:party.slice(0,170),so,invoice:get('invoice'),transporter:get('transporter'),lr:get('lr'),legacyStatus:get('legacyStatus'),line});
  });
  return {valid,rejected,total:rows.length-1};
}
