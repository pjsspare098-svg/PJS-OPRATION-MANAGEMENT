"""Build the one ZIP DataDoc expects for a bill transaction.

All input PDF bytes come from owner/process-verified independent Supabase storage,
not arbitrary browser-supplied paths. A local temporary directory is used and
removed after the Selenium transaction ends.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, is_zipfile

ORDERED = (
    ("invoiceDoc", "Invoice.pdf"),
    ("einvoiceDoc", "E-Invoice.pdf"),
    ("ebillDoc", "E-Way-Bill.pdf"),
)
MAX_PDF_SIZE = 15 * 1024 * 1024
MAX_ZIP_SIZE = 35 * 1024 * 1024


def build_bill_zip(process_no: str, pdf_files: dict[str, str], output_dir: Path) -> tuple[Path, tuple[str, ...]]:
    """Generate and locally validate a ZIP of the current process's PDFs."""
    if not process_no.isdecimal() or not 5 <= len(process_no) <= 9:
        raise ValueError("A numeric DataDoc Process No. is required for packaging.")
    if "invoiceDoc" not in pdf_files:
        raise ValueError("Invoice PDF is required before executing a DataDoc Bill Submit.")
    extras = set(pdf_files) - {x[0] for x in ORDERED}
    if extras:
        raise ValueError("Unsupported document category in DataDoc ZIP.")
    output_dir = Path(output_dir)
    if not output_dir.is_dir():
        raise ValueError("ZIP output directory does not exist.")
    zip_path = output_dir / f"{process_no}_BillSubmit.zip"
    included: list[str] = []
    total = 0
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED, compresslevel=6) as bundle:
        for kind, name in ORDERED:
            if kind not in pdf_files:
                continue
            source = Path(pdf_files[kind])
            if not source.is_file() or source.suffix.lower() != ".pdf":
                raise ValueError(kind + " must reference a locally downloaded PDF.")
            data = source.read_bytes()
            if not data.startswith(b"%PDF-") or len(data) > MAX_PDF_SIZE or not data.strip():
                raise ValueError(kind + " is not a valid PDF under the 15 MB file limit.")
            total += len(data)
            if total > MAX_ZIP_SIZE:
                raise ValueError("Bill package exceeds the allowed 35 MB uncompressed size.")
            bundle.writestr(name, data)
            included.append(name)
    if not is_zipfile(zip_path) or zip_path.stat().st_size > MAX_ZIP_SIZE:
        raise ValueError("Generated DataDoc bill ZIP failed integrity/size verification.")
    with ZipFile(zip_path, "r") as verify:
        if verify.namelist() != included or verify.testzip() is not None:
            raise ValueError("Generated ZIP entries did not verify.")
        for name in included:
            if not verify.read(name).startswith(b"%PDF-"):
                raise ValueError("ZIP contains an invalid PDF.")
    return zip_path, tuple(included)
