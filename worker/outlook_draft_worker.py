"""PJS Independent OMS - dedicated Windows Classic Outlook draft worker.

Claims only explicitly approved outlook_draft_v1 requests from independent
Supabase. Opens the attached original message by verified Message-ID in the
configured Outlook mailbox, saves/displays a Reply All draft, NEVER sends.
A stopped/crashed worker never auto-reclaims an in-progress draft.
"""
from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID
import os
import socket
import sys
import time

from oms_dispatch_bridge import build_plan
from outlook_mailbox_bridge import prepare_from_attached_eml

BASE = Path(__file__).resolve().parent
LOGS = BASE / "logs"
LOGS.mkdir(exist_ok=True)
log = logging.getLogger("pjs-outlook-draft-worker")
if not log.handlers:
    log.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOGS / "outlook-draft-worker.log",maxBytes=2_000_000,backupCount=4,encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(handler)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(handler.formatter)
    log.addHandler(console)

WORKER_DEFAULT = "pjs-outlook-draft-office"
PROJECT_HOST = "tbkytdktututiyeoqkwa.supabase.co"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def check_settings(env: dict[str, str]) -> None:
    if PROJECT_HOST not in env.get("SUPABASE_URL", ""):
        raise ValueError("Refusing to connect Outlook worker to a non-independent OMS project")
    if not env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip():
        raise ValueError("Independent Supabase service credential missing in local .env")
    owner = env.get("PJS_OFFICE_OWNER_USER_ID", "").strip()
    try:
        UUID(owner)
    except (ValueError, TypeError):
        raise ValueError("PJS_OFFICE_OWNER_USER_ID must be an OMS user UUID") from None
    name = env.get("PJS_OUTLOOK_WORKER_NAME",WORKER_DEFAULT).strip()
    if not 3 <= len(name) <= 100:
        raise ValueError("Outlook worker name must be 3-100 characters")
    if env.get("PJS_ENABLE_OUTLOOK_DRAFT", "0") == "1":
        smtp = env.get("PJS_OUTLOOK_ACCOUNT_SMTP", "")
        if "@" not in smtp or not smtp.strip():
            raise ValueError("Set authorized PJS_OUTLOOK_ACCOUNT_SMTP before enabling Outlook automation")


def heartbeat(db, owner: str, worker_name: str, status: str, job_id: str | None = None, note: str = ""):
    db.table("oms_outlook_workers").upsert({
        "owner_id": owner, "worker_name": worker_name,
        "machine_name": socket.gethostname(), "status": status,
        "current_job_id": job_id, "last_seen_at": now(),
        "details": {"mode":"draft_only", "email_sent":False,"note":note[:180]}
    }).execute()


def claim(db, owner: str, worker_name: str) -> dict | None:
    result = db.rpc("oms_claim_outlook_draft", {
        "p_owner_id": owner, "p_worker_name": worker_name
    }).execute()
    rows = result.data or []
    return rows[0] if rows else None


def finish(db, job: dict, worker_name: str, ok: bool, detail: str):
    db.rpc("oms_finish_outlook_draft", {
        "p_job_id": job["id"],"p_worker_name":worker_name,
        "p_success":bool(ok),"p_details":detail[:1000]
    }).execute()


def execute_draft(db, job: dict, *, prepare=prepare_from_attached_eml) -> str:
    """Never sends. Do not retry automatically when Outlook partially succeeded."""
    if job.get("job_type") != "email_reply":
        raise ValueError("Only Outlook email_reply jobs may be processed")
    payload=job.get("payload") or {}
    if payload.get("automation_version")!="outlook_draft_v1" or payload.get("approved_for_draft") is not True or payload.get("auto_send") is not False:
        raise ValueError("Outlook draft approval/version mismatch")
    row=db.table("oms_processes").select("id,user_id,process_no,party_name,sales_order_no,data,deleted_at").eq(
        "id",job["process_id"]).eq("process_no",job["process_no"]).limit(1).execute().data or []
    if len(row)!=1:
        raise ValueError("Source process not found; do not prepare email")
    proc=row[0]
    docs=db.table("oms_documents").select(
        "id,process_id,user_id,kind,name,path,created_at"
    ).eq("process_id",proc["id"]).order("created_at",desc=True).execute().data or []
    def download(path:str)->bytes:
        return db.storage.from_("oms-documents").download(path)
    with TemporaryDirectory(prefix="pjs-outlook-draft-") as temp:
        plan=build_plan(job,proc,docs,download,Path(temp))
        required_missing=[kind for kind in ("invoiceDoc","lrDoc") if kind in plan.missing]
        if required_missing:
            raise ValueError("Required dispatch PDFs missing: "+", ".join(required_missing))
        if plan.missing:
            log.info("Draft may be missing optional PDFs for process %s: %s",job["process_no"],",".join(plan.missing))
        # The bridge matches original .eml Message-ID to an authorized Outlook MailItem.
        # The reply agent calls ReplyAll, Save, Display. It never calls Send.
        prepare(plan.conversation,plan.details,plan.attachments)
    return "Reply All DRAFT saved and opened in Classic Outlook. NOT sent; verify recipients and attachments before sending."


def main() -> int:
    if os.name!="nt":
        raise SystemExit("This Outlook COM worker runs only on signed-in Windows desktops")
    # Lazy imports make the module mock-testable without credentials.
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv(BASE/".env")
    settings=dict(os.environ)
    check_settings(settings)
    import pythoncom  # type: ignore
    owner=settings["PJS_OFFICE_OWNER_USER_ID"].strip()
    name=settings.get("PJS_OUTLOOK_WORKER_NAME",WORKER_DEFAULT).strip()
    poll=max(10,min(120,int(settings.get("PJS_OUTLOOK_POLL_SECONDS","20"))))
    live=settings.get("PJS_ENABLE_OUTLOOK_DRAFT","0")=="1"
    db=create_client(settings["SUPABASE_URL"],settings["SUPABASE_SERVICE_ROLE_KEY"])
    pythoncom.CoInitialize()
    log.info("Outlook DRAFT worker started (automatic email sending disabled)")
    try:
        while True:
            try:
                if not live:
                    heartbeat(db,owner,name,"paused",note="Draft execution disabled locally")
                    time.sleep(poll)
                    continue
                heartbeat(db,owner,name,"idle",note="Outlook draft worker ready")
                job=claim(db,owner,name)
                if job:
                    log.info("Claimed Outlook draft for process %s job %s",job["process_no"],job["id"])
                    heartbeat(db,owner,name,"busy",job["id"],note="Preparing Reply All draft")
                    try:
                        message=execute_draft(db,job)
                        # If acknowledgement fails, leave RUNNING, do not reclaim automatically.
                        finish(db,job,name,True,message)
                        log.info("Draft prepared process %s (not sent)",job["process_no"])
                    except Exception as exc:
                        log.exception("Outlook draft needs review for process %s",job["process_no"])
                        finish(db,job,name,False,"Draft may exist; check Outlook before retry: "+type(exc).__name__+": "+str(exc)[:450])
                time.sleep(poll)
            except KeyboardInterrupt:
                raise
            except Exception:
                log.exception("Worker/queue error: no automatic reclaim of running email jobs")
                try: heartbeat(db,owner,name,"error",note="Worker error; check local log")
                except Exception: pass
                time.sleep(max(poll,30))
    except KeyboardInterrupt:
        log.info("Outlook draft worker stopped")
    finally:
        try: heartbeat(db,owner,name,"offline",note="Stopped")
        except Exception: pass
        pythoncom.CoUninitialize()
    return 0


if __name__=="__main__":
    raise SystemExit(main())
