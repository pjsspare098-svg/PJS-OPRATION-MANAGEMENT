import tempfile
import unittest
from pathlib import Path
from oms_dispatch_bridge import build_plan, verify_document


class DispatchBridgeTests(unittest.TestCase):
    def setUp(self):
        self.owner = "user-1"
        self.process = {
            "id": "process-1", "user_id": self.owner,
            "process_no": "292168", "party_name": "Customer",
            "sales_order_no": "26271016",
            "data": {"invoice": "2627/946", "sales": "Vivek Pal", "productName": "PJ Spares"}
        }
        self.email = {"id": "original-1", "kind": "emailDoc", "name": "original.eml", "process_id": "process-1",
                      "user_id": self.owner, "path": "user-1/process-1/original.eml"}
        self.invoice = {"id": "inv-1", "kind": "invoiceDoc", "name": "invoice.pdf", "process_id": "process-1",
                        "user_id": self.owner, "path": "user-1/process-1/invoice.pdf"}
        self.job = {"job_type": "email_reply", "process_id": "process-1", "process_no": "292168", "user_id": self.owner,
                    "payload": {"email_document_id": "original-1"}}

    def test_exact_original_and_invoice(self):
        blobs = {self.email["path"]: b"Message-ID: <test@example.com>\r\n\r\n",
                 self.invoice["path"]: b"%PDF-1.7\n"}
        with tempfile.TemporaryDirectory() as d:
            p = build_plan(self.job, self.process, [self.email, self.invoice], blobs.__getitem__, Path(d))
            self.assertTrue(p.conversation.exists())
            self.assertEqual(len(p.attachments), 1)
            self.assertEqual(p.details.sales_person, "Vivek Pal")
            self.assertEqual(p.details.product_name, "PJ Spares")
            self.assertIn("lrDoc", p.missing)

    def test_no_thread_guessing(self):
        with tempfile.TemporaryDirectory() as d:
            job = {**self.job, "payload": {}}
            with self.assertRaises(ValueError):
                build_plan(job, self.process, [self.email], lambda p: b"x", Path(d))

    def test_no_cross_process_file_access(self):
        with self.assertRaises(ValueError):
            verify_document({**self.email, "path":"user-1/other-process/original.eml"},process_id="process-1")
        with self.assertRaises(ValueError):
            verify_document({**self.email, "process_id":"other-process"},process_id="process-1")

    def test_source_owner_validation(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                build_plan({**self.job, "user_id":"another-user"}, self.process, [self.email], lambda p: b"x", Path(d))


if __name__ == "__main__":
    unittest.main()
