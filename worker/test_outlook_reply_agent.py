import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from outlook_reply_agent import DispatchDetails, dispatch_html, prepare_reply_all


class FakeAttachments:
    def __init__(self):
        self.items = []

    def Add(self, path):
        self.items.append(path)


class FakeDraft:
    def __init__(self):
        self.HTMLBody = "<div>Original thread preserved</div>"
        self.Attachments = FakeAttachments()
        self.saved = False
        self.displayed = False
        self.sent = False

    def Save(self):
        self.saved = True

    def Display(self):
        self.displayed = True

    def Send(self):
        self.sent = True


class FakeOriginal:
    def __init__(self):
        self.draft = FakeDraft()
        self.reply_all_calls = 0

    def ReplyAll(self):
        self.reply_all_calls += 1
        return self.draft


class OutlookReplyAllTests(unittest.TestCase):
    def setUp(self):
        self.details = DispatchDetails(
            process="292168",
            party="Example & Sons <Ltd>",
            so="26271016",
            invoice="946",
            transporter="TCI",
            lr="LR-8888",
            po="PO-8888",
            po_date="2026-10-07",
            invoice_date="2026-10-08",
            courier_date="2026-10-09",
            weight="13.5",
        )

    def test_reply_all_keeps_original_thread_and_does_not_send(self):
        original = FakeOriginal()
        draft = prepare_reply_all(original, self.details)
        self.assertEqual(original.reply_all_calls, 1)
        self.assertTrue(draft.saved)
        self.assertTrue(draft.displayed)
        self.assertFalse(draft.sent)
        self.assertIn("Original thread preserved", draft.HTMLBody)
        self.assertIn("PO No.", draft.HTMLBody)
        self.assertIn("09/10/2026", draft.HTMLBody)
        self.assertIn("CHETAN SOLANKI", draft.HTMLBody)
        self.assertIn("Scan copy of the courier receipt", draft.HTMLBody)

    def test_html_escaping(self):
        html = dispatch_html(self.details)
        self.assertIn("292168", html)
        self.assertNotIn("<Ltd>", html)
        self.assertIn("&lt;Ltd&gt;", html)

    def test_invalid_box_weight_rejected(self):
        from dataclasses import replace
        with self.assertRaises(ValueError):
            dispatch_html(replace(self.details, weight="NaN"))
        with self.assertRaises(ValueError):
            dispatch_html(replace(self.details, courier_date=""))

    def test_required_fields_prevent_draft(self):
        with self.assertRaises(ValueError):
            prepare_reply_all(FakeOriginal(), DispatchDetails("292168", "Party", "2627", ""))

    def test_missing_attachment_blocks_reply_all(self):
        original = FakeOriginal()
        with self.assertRaises(FileNotFoundError):
            prepare_reply_all(original, self.details, ["this-does-not-exist.pdf"])
        self.assertEqual(original.reply_all_calls, 0)

    def test_attaches_files(self):
        with TemporaryDirectory() as temp:
            f = Path(temp) / "invoice.pdf"
            f.write_bytes(b"test")
            draft = prepare_reply_all(FakeOriginal(), self.details, [f])
            self.assertEqual(draft.Attachments.items, [str(f.resolve())])


if __name__ == "__main__":
    unittest.main()
