import { supabase, cloudConfigured } from './independentClient';
import { parsePickSlipRows, PickSlipParseError, type PickSlipFields } from './pickSlipReader';
import { parseDonePickProcess, type DonePickRead } from './donePickReader';
import {extractLRs} from './lrReader';
import {parseDocumentFields,expectedDocumentFields,type ScanResult} from './documentFields';
import { recognize } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
const LOCAL_KEY='oms-independent-local-preview-v1';
function demoRecords():any[]{try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]')}catch{return []}}
function storeDemo(records:any[]){localStorage.setItem(LOCAL_KEY,JSON.stringify(records))}
function validFile(file:File){if(file.size>5*1024*1024)throw Error('Max file size is 5 MB');if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)&&!(/\.eml$/i.test(file.name)&&(file.type===''||file.type==='message/rfc822'||file.type==='application/octet-stream')))throw Error('Use PDF, JPG, PNG or Outlook .eml')}
async function identity(){if(!supabase)throw Error('Independent cloud backend is not configured');const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw Error('Sign in before accessing cloud files');return data.user}
function mapped(r:any):any{const docs=(r.oms_documents||[]).map((d:any)=>({id:d.id,kind:d.kind,name:d.name,path:d.path,uploadedAt:d.created_at}));return {...(r.data||{}),id:r.id,owner_id:r.user_id,team_id:r.team_id||null,deleted_at:r.deleted_at||null,process:r.process_no,party:r.party_name||'',so:r.sales_order_no||'',documents:docs,docs:docs.length,status:r.data?.status||'Review'}}
function headerRows(items:any[]):string[]{
  const words=items.filter(i=>typeof i.str==='string'&&i.str.trim()&&Array.isArray(i.transform)).map(i=>({x:Number(i.transform[4]),y:Number(i.transform[5]),str:String(i.str).trim()})).sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows:{y:number;parts:typeof words}[]=[];
  for(const w of words){let row=rows.find(r=>Math.abs(r.y-w.y)<=2.5);if(!row){row={y:w.y,parts:[]};rows.push(row)}row.parts.push(w)}
  return rows.sort((a,b)=>b.y-a.y).map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.str).join(' ').replace(/\s+/g,' ').trim());
}
async function pdfRows(file:File){
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const rows:string[]=[];
  const rawRows:string[]=[];
  for(let i=1;i<=Math.min(pdf.numPages,6);i++){
    const page=await pdf.getPage(i);
    const contents=await page.getTextContent();
    rows.push(...headerRows(contents.items as any[]));
    // Some billing PDFs have meaningful reading order that differs from their
    // visual column coordinates. Keep both views instead of flattening only one.
    rawRows.push((contents.items as any[]).map(item=>String(item.str||'')).join(' '));
  }
  return {pdf,rows,rawRows};
}
async function pdfOcr(pdf:any):Promise<string[]>{
  const page=await pdf.getPage(1);
  const base=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:Math.min(2,2000/base.width)});
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cannot render PDF for OCR');
  await page.render({canvasContext:ctx,canvas,viewport}).promise;
  const output=await recognize(canvas,'eng');
  return output.data.text.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
}
async function ocrDonePhoto(file:File,rotation=0):Promise<{text:string;confidence:number}>{
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file)}catch{const result=await recognize(file,'eng');return {text:result.data.text,confidence:Number(result.data.confidence)}}
  try{
    const turn=Math.abs(rotation)%180===90;
    const width=turn?bitmap.height:bitmap.width;
    const height=turn?bitmap.width:bitmap.height;
    const scale=Math.min(2,2600/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));
    canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Could not read photo');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.rotate(rotation*Math.PI/180);
    ctx.filter='grayscale(1) contrast(1.5)';
    ctx.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);
    const result=await recognize(canvas,'eng');
    return {text:result.data.text,confidence:Number(result.data.confidence)};
  }finally{bitmap.close()}
}
function genericExtract(rows:string[]){
  const t=rows.join(' ');
  const get=(p:RegExp)=>t.match(p)?.[1]?.trim()||'';
  return {lr:get(/\b(?:LR|docket|consignment)\s*(?:No\.?|Number|#)?\s*[:#-]?\s*([A-Z0-9\/-]{4,30})/i),invoice:get(/\bInvoice\s*(?:No\.?|Number|#)\s*[:#-]?\s*([A-Z0-9\/-]{4,40})/i),so:get(/\bSales\s*Order\s*(?:No\.?|Number)?\s*[:#-]?\s*(\d{6,12})/i),ebill:get(/\b(?:E-?Way\s*Bill|EWB)\s*(?:No\.?|Number)?\s*[:#-]?\s*(\d{10,15})/i)};
}
export const cloud={
  async list():Promise<any[]>{
    if(!supabase)return demoRecords();
    await identity();
    const {data,error}=await supabase.from('oms_processes').select('*,oms_documents(id,kind,name,path,created_at)').is('deleted_at',null).order('created_at',{ascending:false}).limit(1000);
    if(error)throw error;
    return (data||[]).map(mapped);
  },
  async listTrashed():Promise<any[]>{
    if(!supabase)return [];
    const user=await identity();
    const {data,error}=await supabase.from('oms_processes')
      .select('*,oms_documents(id,kind,name,path,created_at)')
      .eq('user_id',user.id).not('deleted_at','is',null).order('deleted_at',{ascending:false}).limit(200);
    if(error)throw error;
    return (data||[]).map(mapped);
  },
  async setTrash(record:any,restore=false):Promise<void>{
    if(!supabase)throw Error('Deletion requires authenticated cloud storage.');
    const user=await identity();
    if(record.owner_id!==user.id||record.team_id)throw Error('Only your personal, individually owned processes can be deleted. Shared team processes cannot be deleted here.');
    const {error}=await supabase.rpc('oms_set_process_trash',{p_process:record.id,p_number:record.process,p_restore:restore});
    if(error)throw error;
  },
  async findByProcess(processNo:string):Promise<any|null>{
    const searched=processNo.trim();
    if(!searched)return null;
    if(!supabase)return demoRecords().find(r=>String(r.process).trim()===searched)||null;
    await identity();
    const {data,error}=await supabase.from('oms_processes').select('*,oms_documents(id,kind,name,path,created_at)').eq('process_no',searched).is('deleted_at',null).limit(2);
    if(error)throw error;
    if((data||[]).length>1)throw Error('More than one accessible process uses this Process No. Select the correct workspace first.');
    return data?.[0]?mapped(data[0]):null;
  },
  async save(input:any):Promise<any>{
    const process=String(input.process||'').trim();
    if(!process)throw Error('Process No. must come from the Pick Slip');
    if(!supabase){
      const rows=demoRecords();const old=rows.findIndex(x=>x.id===input.id);
      if(rows.some(x=>x.process===process&&x.id!==input.id))throw Error('Duplicate Process No.');
      const r={...input,id:input.id||crypto.randomUUID(),process,documents:input.documents||[],docs:input.docs||0,status:input.status||'Review'};
      if(old>=0)rows[old]=r;else rows.unshift(r);
      storeDemo(rows);return r;
    }
    const user=await identity();
    const body:any={process_no:process,party_name:String(input.party||'').trim(),sales_order_no:String(input.so||'').trim(),data:{...input,id:undefined,owner_id:undefined,team_id:undefined,documents:undefined,docs:undefined,process:undefined,party:undefined,so:undefined}};
    if(input.id){
      const {data,error}=await supabase.from('oms_processes').update(body).eq('id',input.id).is('deleted_at',null).select().single();
      if(error)throw error;return {...input,...mapped(data)};
    }
    const {data,error}=await supabase.from('oms_processes').insert({...body,user_id:user.id,team_id:input.team_id||null}).select().single();
    if(error)throw error;return mapped(data);
  },
  async remove(id:string){
    if(!supabase)throw Error('Cloud sign-in is required to delete a process.');
    const user=await identity();
    const {data,error}=await supabase.from('oms_processes').select('id,process_no,team_id,user_id').eq('id',id).single();
    if(error||!data)throw Error('Process not found.');
    await cloud.setTrash({id:data.id,process:data.process_no,team_id:data.team_id,owner_id:data.user_id},false);
  },
  async upload(id:string,kind:string,file:File,verification?:{verifiedProcessNo?:string;extractedProcessNo?:string}){
    validFile(file);
    if(!cloudConfigured||!supabase)throw Error('Cloud storage not configured. Original document has not been saved.');
    if(!['pickDoc','invoiceDoc','einvoiceDoc','ebillDoc','lrDoc','emailDoc','proofDoc','donePickDoc'].includes(kind))throw Error('Invalid document type');
    if(kind==='emailDoc'&&!/\.eml$/i.test(file.name))throw Error('Outlook attachments must be .eml');
    if(kind!=='emailDoc'&&/\.eml$/i.test(file.name))throw Error('Only the Outlook Email field accepts .eml files');
    const user=await identity();
    if(kind==='donePickDoc'){
      const confirmed=String(verification?.verifiedProcessNo||'').trim();
      if(!confirmed)throw Error('Review and confirm the matching Process No. before attaching this photo.');
      const {data:ownerProcess,error:processError}=await supabase.from('oms_processes').select('process_no').eq('id',id).single();
      if(processError||!ownerProcess||String(ownerProcess.process_no).trim()!==confirmed)throw Error('Process No. does not match the selected cloud record. Photo not attached.');
    }
    const name=file.name.slice(0,120).replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=user.id+'/'+id+'/'+crypto.randomUUID()+'-'+name;
    const {error:storageError}=await supabase.storage.from('oms-documents').upload(path,file,{contentType:kind==='emailDoc'?'message/rfc822':file.type,upsert:false});
    if(storageError)throw storageError;
    const {error:dbError}=await supabase.from('oms_documents').insert({process_id:id,user_id:user.id,kind,name,path,extracted_process_no:kind==='donePickDoc'?verification?.extractedProcessNo||null:null});
    if(dbError){await supabase.storage.from('oms-documents').remove([path]);throw dbError}
    return {path};
  },
  async open(id:string,docId:string){
    const tab=window.open('about:blank','_blank');
    if(!tab)throw Error('Your browser blocked the document tab. Allow pop-ups for OMS.');
    tab.opener=null;
    try{
      if(!supabase)throw Error('Document bytes are not saved in local preview.');
      await identity();
      const {data,error}=await supabase.from('oms_documents').select('path').eq('id',docId).eq('process_id',id).single();
      if(error||!data)throw Error('Document not found in your private workspace');
      const {data:link,error:linkError}=await supabase.storage.from('oms-documents').createSignedUrl(data.path,60);
      if(linkError||!link?.signedUrl)throw Error('Could not open the private document');
      tab.location.replace(link.signedUrl);
    }catch(e){tab.close();throw e}
  },
  async download(id:string,docId:string){
    if(!supabase)throw Error('Cloud login required for private downloads.');
    await identity();
    const {data,error}=await supabase.from('oms_documents').select('path,name').eq('id',docId).eq('process_id',id).single();
    if(error||!data)throw Error('Document not found or access denied.');
    const {data:file,fileError}=await (async()=>{const result=await supabase.storage.from('oms-documents').download(data.path);return {data:result.data,fileError:result.error}})();
    if(fileError||!file)throw Error(fileError?.message||'Private download failed.');
    const url=URL.createObjectURL(file);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=String(data.name||'document').replace(/[/\\:*?"<>|]/g,'_');
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),20000);
  },
  async inspectAttachment(file:File,kind:string):Promise<ScanResult>{
    validFile(file);
    if(kind==='emailDoc')return parseDocumentFields(await file.text(),kind);
    if(file.type==='application/pdf'){
      const {pdf,rows,rawRows}=await pdfRows(file);
      const visual=parseDocumentFields(rows.join('\n'),kind);
      const logical=parseDocumentFields(rawRows.join('\n'),kind);
      // Prefer the visual reading order; use the PDF's native reading order to
      // fill genuinely missing fields. If values differ, keep the first value
      // and warn the user to inspect the original.
      const fields={...logical.fields,...visual.fields};
      const discrepancies=Object.keys(logical.fields).filter(k=>{
        const x=logical.fields[k as keyof typeof logical.fields];
        const y=visual.fields[k as keyof typeof visual.fields];
        return Boolean(x&&y&&x!==y);
      });
      let usedOCR=false;
      const expected=expectedDocumentFields[kind]||[];
      if(expected.some(key=>!fields[key])){
        try{
          // For PDFs with only embedded scans, read up to two page images.
          // This runs only when the expected labelled field is still missing.
          const scans:string[]=[];
          for(let p=1;p<=Math.min(pdf.numPages,2);p++){
            const page=await pdf.getPage(p);
            const base=page.getViewport({scale:1});
            const viewport=page.getViewport({scale:Math.min(2,2000/base.width)});
            const canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(viewport.width));
            canvas.height=Math.max(1,Math.round(viewport.height));
            const ctx=canvas.getContext('2d');
            if(!ctx)throw Error('Could not render scanned PDF');
            await page.render({canvasContext:ctx,canvas,viewport}).promise;
            const output=await recognize(canvas,'eng');
            scans.push(output.data.text);
            const ocrFields=parseDocumentFields(scans.join('\n'),kind).fields;
            for(const [key,value] of Object.entries(ocrFields))if(value&&!fields[key as keyof typeof fields])fields[key as keyof typeof fields]=value;
            usedOCR=true;
            if(expected.every(key=>Boolean(fields[key])))break;
          }
        }catch(e:any){
          // Do not lose valid digitally extracted values because OCR failed.
          discrepancies.push('OCR fallback unavailable: '+String(e?.message||'unknown error'));
        }
      }
      const found=Object.keys(fields);
      const missing=expected.filter(key=>!fields[key]);
      const notes=[
        found.length?'Extracted '+found.join(', ')+'.':'No reliable labelled values found.',
        missing.length?'Still missing: '+missing.join(', ')+'.':'',
        discrepancies.length?'PDF text ordering needs review: '+discrepancies.join('; ')+'.':'',
        usedOCR?'Scanned PDF page(s) with OCR fallback.':'Read embedded PDF text.',
        'Verify all values against the original PDF before saving.'
      ].filter(Boolean);
      return {fields,emails:[],notes};
    }
    if(file.type.startsWith('image/')){
      const scan=await recognize(file,'eng');
      const result=parseDocumentFields(scan.data.text,kind);
      result.notes.unshift('Photo OCR confidence '+Math.round(scan.data.confidence)+'%. Review carefully.');
      return result;
    }
    throw Error('Supported documents: PDF, photo or Outlook .eml.');
  },
  async inspectStored(id:string,docId:string,kind:string):Promise<ScanResult>{
    if(!supabase)throw Error('Cloud storage not configured');
    await identity();
    const {data:doc,error}=await supabase.from('oms_documents').select('path,name,kind').eq('id',docId).eq('process_id',id).single();
    if(error||!doc)throw Error('Document not found or no permission');
    if(doc.kind!==kind)throw Error('Incorrect document type');
    const {data:file,error:downloadError}=await supabase.storage.from('oms-documents').download(doc.path);
    if(downloadError||!file)throw Error(downloadError?.message||'Could not read this stored document');
    const ext=String(doc.name||'').toLowerCase();
    const mime=kind==='emailDoc'?'message/rfc822':ext.endsWith('.pdf')?'application/pdf':file.type||'application/pdf';
    return cloud.inspectAttachment(new File([file],doc.name||'document',{type:mime}),kind);
  },
  async readDonePick(file:File):Promise<DonePickRead>{
    validFile(file);
    if(file.type==='application/pdf'){
      const result=await pdfRows(file);
      const textRead=parseDonePickProcess(result.rows.join('\n'));
      if(textRead.status==='detected'||textRead.status==='ambiguous')return textRead;
      const ocr=await pdfOcr(result.pdf);
      return parseDonePickProcess(ocr.join('\n'));
    }
    if(!file.type.startsWith('image/'))throw Error('Done Pick List must be a photo or PDF.');
    let bestConfidence=0;
    for(const rotation of [0,90,270]){
      const ocr=await ocrDonePhoto(file,rotation);
      bestConfidence=Math.max(bestConfidence,ocr.confidence||0);
      const result=parseDonePickProcess(ocr.text);
      if(result.status==='ambiguous')return {...result,confidence:ocr.confidence,rotation};
      if(result.status==='detected')return {...result,confidence:ocr.confidence,rotation};
    }
    return {...parseDonePickProcess(''),confidence:bestConfidence};
  },
  async extractLRs(file:File):Promise<{candidates:string[];method:'pdf_text'|'ocr_pdf'|'ocr_image'}>{
    validFile(file);
    if(file.type==='application/pdf'){
      const {pdf,rows}=await pdfRows(file);
      const candidates=extractLRs(rows.join('\n'));
      if(candidates.length)return {candidates,method:'pdf_text'};
      const ocr=await pdfOcr(pdf);
      return {candidates:extractLRs(ocr.join('\n')),method:'ocr_pdf'};
    }
    const recognized=await recognize(file,'eng');
    return {candidates:extractLRs(recognized.data.text),method:'ocr_image'};
  },
  async extract(file:File,kind:string):Promise<any>{
    validFile(file);
    let rows:string[]=[];
    let pdf:any=null;
    let source:'pdf_text'|'ocr_photo'|'ocr_pdf'='pdf_text';
    let ocrConfidence:number|null=null;
    if(file.type==='application/pdf'){const result=await pdfRows(file);pdf=result.pdf;rows=result.rows}
    else {const result=await recognize(file,'eng');rows=result.data.text.split(/\r?\n/).filter(Boolean);source='ocr_photo';ocrConfidence=Number(result.data.confidence)}
    if(kind==='pickDoc'){
      const fields:PickSlipFields={process:'',party:'',so:''};
      const merge=(partial:PickSlipFields)=>{
        for(const key of ['process','party','so'] as const){
          if(!partial[key])continue;
          if(fields[key]&&fields[key].toLowerCase()!==partial[key].toLowerCase())throw new PickSlipParseError('Conflicting '+key+' in Pick Slip. Verify the original PDF.',fields);
          fields[key]=partial[key];
        }
      };
      const tryRows=(lines:string[])=>{
        const result=parsePickSlipRows(lines,{allowPartial:true});
        merge(result);
      };
      tryRows(rows);
      if(pdf&&(!fields.process||!fields.party||!fields.so)){
        const page=await pdf.getPage(1);
        const items=(await page.getTextContent()).items as any[];
        tryRows([items.map(item=>String(item.str||'')).join(' ')]);
      }
      if(pdf&&(!fields.process||!fields.party||!fields.so)){
        try{const scan=await pdfOcr(pdf);tryRows(scan);source='ocr_pdf'}catch(e:any){
          if(/conflicting/i.test(String(e?.message||'')))throw e;
        }
      }
      if(fields.process&&fields.party&&fields.so)return {...fields,_readMethod:source,_ocrConfidence:ocrConfidence,_reviewRecommended:source!=='pdf_text'||(ocrConfidence!==null&&ocrConfidence<80)};
      const missing=[!fields.process?'Process No.':'',!fields.party?'Party Name':'',!fields.so?'SO No.':''].filter(Boolean).join(', ');
      throw new PickSlipParseError('Could not read '+missing+' from this PDF. Check the missing fields before saving.',fields);
    }
    if(rows.join('').trim().length<20&&pdf)rows=await pdfOcr(pdf);
    return genericExtract(rows);
  }
};
