import assert from 'node:assert/strict';
import {checkBill,checkJob,canCloseProcess,amountValue} from '../src/businessRules.ts';
const p={id:'process-1',process:'292184',so:'26270964',party:'Example Industrial Pvt Ltd',invoice:'INV-101',credit:'Credit',amount:'75,000',clientEmail:'dispatch@example.com',transporter:'TCI',lr:'LR-111111',po:'PO-101',poDate:'2026-10-07',invoiceDate:'2026-10-08',courierDate:'2026-10-09',weight:'12.5',stage:'Delivery Proof',status:'Delivered',documents:[
 {kind:'pickDoc'},{kind:'invoiceDoc',id:'inv-1',name:'invoice.pdf'},{kind:'lrDoc',id:'lr-1',name:'courier-receipt.pdf'},{kind:'einvoiceDoc'},{kind:'ebillDoc'},{kind:'proofDoc'},{kind:'emailDoc',id:'original-email-document',name:'original.eml'}
]};
assert.equal(checkBill(p).ready,true);
assert.equal(checkBill({...p,documents:p.documents.filter(d=>d.kind!=='ebillDoc')}).ready,false);
assert.ok(checkBill({...p,documents:p.documents.filter(d=>d.kind!=='ebillDoc')}).missing.some(x=>x.includes('E-Way')));
assert.equal(checkBill({...p,amount:'1200',documents:p.documents.filter(d=>d.kind!=='ebillDoc')}).ready,true);
assert.equal(checkBill({...p,invoice:''}).ready,false);
assert.equal(checkBill({...p,amount:''}).ready,false);
assert.equal(amountValue('₹ 1,20,000'),120000);
assert.equal(checkJob(p,'tracking').ready,true);
assert.equal(checkJob({...p,lr:''},'tracking').ready,false);
assert.equal(checkJob(p,'email_reply').ready,true);
assert.equal(checkJob(p,'datadoc_submit').ready,false);
const jobs=[{process_id:p.id,job_type:'bill_submit',status:'completed'},{process_id:p.id,job_type:'delivery_proof_submit',status:'completed'}];
assert.equal(checkJob(p,'datadoc_submit',undefined,jobs).ready,true);
assert.equal(checkJob(p,'delivery_proof_submit').ready,true);
assert.equal(canCloseProcess(p,jobs).ready,true);
assert.equal(canCloseProcess({...p,exceptionReason:'Address issue'},jobs).ready,false);
assert.equal(canCloseProcess(p,[]).ready,false);

// The Windows DataDoc adapter requires a verified E-Invoice PDF even when
// an E-Way Bill is attached, and needs E-Way only ABOVE the threshold.
assert.equal(checkBill({...p,amount:'25000',documents:p.documents.filter(d=>d.kind!=='einvoiceDoc')}).ready,false);
assert.ok(checkBill({...p,amount:'25000',documents:p.documents.filter(d=>d.kind!=='einvoiceDoc')}).missing.includes('E-Invoice PDF'));
assert.equal(checkBill({...p,amount:'50000',documents:p.documents.filter(d=>d.kind!=='ebillDoc')}).ready,true);
assert.equal(checkBill({...p,amount:'50001',documents:p.documents.filter(d=>d.kind!=='ebillDoc')}).ready,false);
assert.equal(checkBill({...p,amount:'0'}).ready,false);
console.log('PASS: 5 DataDoc office-worker readiness edge cases');

console.log('PASS: 15 business readiness and closure tests');

const reply={id:'process-reply-all',process:'292168',so:'26271016',party:'Test',invoice:'946',po:'PO-222',poDate:'2026-10-07',invoiceDate:'2026-10-08',transporter:'TCI',lr:'LR-1212',courierDate:'2026-10-09',weight:'5.2',clientEmail:'',documents:[{kind:'emailDoc',id:'eml-1',name:'original.eml'},{kind:'invoiceDoc',id:'inv-1',name:'invoice.pdf'},{kind:'lrDoc',id:'lr-1',name:'courier-receipt.pdf'}]};
assert.equal(checkJob(reply,'email_reply').ready,true,'Reply All uses saved original .eml and invoice PDF, never extracted recipient addresses');
assert.equal(checkJob({...reply,documents:[]},'email_reply').ready,false);
assert.equal(checkJob({...reply,documents:[{kind:'emailDoc',id:'a',name:'a.eml'},{kind:'emailDoc',id:'b',name:'b.eml'},{kind:'invoiceDoc',name:'invoice.pdf'},{kind:'lrDoc',name:'courier-receipt.pdf'}]},'email_reply').ready,false,'Multiple threads require explicit selection');
assert.equal(checkJob({...reply,selected_email_document_id:'b',documents:[{kind:'emailDoc',id:'a',name:'a.eml'},{kind:'emailDoc',id:'b',name:'b.eml'},{kind:'invoiceDoc',name:'invoice.pdf'},{kind:'lrDoc',name:'courier-receipt.pdf'}]},'email_reply').ready,true,'Selected original thread can be queued safely');
assert.equal(checkJob({...reply,documents:[{kind:'emailDoc',name:'original.eml'}]},'email_reply').ready,false,'Original message and invoice PDF must be saved first');
assert.equal(checkJob({...reply,po:''},'email_reply').ready,false);
assert.equal(checkJob({...reply,weight:'0'},'email_reply').ready,false);
assert.equal(checkJob({...reply,courierDate:''},'email_reply').ready,false);
assert.equal(checkJob({...reply,documents:reply.documents.filter(d=>d.kind!=='lrDoc')},'email_reply').ready,false);
console.log('PASS: verified PressureJet dispatch details, original Outlook message and both PDFs');
