"""DataDoc tracking screenshot proof: separate, approval-only Windows worker.

Reads only jobs atomically approved for tracking proof in the independent OMS.
Never automatically retries a claimed job or accepts a screenshot from another
process. Disabled by default. Browser runs on the office network, NOT Vercel.
"""
from __future__ import annotations
import logging
import os
import re
import socket
import sys
import tempfile
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

from dotenv import load_dotenv
from supabase import create_client
from datadoc import DataDocAgent

BASE=Path(__file__).resolve().parent
load_dotenv(BASE / ".env")
(LOGDIR:=BASE / "logs").mkdir(parents=True,exist_ok=True)
LOGGER=logging.getLogger("pjs-datadoc-proof")
LOGGER.setLevel(logging.INFO)
if not LOGGER.handlers:
    handler=RotatingFileHandler(LOGDIR/"datadoc-proof.log",maxBytes=2_000_000,
                                backupCount=3,encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(handler)
    console=logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(console)

VERSION="datadoc_tracking_proof_v1"
WORKER_NAME="pjs-datadoc-proof-office"

def timestamp()->str:
    return datetime.now(timezone.utc).isoformat()

def config()->dict[str,str]:
    settings={k:os.getenv(k,"").strip() for k in (
        "SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","PJS_OFFICE_OWNER_USER_ID",
        "PJS_ENABLE_LIVE_DATADOC_PROOF","PJS_DATADOC_URL",
        "PJS_DATADOC_USERNAME","PJS_DATADOC_PASSWORD","PJS_PROOF_POLL_SECONDS")}
    if settings["SUPABASE_URL"]!="https://tbkytdktututiyeoqkwa.supabase.co":
        raise ValueError("Refusing non-independent Supabase project")
    if not settings["SUPABASE_SERVICE_ROLE_KEY"]:
        raise ValueError("Missing server-only Supabase credential")
    UUID(settings["PJS_OFFICE_OWNER_USER_ID"])
    if settings["PJS_ENABLE_LIVE_DATADOC_PROOF"]=="1" and not all(
      settings[k] for k in ("PJS_DATADOC_URL","PJS_DATADOC_USERNAME","PJS_DATADOC_PASSWORD")
    ):
        raise ValueError("DataDoc office URL and credentials must be set locally")
    return settings

def reachable(url:str)->bool:
    try:
        target=urlparse(url or "http://192.168.0.18:8082")
        if target.scheme not in ("http","https") or not target.hostname:return False
        with socket.create_connection((target.hostname,target.port or 80),timeout=4):return True
    except (OSError,ValueError):return False

def heartbeat(db,owner:str,state:str,live:bool,job_id:str|None=None,note:str="")->None:
    db.table("oms_datadoc_proof_workers").upsert({
        "owner_id":owner,"worker_name":WORKER_NAME,"machine_name":socket.gethostname(),
        "status":state,"last_seen_at":timestamp(),"current_job_id":job_id,
        "details":{"proof_version":VERSION,"live_enabled":live,"note":note[:150]}
    }).execute()

def claim(db,owner:str)->dict|None:
    response=db.rpc("oms_claim_datadoc_tracking_proof",{
        "p_worker_name":WORKER_NAME,"p_owner_id":owner
    }).execute()
    return (response.data or [None])[0]

def verify(db,job:dict,owner:str)->tuple[dict,dict]:
    if job.get("user_id")!=owner or job.get("job_type")!="delivery_proof_submit" or job.get("status")!="running":
        raise ValueError("Proof job owner/type/claim mismatch")
    payload=job.get("payload") or {}
    if payload.get("proof_version")!=VERSION or payload.get("approved_for_proof") is not True:
        raise ValueError("Job was not approved for tracking proof")
    screenshot_id=str(payload.get("screenshot_document_id") or "")
    UUID(screenshot_id)
    res=db.table("oms_processes").select("id,user_id,process_no,deleted_at,data").eq(
        "id",job["process_id"]).eq("user_id",owner).eq("process_no",job["process_no"]).limit(1).execute()
    row=(res.data or [None])[0]
    if not row or row.get("deleted_at"):
        raise ValueError("Process is no longer accessible")
    data=row.get("data") or {}
    if str(data.get("stage","")).strip().lower() not in ("dispatch tracking","delivery proof"):
        raise ValueError("Proof process moved to another stage")
    if (data.get("credit")!=payload.get("credit_type") or data.get("sales")!=payload.get("sales_person")):
        raise ValueError("Credit category or Sales Person changed after approval")
    if not re.fullmatch(r"\d{5,9}",str(row["process_no"])):
        raise ValueError("Invalid process number")
    doc_response=db.table("oms_documents").select(
        "id,process_id,user_id,kind,name,path").eq("id",screenshot_id).eq(
        "process_id",row["id"]).eq("user_id",owner).eq(
        "kind","trackingShotDoc").limit(1).execute()
    doc=(doc_response.data or [None])[0]
    if not doc:
        raise ValueError("Approved tracking screenshot is not accessible")
    if not str(doc.get("path","")).startswith(owner+"/"+str(row["id"])+"/"):
        raise ValueError("Tracking screenshot storage path does not match owner and process")
    if not re.search(r"\.(png|jpe?g)$",str(doc.get("name","")),re.I):
        raise ValueError("Tracking proof attachment must be PNG or JPEG")
    return row,doc

def retrieve_image(db,doc:dict,folder:Path)->Path:
    target=folder/("proof.jpg" if doc["name"].lower().endswith((".jpg",".jpeg")) else "proof.png")
    data=db.storage.from_("oms-documents").download(doc["path"])
    if not data or len(data)>5*1024*1024:
        raise ValueError("Empty or oversized proof file; nothing was sent")
    if not (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")):
        raise ValueError("Invalid screenshot image bytes; nothing was sent")
    target.write_bytes(data)
    return target

def run_job(db,job:dict,owner:str)->tuple[bool,str,str,str]:
    process,doc=verify(db,job,owner)
    agent=None
    try:
        with tempfile.TemporaryDirectory(prefix="pjs-datadoc-proof-") as temp:
            image=retrieve_image(db,doc,Path(temp))
            agent=DataDocAgent()
            result=agent.submit_tracking_proof(
                str(process["process_no"]),str(process["data"]["credit"]),
                str(process["data"]["sales"]),str(image.resolve()))
            if result.skipped:
                raise ValueError("Skipped tracking proof must never be reported as submitted")
            if not result.success:
                return False,result.error or "DataDoc submission not confirmed",result.next_work or "",result.next_user or ""
            return True,result.action,result.next_work or "",result.next_user or ""
    finally:
        if agent:
            agent.close()

def finish(db,job:dict,success:bool,details:str,next_work:str="",next_user:str="")->None:
    db.rpc("oms_finish_datadoc_tracking_proof",{
        "p_job_id":job["id"],"p_worker_name":WORKER_NAME,
        "p_success":bool(success),"p_detail":details[:1000],
        "p_next_work":next_work[:150],"p_next_user":next_user[:150]
    }).execute()

def main()->int:
    env=config()
    owner=env["PJS_OFFICE_OWNER_USER_ID"]
    live=env["PJS_ENABLE_LIVE_DATADOC_PROOF"]=="1"
    poll=max(10,min(120,int(env["PJS_PROOF_POLL_SECONDS"] or "20")))
    db=create_client(env["SUPABASE_URL"],env["SUPABASE_SERVICE_ROLE_KEY"])
    LOGGER.info("DataDoc proof worker started, live enabled: %s",live)
    try:
        while True:
            try:
                if not live:
                    heartbeat(db,owner,"paused",False,note="Safe mode — enable after acceptance test")
                elif not reachable(env["PJS_DATADOC_URL"]):
                    heartbeat(db,owner,"paused",True,note="Office DataDoc unreachable; queue preserved")
                else:
                    heartbeat(db,owner,"idle",True,note="Awaiting approved proof requests")
                    job=claim(db,owner)
                    if job:
                        heartbeat(db,owner,"busy",True,job_id=job["id"],note="Approved proof")
                        try:
                            ok,details,next_work,next_user=run_job(db,job,owner)
                        except Exception as e:
                            LOGGER.exception("Proof job requires manual review: %s",job["id"])
                            ok,details,next_work,next_user=False,f"{type(e).__name__}: {e}","",""
                        try:
                            finish(db,job,ok,details,next_work,next_user)
                        except Exception:
                            LOGGER.exception("Could not finalize claimed proof %s; do not retry automatically",job["id"])
                        LOGGER.info("Proof job %s: %s",job["id"],"confirmed" if ok else "needs review")
            except Exception:
                LOGGER.exception("Proof worker poll issue; claimed jobs are never reset to queued")
            time.sleep(poll)
    except KeyboardInterrupt:
        LOGGER.info("Proof worker stopped by operator")
        return 0

if __name__=="__main__":
    raise SystemExit(main())
