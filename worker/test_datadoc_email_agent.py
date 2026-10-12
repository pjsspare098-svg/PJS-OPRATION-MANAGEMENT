import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from datadoc_email_agent import DataDocEmailAgent, validate_sent_proof


class DataDocEmailTests(unittest.TestCase):
    def test_exact_process_and_extension(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "Sent-292168.eml")
            p.write_bytes(b"From: authorized@example.com\nSubject: dispatch\n")
            self.assertEqual(validate_sent_proof("292168", p), p)
            with self.assertRaises(ValueError):
                validate_sent_proof("29216", p)
            with self.assertRaises(ValueError):
                validate_sent_proof("292168", Path(d, "292168.pdf"))

    def test_no_data_doc_browser_on_dry_run(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "Sent-292168.msg")
            p.write_bytes(b"mock sent mail evidence")
            dd = Mock()
            with patch.dict(os.environ, {"PJS_ENABLE_LIVE_DATADOC_EMAIL":"0"}):
                result = DataDocEmailAgent(dd).submit_sent_proof("292168", p, approved=True)
            self.assertEqual(result.state, "dry_run")
            dd.ensure_started.assert_not_called()

    def test_missing_file_never_runs(self):
        dd = Mock()
        with self.assertRaises(FileNotFoundError):
            DataDocEmailAgent(dd).submit_sent_proof("292168", "Sent-292168.eml")
        dd.ensure_started.assert_not_called()

    def test_explicit_approval_required(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "292168.eml")
            p.write_text("sent", encoding="utf-8")
            dd = Mock()
            with patch.dict(os.environ, {"PJS_ENABLE_LIVE_DATADOC_EMAIL":"1"}):
                result = DataDocEmailAgent(dd).submit_sent_proof("292168", p, approved=False)
            self.assertEqual(result.state, "dry_run")
            dd.ensure_started.assert_not_called()


if __name__ == "__main__":
    unittest.main()
