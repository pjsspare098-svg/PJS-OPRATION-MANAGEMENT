import {useState} from 'react';
import {FileText,ScanText} from 'lucide-react';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc=pdfWorker;

export default function PdfOcrTestBench(){
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState('');
 const [text,setText]=useState('');
 const [pageCount,setPageCount]=useState(0);
 const [error,setError]=useState('');
 async function inspect(file:File|null){
  if(!file)return;
  setText('');setPageCount(0);setName(file.name);setError('');
  if(file.size>15_000_000){setError('Select a PDF of 15 MB or less.');return}
  if(!file.name.toLowerCase().endsWith('.pdf')){setError('PDF files only.');return}
  setBusy(true);let task:any;
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('Not a valid PDF file.');
   task=getDocument({data:bytes,useSystemFonts:true});
   const pdf=await task.promise;
   setPageCount(pdf.numPages);
   const lines:string[]=[];
   for(let n=1;n<=Math.min(pdf.numPages,3);n++){
     const page=await pdf.getPage(n);
     const contents=await page.getTextContent();
     lines.push('--- Page '+n+' ---');
     lines.push(contents.items.map((item:any)=>'str' in item?String(item.str):'').join(' '));
   }
   const extracted=lines.join('\n').trim().slice(0,18000);
   setText(extracted||'No selectable text found. This document needs OCR/manual review; no fields were overwritten.');
  }catch(e:any){setError(e?.message||'PDF inspection failed.')}
  finally{setBusy(false);if(task)await task.destroy().catch(()=>{})}
 }
 return <section className='sc-card'>
  <div className='sc-section-head'><div><h2><ScanText size={17} style={{verticalAlign:'middle',marginRight:8}}/>PDF extraction test bench</h2>
   <p>Inspect the first three pages of a sample PDF locally in your browser. Nothing is uploaded or written to process fields.</p>
  </div><span className='sc-chip'>WORKING LOCAL TEST</span></div>
  <div className='sc-fields'><label className='ux-field'>Sample PDF
    <input type='file' accept='application/pdf,.pdf' disabled={busy} onChange={e=>{void inspect(e.target.files?.[0]||null);e.target.value=''}}/>
    <small>This checks embedded PDF text; scanned-image OCR still uses the existing document workflow.</small>
  </label></div>
  {error&&<p className='sc-invalid' role='alert'>{error}</p>}
  {busy&&<p className='sc-muted'>Reading PDF text…</p>}
  {text&&<div className='sc-pdf-preview'><strong><FileText size={16}/> {name} · {pageCount} pages</strong>
    <textarea aria-label='Extracted PDF text' readOnly value={text} rows={9}/></div>}
 </section>;
}
