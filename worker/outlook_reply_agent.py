"""PJS Outlook Reply All draft preparation (Windows Classic Outlook adapter).

Safety boundaries:
- Never parses, stores, guesses, or replaces email recipients.
- Calls ReplyAll() on the EXACT Outlook message supplied by the caller.
- Saves and displays a draft; intentionally does not implement Send().
- Opening the stored .eml and claiming the cloud job require a separate,
  supervised Windows integration before live dispatch can be enabled.
"""
from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class DispatchDetails:
    process: str
    party: str
    so: str
    invoice: str
    transporter: str = ""
    lr: str = ""
    ready: str = ""
    product_name: str = ""
    sales_person: str = ""

    def validate(self) -> None:
        missing = [
            name for name, value in (
                ("Process No.", self.process),
                ("Party Name", self.party),
                ("SO No.", self.so),
                ("Invoice No.", self.invoice),
            ) if not str(value).strip()
        ]
        if missing:
            raise ValueError("Missing required dispatch data: " + ", ".join(missing))


def dispatch_html(details: DispatchDetails) -> str:
    """Escape ERP/Supabase values before inserting into an Outlook HTML reply."""
    details.validate()
    rows = (
        ("Party Name", details.party),
        ("Process No.", details.process),
        ("Sales Order No.", details.so),
        ("Product Name", details.product_name or "Not specified"),
        ("Sales Person", details.sales_person or "Not specified"),
        ("Invoice No.", details.invoice),
        ("Transporter", details.transporter or "Pending"),
        ("LR / Docket", details.lr or "Pending"),
        ("Ready for Dispatch", details.ready or "Pending"),
    )
    cells = "".join(
        "<tr><td style='padding:4px 12px 4px 0'><b>" + escape(label) +
        "</b></td><td>" + escape(str(value)) + "</td></tr>"
        for label, value in rows
    )
    return (
        "<div style='font-family:Arial,sans-serif;font-size:11pt'>"
        "<p>Dear Customer,</p>"
        "<p>Please find the dispatch details for your order:</p>"
        "<table>" + cells + "</table>"
        "<p>Regards,<br>PJS Dispatch Team</p></div><br>"
    )


def prepare_reply_all(
    original_message: Any,
    details: DispatchDetails,
    attachment_paths: Iterable[str | Path] = (),
) -> Any:
    """Create a reviewable Reply All draft from an already verified Outlook item.

    Original message must be the *attached conversation opened in Classic Outlook*.
    The caller must establish that identity before calling this function.
    Recipients are created by Outlook's ReplyAll() alone, never supplied here.
    This function deliberately does not send mail.
    """
    details.validate()
    if not callable(getattr(original_message, "ReplyAll", None)):
        raise TypeError("The verified source must be an Outlook message supporting ReplyAll().")
    files = tuple(Path(p) for p in attachment_paths)
    for path in files:
        if not path.is_file():
            raise FileNotFoundError(f"Required dispatch attachment not available: {path.name}")
    reply = original_message.ReplyAll()
    if reply is None:
        raise RuntimeError("Outlook could not create a Reply All draft.")
    original_reply_html = str(getattr(reply, "HTMLBody", "") or "")
    reply.HTMLBody = dispatch_html(details) + original_reply_html
    for path in files:
        reply.Attachments.Add(str(path.resolve()))
    reply.Save()
    reply.Display()
    return reply
