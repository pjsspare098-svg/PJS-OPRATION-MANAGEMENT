"""Locate an attached Outlook conversation in the authorized Classic Outlook mailbox.

Unlike the VBA dispatch sender, this module never extracts, supplies, or
rewrites To/Cc addresses. It matches the .eml Internet Message-ID to exactly
one existing Outlook MailItem, then invokes the separate draft-only ReplyAll().
If the original cannot be matched safely, it stops for manual reconciliation.
Requires Windows + Classic Outlook + pywin32 only when called.
"""
from __future__ import annotations

from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from typing import Any, Iterable
import os

from outlook_reply_agent import DispatchDetails, prepare_reply_all

PR_INTERNET_MESSAGE_ID = "http://schemas.microsoft.com/mapi/proptag/0x1035001F"
OL_INBOX = 6
OL_SENT = 5


def source_message_id(eml_path: str | Path) -> str:
    p = Path(eml_path)
    if p.suffix.lower() != ".eml" or not p.is_file():
        raise ValueError("Original conversation must be a saved .eml file")
    if p.stat().st_size > 15_000_000:
        raise ValueError("Email file exceeds safe inspection limit")
    with p.open("rb") as stream:
        # Read only headers, not recipient addresses; never store any address.
        header = bytearray()
        while len(header) < 128_000:
            chunk = stream.readline(8192)
            if not chunk or chunk in (b"\n", b"\r\n"):
                break
            header.extend(chunk)
    msg = BytesParser(policy=default).parsebytes(bytes(header), headersonly=True)
    message_id = str(msg.get("Message-ID", "")).strip()
    if not message_id.startswith("<") or not message_id.endswith(">") or "\n" in message_id:
        raise ValueError("Original .eml needs a valid Message-ID to link to Outlook")
    return message_id


def _outlook_message_id(item: Any) -> str:
    try:
        return str(item.PropertyAccessor.GetProperty(PR_INTERNET_MESSAGE_ID) or "").strip()
    except Exception:
        return ""


def find_original_message(account: Any, message_id: str, *, max_scan: int = 300,
                          folders: Iterable[int] = (OL_INBOX, OL_SENT)) -> Any:
    """Search authorized account store only; do not accept an ambiguous match."""
    if max_scan < 1 or max_scan > 2000:
        raise ValueError("Scan limit must be between 1 and 2000")
    found = []
    for kind in folders:
        folder = account.DeliveryStore.GetDefaultFolder(kind)
        items = folder.Items
        # Most recent items first to keep a bounded scan efficient.
        try:
            items.Sort("[ReceivedTime]", True)
        except Exception:
            pass
        item = items.GetFirst()
        seen = 0
        while item is not None and seen < max_scan:
            seen += 1
            if _outlook_message_id(item) == message_id:
                found.append(item)
            item = items.GetNext()
    if len(found) != 1:
        raise LookupError(
            "No unique matching Outlook message found in authorized Inbox/Sent Items; "
            "open the original manually in Classic Outlook (or move it into the Inbox)"
        )
    return found[0]


def resolve_account(outlook: Any, smtp: str) -> Any:
    smtp = smtp.strip().lower()
    if not smtp or "@" not in smtp:
        raise ValueError("PJS_OUTLOOK_ACCOUNT_SMTP must identify a dispatch account")
    accounts = [x for x in outlook.Session.Accounts
                if str(getattr(x, "SmtpAddress", "")).lower() == smtp]
    if len(accounts) != 1:
        raise LookupError("Authorized Outlook dispatch account missing or ambiguous")
    return accounts[0]


def prepare_from_attached_eml(eml: str | Path, details: DispatchDetails,
                              files: Iterable[str | Path] = (), *,
                              smtp: str | None = None, outlook: Any = None) -> Any:
    """Never calls Send; returns visible saved Reply All draft or stops safely."""
    details.validate()
    mid = source_message_id(eml)
    address = smtp or os.getenv("PJS_OUTLOOK_ACCOUNT_SMTP", "")
    if outlook is None:
        # Optional Windows-only import; no Outlook dependency when testing.
        import win32com.client  # type: ignore
        outlook = win32com.client.Dispatch("Outlook.Application")
    account = resolve_account(outlook, address)
    original = find_original_message(account, mid)
    return prepare_reply_all(original, details, files)
