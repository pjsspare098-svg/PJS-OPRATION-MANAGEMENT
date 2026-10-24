import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch,Mock
from outlook_reply_agent import DispatchDetails
from outlook_send_worker import check_settings,submit_reply_all,execute_send,_same_timestamp

VALID_DETAILS=DispatchDetails(
 process="292280",party="Example Client",so="26270001",invoice="2627/1006",
 transporter="Shree Maruti",lr="261842000047172",po="PO-1",
 po_date="2026-10-01",invoice_date="2026-10-02",courier_date="2026-10-03",weight="2.5"
)

class FakeReply:
 def __init__(self,recipients=2,resolves=True):
  self.HTMLBody="<p>Original quoted conversation</p>"
  self.Recipients=SimpleNamespace(Count=recipients,ResolveAll=lambda:resolves)
  self.Attachments=SimpleNamespace(Add=Mock())
  self.Save=Mock()
  self.Send=Mock()
  self.SendUsingAccount=None

class FakeOriginal:
 def __init__(self,reply):
  self.reply=reply
  self.ReplyAll=Mock(return_value=reply)

class OutlookRealSendTests(unittest.TestCase):
 def fixtures(self,tmp):
  root=Path(tmp)
  email=root/"source.eml"
  email.write_text("From: client@example.test\nMessage-ID: <original-message@example.test>\nSubject: Shipment\n\nBody\n",encoding="utf-8")
  inv=root/"invoice.pdf"; inv.write_bytes(b"%PDF-1.4\nMock")
  lr=root/"lr.pdf"; lr.write_bytes(b"%PDF-1.4\nMock")
  return email,(inv,lr)

 def send(self,reply,email,docs):
  account=SimpleNamespace(SmtpAddress="dispatch@example.test")
  with patch("outlook_send_worker.resolve_account",return_value=account),patch(
    "outlook_send_worker.find_original_message",return_value=FakeOriginal(reply)
  ) as find:
   submit_reply_all(email,VALID_DETAILS,docs,smtp="dispatch@example.test",outlook=object())
   find.assert_called_once_with(account,"<original-message@example.test>",max_scan=700)
   return account

 def test_one_explicit_outlook_send_after_mailbox_and_files_verified(self):
  with TemporaryDirectory() as tmp:
   email,docs=self.fixtures(tmp)
   reply=FakeReply()
   acc=self.send(reply,email,docs)
   self.assertIs(reply.SendUsingAccount,acc)
   reply.Save.assert_called_once()
   reply.Send.assert_called_once()
   self.assertEqual(reply.Attachments.Add.call_count,2)
   self.assertIn("Original quoted conversation",reply.HTMLBody)
   self.assertIn("PO No.",reply.HTMLBody)

 def test_no_send_when_recipients_invalid(self):
  with TemporaryDirectory() as tmp:
   email,docs=self.fixtures(tmp)
   for reply in (FakeReply(recipients=0),FakeReply(resolves=False)):
    with self.assertRaises(ValueError):self.send(reply,email,docs)
    reply.Send.assert_not_called()

 def test_no_send_when_pdf_missing_or_wrong_content(self):
  with TemporaryDirectory() as tmp:
   email,docs=self.fixtures(tmp)
   docs[0].write_bytes(b"not-a-pdf")
   reply=FakeReply()
   with self.assertRaises(ValueError):self.send(reply,email,docs)
   reply.Send.assert_not_called()

 def test_no_send_without_verified_message_id(self):
  with TemporaryDirectory() as tmp:
   email,docs=self.fixtures(tmp)
   email.write_text("Subject: no Message-ID\n\n")
   reply=FakeReply()
   with self.assertRaises(ValueError):self.send(reply,email,docs)
   reply.Send.assert_not_called()

 def test_execute_send_default_is_safe(self):
  db=Mock()
  with self.assertRaisesRegex(ValueError,"disabled"):
   execute_send(db,{"id":"fake"},send=Mock())
  db.table.assert_not_called()

 def test_settings_default_to_paused(self):
  values={
   "SUPABASE_URL":"https://tbkytdktututiyeoqkwa.supabase.co",
   "SUPABASE_SERVICE_ROLE_KEY":"a"*65,
   "PJS_OFFICE_OWNER_USER_ID":"aa67edb9-f3d1-4ba1-adb5-1960fe9a9f6d"
  }
  check_settings(values)
  with self.assertRaises(ValueError):
   check_settings({**values,"PJS_ENABLE_LIVE_EMAIL_SEND":"1"}) # no SMTP or non-Windows
  with self.assertRaises(ValueError):
   check_settings({**values,"SUPABASE_URL":"https://other.supabase.co"})

 def test_updated_timestamp_equivalence(self):
  self.assertTrue(_same_timestamp("2026-10-25T14:20:11.000+00:00","2026-10-25T19:50:11+05:30"))
  self.assertFalse(_same_timestamp("2026-10-25T14:20:11+00:00","2026-10-25T14:20:12+00:00"))

if __name__=="__main__":
 unittest.main()
