import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from outlook_mailbox_bridge import source_message_id, find_original_message, resolve_account


class Items:
    def __init__(self, values):
        self.values = values
        self.pos = -1
    def Sort(self, *_):
        pass
    def GetFirst(self):
        self.pos = 0
        return self.values[0] if self.values else None
    def GetNext(self):
        self.pos += 1
        return self.values[self.pos] if self.pos < len(self.values) else None


class Item:
    def __init__(self, message_id):
        self.PropertyAccessor = SimpleNamespace(GetProperty=lambda prop: message_id)


class BridgeTests(unittest.TestCase):
    def test_header_only_message_id(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d, "original.eml")
            f.write_bytes(b"From: customer@example.com\r\nTo: office@example.com\r\nMessage-ID: <id-101@example.com>\r\n\r\nBody")
            self.assertEqual(source_message_id(f), "<id-101@example.com>")

    def test_missing_id_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d, "original.eml")
            f.write_bytes(b"Subject: dispatch\r\n\r\nHello")
            with self.assertRaises(ValueError):
                source_message_id(f)

    def test_unique_match(self):
        wanted = Item("<id-101@example.com>")
        folders = {6: SimpleNamespace(Items=Items([Item("<other>"), wanted])),
                   5: SimpleNamespace(Items=Items([]))}
        account = SimpleNamespace(DeliveryStore=SimpleNamespace(GetDefaultFolder=lambda key: folders[key]))
        self.assertIs(find_original_message(account, "<id-101@example.com>"), wanted)

    def test_duplicate_not_sent(self):
        same = "<id@example.com>"
        folders = {6: SimpleNamespace(Items=Items([Item(same)])),
                   5: SimpleNamespace(Items=Items([Item(same)]))}
        account = SimpleNamespace(DeliveryStore=SimpleNamespace(GetDefaultFolder=lambda key: folders[key]))
        with self.assertRaises(LookupError):
            find_original_message(account, same)

    def test_sender_account_is_explicit(self):
        wrong = SimpleNamespace(SmtpAddress="other@example.com")
        correct = SimpleNamespace(SmtpAddress="dispatch@example.com")
        app = SimpleNamespace(Session=SimpleNamespace(Accounts=[wrong, correct]))
        self.assertIs(resolve_account(app, "DISPATCH@EXAMPLE.COM"), correct)
        with self.assertRaises(LookupError):
            resolve_account(app, "missing@example.com")


if __name__ == "__main__":
    unittest.main()
