"""Read-only bridge from independent OMS process/documents to an Outlook Reply All plan.

Never scans filenames on network shares, extracts recipient addresses, or sends.
Used *after* an authorized office worker claims a matching email_reply job.
The job claim/acknowledgement RPC for email_reply is not installed yet.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Any
import re

from outlook_reply_agent import DispatchDetails

KINDS = ("invoiceDoc", "einvoiceDoc", "ebillDoc", "lrDoc")
MAX_DOCUMENT_BYTES = 15_000_000


@dataclass(frozen=True)
class DispatchPlan:
    details: DispatchDetails
    conversation: Path
    attachments: tuple[Path, ...]
    missing: tuple[str, ...]


def verify_document(doc: dict, *, process_id: str) -> None:
    if doc.get("process_id") != process_id:
        raise ValueError("Attachment belongs to a different process")
    owner = str(doc.get("user_id") or "")
    path = str(doc.get("path") or "")
    if not owner or not path.startswith(f"{owner}/{process_id}/") or ".." in Path(path).parts:
        raise ValueError("Invalid independent OMS private attachment path")
    if not doc.get("id"):
        raise ValueError("Missing attachment identity")


def build_plan(job: dict, process: dict, documents: list[dict],
               download: Callable[[str], bytes], destination: Path) -> DispatchPlan:
    if job.get("job_type") != "email_reply":
        raise ValueError("Only email_reply jobs are permitted")
    if job.get("process_id") != process.get("id") or str(job.get("process_no")) != str(process.get("process_no")):
        raise ValueError("Process mismatch, cannot prepare Outlook reply")
    if str(job.get("user_id")) != str(process.get("user_id")):
        raise ValueError("Worker job is not owned by the process creator")
    if process.get("deleted_at"):
        raise ValueError("Process has been deleted")
    source_id = str((job.get("payload") or {}).get("email_document_id") or "")
    originals = [d for d in documents if d.get("id") == source_id and d.get("kind") == "emailDoc"]
    if not source_id or len(originals) != 1:
        raise ValueError("Exactly one explicit original Outlook email document must be selected")
    for doc in documents:
        verify_document(doc, process_id=str(process["id"]))
    info = process.get("data") or {}
    details = DispatchDetails(
        process=str(process.get("process_no") or ""),
        party=str(process.get("party_name") or ""),
        so=str(process.get("sales_order_no") or ""),
        invoice=str(info.get("invoice") or ""),
        transporter=str(info.get("transporter") or ""),
        lr=str(info.get("lr") or ""),
        ready=str(info.get("ready") or ""),
        product_name=str(info.get("productName") or ""),
        sales_person=str(info.get("sales") or ""),
        po=str(info.get("po") or ""),
        po_date=str(info.get("poDate") or ""),
        invoice_date=str(info.get("invoiceDate") or ""),
        courier_date=str(info.get("courierDate") or ""),
        weight=str(info.get("weight") or ""),
    )
    details.validate()
    destination.mkdir(parents=True, exist_ok=True)

    def write_doc(doc: dict, target: Path) -> Path:
        blob = download(doc["path"])
        if not isinstance(blob, (bytes, bytearray)) or len(blob) > MAX_DOCUMENT_BYTES or len(blob) == 0:
            raise ValueError("Private attachment invalid or too large")
        if target.suffix == ".pdf" and not blob.startswith(b"%PDF-"):
            raise ValueError("Uploaded invoice/transport document is not a PDF")
        target.write_bytes(blob)
        return target

    source = originals[0]
    if not str(source.get("name") or "").lower().endswith(".eml"):
        raise ValueError("Original Outlook conversation must be a saved .eml")
    eml = write_doc(source, destination / "original-conversation.eml")

    # Multiple files of the same type must not result in duplicate attachments.
    latest: dict[str, dict] = {}
    for doc in sorted(documents, key=lambda d: str(d.get("created_at") or ""), reverse=True):
        kind = doc.get("kind")
        if kind in KINDS and kind not in latest:
            latest[kind] = doc
    chosen: list[Path] = []
    missing: list[str] = []
    for kind in KINDS:
        if kind not in latest:
            missing.append(kind)
            continue
        doc = latest[kind]
        if not str(doc.get("name") or "").lower().endswith(".pdf"):
            raise ValueError("Dispatch attachment must be a verified PDF: " + kind)
        chosen.append(write_doc(doc, destination / (kind + ".pdf")))
    # Missing files are explicitly reported; the preparer never sends.
    return DispatchPlan(details, eml, tuple(chosen), tuple(missing))
