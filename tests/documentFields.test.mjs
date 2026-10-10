import assert from 'node:assert/strict';
import {parseDocumentFields,mailCandidates} from '../src/documentFields.ts';
const invoice=parseDocumentFields('Tax Invoice No. 946 Invoice Date 10/10/2026 Invoice Amount ₹ 75,000 Sales Order No. 26271016','invoiceDoc');
assert.equal(invoice.fields.invoice,'946');
assert.equal(invoice.fields.invoiceDate,'2026-10-10');
assert.equal(invoice.fields.amount,'75000');
assert.equal(invoice.fields.so,'26271016');
assert.equal(parseDocumentFields('E-Invoice No. 15498447774','einvoiceDoc').fields.einvoice,'15498447774');
const ewayDebug=parseDocumentFields('E-Way Bill No. 123456789012','ebillDoc');
console.log('E-Way Bill parser result:',JSON.stringify(ewayDebug.fields));
console.log('E-Way Bill regex debug:',JSON.stringify([...('E-Way Bill No. 123456789012').matchAll(/\b(?:E[\s-]*Way\s*Bill|EWB)\s*(?:No\.?|Number|#)?\s*[:.#-]?\s*(\d{10,15})\b/gi)].map(m=>m[1])));
assert.equal(parseDocumentFields('E-Way Bill No. 123456789012','ebillDoc').fields.ebill,'123456789012');
assert.equal(parseDocumentFields('LR / Docket No: LR-12345','lrDoc').fields.lr,'LR-12345');
assert.equal(parseDocumentFields('Docket No: 946','lrDoc').fields.lr,'946');
const eml='From: "Customer Team" <customer@example.org>\r\nTo: PJS Office <office@example.in>\r\nCc: audit@example.net\r\nSubject: Dispatch\r\n\r\nHello';
assert.deepEqual(mailCandidates(eml),['customer@example.org','office@example.in','audit@example.net']);
assert.equal(parseDocumentFields(eml,'emailDoc').emails.length,3);
assert.equal(parseDocumentFields('random lines with 928347261 shipping updates','lrDoc').fields.lr,undefined);

const multiline=`TAX INVOICE
GSTIN: 24ABCFA0000X1Z0
Invoice Number
INV/2026/946
Invoice Date:
10-Oct-2026
Sales Order No
26271016
Invoice Value:
1,20,456.25
`;
const alternative=parseDocumentFields(multiline,'invoiceDoc');
assert.equal(alternative.fields.invoice,'INV/2026/946');
assert.equal(alternative.fields.invoiceDate,'2026-10-10');
assert.equal(alternative.fields.so,'26271016');
assert.equal(alternative.fields.amount,'120456.25');
const irn='IRN: '+('a'.repeat(64))+' Ack. No: 1234567890';
assert.equal(parseDocumentFields(irn,'einvoiceDoc').fields.einvoice,'a'.repeat(64));
assert.equal(parseDocumentFields('EWB No. 123456789012 E Way Bill Date: 10-Oct-2026','ebillDoc').fields.ebill,'123456789012');
assert.equal(parseDocumentFields('Consignment Note Number: CN-12345','lrDoc').fields.lr,'CN-12345');
assert.equal(parseDocumentFields('Docket No. 946','lrDoc').fields.lr,'946');
assert.equal(parseDocumentFields('Invoice No: DATE Invoice Date: 10-Oct-2026','invoiceDoc').fields.invoice,undefined);

console.log('PASS: 11 document field and email header extraction cases');
console.log('PASS: additional invoice layouts, IRN, EWB and safe labelled-value cases');
