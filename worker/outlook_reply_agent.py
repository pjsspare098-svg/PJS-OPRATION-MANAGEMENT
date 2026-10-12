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
from datetime import date
import re
import math
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
    po: str = ""
    po_date: str = ""
    invoice_date: str = ""
    courier_date: str = ""
    weight: str = ""

    def validate(self) -> None:
        required = (
            ("Process No.", self.process),
            ("Party Name", self.party),
            ("SO No.", self.so),
            ("PO No.", self.po),
            ("PO Date", self.po_date),
            ("Invoice No.", self.invoice),
            ("Invoice Date", self.invoice_date),
            ("Courier", self.transporter),
            ("Doc No. / LR", self.lr),
            ("Courier Date", self.courier_date),
            ("Box Weight (Kgs)", self.weight),
        )
        missing = [label for label, value in required if not str(value).strip()]
        if missing:
            raise ValueError("Missing dispatch information: " + ", ".join(missing))
        amount = re.sub(r"\s*(?:kg|kgs|kilogram|kilograms)$", "", str(self.weight).strip(), flags=re.I).strip()
        try:
            value=float(amount)
            if not math.isfinite(value) or value <= 0:
                raise ValueError("Box weight must be positive")
        except ValueError:
            raise ValueError("Box weight must be a positive number in Kgs") from None


def _display_date(raw: str) -> str:
    value = str(raw or "").strip()
    try:
        return date.fromisoformat(value).strftime("%d/%m/%Y")
    except ValueError:
        return value


def dispatch_html(details: DispatchDetails) -> str:
    """PressureJet courier-dispatch HTML placed above the original reply thread."""
    details.validate()
    rows = (
        ("PO No.", details.po),
        ("PO Date", _display_date(details.po_date)),
        ("Invoice No.", details.invoice),
        ("Invoice Date", _display_date(details.invoice_date)),
        ("Courier", details.transporter),
        ("Doc No.", details.lr),
        ("Courier Date", _display_date(details.courier_date)),
        ("Box Weight (Kgs)", details.weight),
    )
    cells = "".join(
        "<tr><th scope='row' style='text-align:left;padding:7px 12px;"
        "border:1px solid #cad4df;background:#f5f8fc'>" + escape(label) +
        "</th><td style='padding:7px 12px;border:1px solid #cad4df'>" +
        escape(str(value)) + "</td></tr>"
        for label, value in rows
    )
    notes = (
        "Scan copy of the courier receipt is attached for your reference.",
        "Please check the box weight at the time of delivery to avoid any issue of short supply after receipt of material.",
        "If the box is received in damaged condition, please take photographs immediately and note the damage on the transporter LR to claim loss from the transporter.",
        'For future reference, maintenance videos are available on our website: '
        '<a href="http://pressurejet.com/ManageVideo/Default.aspx">http://pressurejet.com/ManageVideo/Default.aspx</a>',
        "Please record a proper video while unboxing the package to help resolve any concerns about damaged goods or short supply.",
    )
    items = "".join("<li style='padding-bottom:6px'>" + x + "</li>" for x in notes)
    return (
        "<div style='font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#273746'>"
        "<p>Dear Sir,</p>"
        "<p>This is with reference to your below-mentioned purchase order.</p>"
        "<p>Please note that we have dispatched your spares/pump as per the details below:</p>"
        "<table style='border-collapse:collapse;width:100%;max-width:670px'>" + cells + "</table>"
        "<ul style='padding-left:24px'>" + items + "</ul>"
        "<p>Kindly confirm upon receipt of the material.</p>"
        "<p>Regards,<br><strong>CHETAN SOLANKI</strong><br>"
        "PressureJet Systems Pvt. Ltd.<br>"
        "21-24 Panchratna Industrial Estate,<br>"
        "Ode-Pirana Road, Paldi Kankaj,<br>"
        "Ahmedabad – 382427, Gujarat, India<br>"
        "Mobile: +91-9376022359<br>"
        "E-Mail: <a href='mailto:Dispatch@pressurejet.com'>Dispatch@pressurejet.com</a><br>"
        "Website: <a href='https://www.pressurejet.com/'>www.pressurejet.com</a></p>"
        "</div><br>"
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
