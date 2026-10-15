"""Regression tests for screenshot-backed DataDoc Bill Submit ZIP v2.

Does not open a browser, log in, send files or submit real transactions.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import Mock, patch
from zipfile import ZipFile

from datadoc import DataDocAgent
from datadoc_bill_package import build_bill_zip

PDF=b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


class BillPackageTests(TestCase):
    def test_automatic_zip_contains_only_available_process_pdfs(self):
        with TemporaryDirectory() as temp:
            root=Path(temp)
            files={}
            for kind in ("invoiceDoc","einvoiceDoc","ebillDoc"):
                doc=root/(kind+".pdf")
                doc.write_bytes(PDF)
                files[kind]=str(doc)
            package,names=build_bill_zip("291888",files,root)
            self.assertEqual(names,("Invoice.pdf","E-Invoice.pdf","E-Way-Bill.pdf"))
            with ZipFile(package) as z:
                self.assertEqual(z.namelist(),list(names))
                self.assertEqual(z.read("Invoice.pdf"),PDF)
            # Missing optional documents must not produce invented PDFs.
            package,names=build_bill_zip("291888",{"invoiceDoc":files["invoiceDoc"]},root)
            self.assertEqual(names,("Invoice.pdf",))

    def test_invalid_or_cross_category_documents_rejected(self):
        with TemporaryDirectory() as temp:
            root=Path(temp); doc=root/"invoice.pdf";doc.write_bytes(b"not a PDF")
            with self.assertRaisesRegex(ValueError,"valid PDF"):
                build_bill_zip("291888",{"invoiceDoc":str(doc)},root)
            doc.write_bytes(PDF)
            with self.assertRaisesRegex(ValueError,"Unsupported document"):
                build_bill_zip("291888",{"invoiceDoc":str(doc),"pickDoc":str(doc)},root)
            with self.assertRaisesRegex(ValueError,"Invoice PDF"):
                build_bill_zip("291888",{},root)


class DataDocOneZipTests(TestCase):
    def _exercise_work(self,credit_type):
        with TemporaryDirectory() as temp:
            root=Path(temp)
            invoice=root/"invoice.pdf";invoice.write_bytes(PDF)
            package,_=build_bill_zip("291888",{"invoiceDoc":str(invoice)},root)
            a=DataDocAgent()
            a.driver=Mock()
            selenium_chrome=a.driver
            values={}
            def set_text(key,val):
                values[key]=val
                return True
            def find_element(by,key):
                field=Mock()
                field.get_attribute.side_effect=lambda name:values.get(key,"") if name=="value" else ""
                return field
            a.driver.find_element.side_effect=find_element
            with patch.object(a,"ensure_started",return_value=True), \
                 patch.object(a,"_open_process",return_value=True), \
                 patch.object(a,"_find_dispatch_row_add_docs",return_value=None), \
                 patch.object(a,"_click_add",return_value=True), \
                 patch.object(a,"_switch_transaction_frame",return_value=True), \
                 patch.object(a,"_select_dropdown",return_value=True) as dropdown, \
                 patch.object(a,"_reenter_frame",return_value=True), \
                 patch.object(a,"_default_content"), \
                 patch.object(a,"_set_text",side_effect=set_text), \
                 patch.object(a,"_select_only_user",return_value=True), \
                 patch.object(a,"_attach_file",return_value=True) as attach, \
                 patch.object(a,"_click_submit_by_id",return_value=True) as submit, \
                 patch.object(a,"_wait_for_submission",return_value=True), \
                 patch.object(a,"_confirm_dispatch_bill",return_value=True) as confirm:
                r=a.submit_bill("291888",credit_type,"2627/947","51.35",str(package))
            self.assertTrue(r.success,r.error)
            selenium_chrome.quit.assert_called_once()
            self.assertIsNone(a.driver, "Verified submission must release DataDoc Chrome")
            self.assertEqual(len(submit.call_args_list),1)
            attach.assert_called_once_with(str(package.resolve()))
            dropdown.assert_any_call("cphContent_ddlWork","Dispatch - "+credit_type)
            confirm.assert_called_once_with("Dispatch - "+credit_type,"2627/947")
            if credit_type=="Credit":
                self.assertEqual(values["cphContent_txtExtraField"],"Yes")
                self.assertEqual(values["cphContent_txtExtraField_2"],"2627/947")
                self.assertEqual(values["cphContent_txtExtraField_3"],"51.35")
            else:
                self.assertEqual(values["cphContent_txtExtraField"],"2627/947")
                self.assertEqual(values["cphContent_txtExtraField_2"],"51.35")
                self.assertEqual(values["cphContent_txtExtraField_3"],"Yes")

    def test_credit_form_mapping(self):
        self._exercise_work("Credit")

    def test_noncredit_form_mapping(self):
        self._exercise_work("Non Credit")

    def test_existing_dispatch_transaction_never_repeated(self):
        with TemporaryDirectory() as temp:
            root=Path(temp);doc=root/"i.pdf";doc.write_bytes(PDF)
            package,_=build_bill_zip("291888",{"invoiceDoc":str(doc)},root)
            a=DataDocAgent()
            with patch.object(a,"ensure_started",return_value=True),\
                 patch.object(a,"_open_process",return_value=True),\
                 patch.object(a,"_find_dispatch_row_add_docs",return_value=object()),\
                 patch.object(a,"_click_add",return_value=True) as add:
                result=a.submit_bill("291888","Credit","2627/947","51.35",str(package))
            self.assertFalse(result.success)
            self.assertIn("already exists",result.error)
            add.assert_not_called()

    def test_uncertain_submit_does_not_claim_success(self):
        with TemporaryDirectory() as temp:
            root=Path(temp);doc=root/"i.pdf";doc.write_bytes(PDF)
            package,_=build_bill_zip("291888",{"invoiceDoc":str(doc)},root)
            a=DataDocAgent()
            a.driver=Mock()
            values={}
            def find_element(by,key):
                field=Mock()
                field.get_attribute.side_effect=lambda name:values.get(key,"") if name=="value" else ""
                return field
            a.driver.find_element.side_effect=find_element
            with patch.object(a,"ensure_started",return_value=True),\
                 patch.object(a,"_open_process",return_value=True),\
                 patch.object(a,"_find_dispatch_row_add_docs",return_value=None),\
                 patch.object(a,"_click_add",return_value=True),\
                 patch.object(a,"_switch_transaction_frame",return_value=True),\
                 patch.object(a,"_select_dropdown",return_value=True),\
                 patch.object(a,"_reenter_frame",return_value=True),\
                 patch.object(a,"_default_content"),\
                 patch.object(a,"_set_text",side_effect=lambda k,v:values.__setitem__(k,v) or True),\
                 patch.object(a,"_select_only_user",return_value=True),\
                 patch.object(a,"_attach_file",return_value=True),\
                 patch.object(a,"_click_submit_by_id",return_value=True),\
                 patch.object(a,"_wait_for_submission",return_value=True),\
                 patch.object(a,"_confirm_dispatch_bill",return_value=False):
                result=a.submit_bill("291888","Credit","2627/947","51.35",str(package))
            self.assertFalse(result.success)
            self.assertIn("manual review",result.error)
