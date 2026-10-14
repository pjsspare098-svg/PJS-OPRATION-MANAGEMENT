import unittest
from independent_worker import validate_bill

UID="12345678-1234-4234-8234-123456789abc"
PID="22222222-2222-4222-8222-222222222222"

def source(amount="20000"):
    return {"id":PID,"process_no":"291888","party_name":"",
            "sales_order_no":"",
            "data":{"invoice":"2627/947","credit":"Credit","amount":amount}}

def files(*kinds):
    return {kind:{"kind":kind,"name":kind+".pdf",
                  "user_id":UID,"path":f"{UID}/{PID}/{kind}.pdf"}
            for kind in kinds}

class DataDocInformationalTests(unittest.TestCase):
    def test_pick_slip_and_metadata_are_optional(self):
        bill=validate_bill(source(),files("invoiceDoc","einvoiceDoc"))
        self.assertEqual(bill["process_no"],"291888")
        self.assertFalse(bill["has_ebill"])

    def test_invoice_pdf_is_still_necessary(self):
        with self.assertRaisesRegex(ValueError,"invoiceDoc"):
            validate_bill(source(),files("einvoiceDoc"))

    def test_only_invoice_pdf_is_necessary_for_zip_submission(self):
        bill=validate_bill(source(),files("invoiceDoc"))
        self.assertEqual(bill["invoice_no"],"2627/947")

    def test_optional_eway_and_einvoice_in_zip(self):
        bill=validate_bill(source("50001"),files("invoiceDoc"))
        self.assertTrue(bill["has_ebill"])
        bill=validate_bill(source("50000"),files("invoiceDoc","einvoiceDoc"))
        self.assertFalse(bill["has_ebill"])

    def test_invalid_process_identity_rejected(self):
        src=source()
        src["process_no"]="INVALID"
        with self.assertRaisesRegex(ValueError,"Process"):
            validate_bill(src,files("invoiceDoc","einvoiceDoc"))

    def test_invoice_and_credit_still_required(self):
        src=source()
        src["data"]["credit"]=""
        with self.assertRaisesRegex(ValueError,"Credit"):
            validate_bill(src,files("invoiceDoc","einvoiceDoc"))

    def test_document_ownership_still_required(self):
        doc=files("invoiceDoc","einvoiceDoc")
        doc["invoiceDoc"]["path"]="other-tenant/process/invoice.pdf"
        with self.assertRaisesRegex(ValueError,"storage path"):
            validate_bill(source(),doc)

if __name__=="__main__":
    unittest.main()
