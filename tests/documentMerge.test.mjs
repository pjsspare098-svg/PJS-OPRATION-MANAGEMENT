import assert from 'node:assert/strict';
import {mergeDocumentScans,safeUpdates} from '../src/documentMerge.ts';
const docs=[
 {kind:'invoiceDoc',name:'invoice.pdf',fields:{invoice:'946',amount:'75432.50',so:'26271016'},emails:[]},
 {kind:'einvoiceDoc',name:'einvoice.pdf',fields:{einvoice:'a'.repeat(64),invoice:'946'},emails:[]},
 {kind:'lrDoc',name:'LR.pdf',fields:{lr:'LR-88888',invoice:'SHOULD-NOT-BE-TRUSTED',so:'26271016'},emails:[]}
];
const reviewed=mergeDocumentScans(docs);
assert.equal(reviewed.candidates.find(x=>x.key==='invoice')?.value,'946');
assert.equal(reviewed.candidates.find(x=>x.key==='lr')?.value,'LR-88888');
assert.equal(reviewed.candidates.filter(x=>x.key==='invoice').length,1);
assert.equal(reviewed.candidates.find(x=>x.key==='einvoice')?.value,'a'.repeat(64));
assert.equal(reviewed.conflicts.length,0);
const updates=safeUpdates({invoice:'',lr:'',so:'26271016'},reviewed);
assert.equal(updates.changes.invoice,'946');
assert.equal(updates.changes.lr,'LR-88888');
assert.equal(updates.changes.so,undefined);
const conflict=mergeDocumentScans([
 {kind:'invoiceDoc',name:'inv-A.pdf',fields:{invoice:'946'},emails:[]},
 {kind:'einvoiceDoc',name:'inv-B.pdf',fields:{invoice:'947'},emails:[]}
]);
assert.equal(conflict.conflicts.length,1);
assert.ok(conflict.candidates.every(x=>x.kind==='conflict'));
assert.equal(safeUpdates({invoice:''},conflict).changes.invoice,undefined,'Conflicting numbers may not be filled');
assert.equal(safeUpdates({invoice:'945'},reviewed).changes.invoice,undefined,'Existing number may not be silently replaced');
console.log('PASS: cross-PDF extraction merge, conflicts and no-overwrite guarantees');

const purchaseOrderDocs=[
 {kind:'invoiceDoc',name:'Tax_Invoice.pdf',fields:{invoice:'2627/946',po:'PO-12345',poDate:'2026-10-04',payment:'Net 30 Days'},emails:[]},
 {kind:'lrDoc',name:'LR.pdf',fields:{lr:'LR-45678',po:'WRONG-PO',payment:'COD'},emails:[]}
];
const purchaseReview=mergeDocumentScans(purchaseOrderDocs);
assert.equal(purchaseReview.candidates.find(x=>x.key==='po')?.source,'Tax_Invoice.pdf');
assert.equal(purchaseReview.candidates.find(x=>x.key==='poDate')?.value,'2026-10-04');
assert.equal(purchaseReview.candidates.find(x=>x.key==='payment')?.value,'Net 30 Days');
assert.deepEqual(
 Object.fromEntries(Object.entries(safeUpdates({po:'',poDate:'',payment:''},purchaseReview).changes).filter(([k])=>['po','poDate','payment'].includes(k))),
 {po:'PO-12345',poDate:'2026-10-04',payment:'Net 30 Days'}
);
assert.equal(safeUpdates({po:'MY-EXISTING-PO'},purchaseReview).changes.po,undefined);
const alternateTerms=mergeDocumentScans([
 {kind:'invoiceDoc',name:'Invoice A.pdf',fields:{payment:'Net 30 Days'},emails:[]},
 {kind:'invoiceDoc',name:'Invoice B.pdf',fields:{payment:'Advance'},emails:[]}
]);
assert.equal(safeUpdates({payment:''},alternateTerms).changes.payment,undefined);
console.log('PASS: Invoice PO and payment data merged safely, existing values and conflicts preserved');
