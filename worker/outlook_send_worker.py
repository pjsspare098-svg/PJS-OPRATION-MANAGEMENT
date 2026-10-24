"""PJS OMS Outlook Reply All SEND worker (Classic Outlook, authorized Windows PC).

LIVE SENDING IS OFF BY DEFAULT. Requires:
  - signed-in Classic Outlook with the configured PJS dispatch SMTP account;
  - owner-approved single-process request on independent PJS Supabase;
  - exact .eml Message-ID match in THAT account's Inbox/Sent Items;
  - stored invoice and LR PDFs, a fully populated dispatch message;
  - PJS_ENABLE_LIVE_EMAIL_SEND=1 on the operator's Windows PC.
Never retries an uncertain result. A failed DB acknowledgement AFTER .Send may
leave the request Running: check Sent Items before taking ANY further action.
"""
from __future__ import annotations

from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID
import logging
import os
import socket
import sys
import time

from oms_dispatch_bridge import build_plan
from outlook_mailbox_bridge import source_message_id,resolve_account,find_original_message
from outlook_reply_agent import DispatchDetails,dispatch_html

BASE=Path(__file__).resolve().parent
LOGS=BASE/"logs"
LOGS.mkdir(parents=True,exist_ok=True)
LOG=logging.getLogger("pjs-outlook-send")
if not LOG.handlers:
    LOG.setLevel(logging.INFO)
    h=RotatingFileHandler(LOGS/"outlook-send.log",maxBytes=2_000_000,backupCount=4,encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(h)
    stream=logging.StreamHandler(sys.stdout);stream.setFormatter(h.formatter);LOG.addHandler(stream)

PROJECT_HOST="tbkytdktututiyeoqkwa.supabase.co"
VERSION="outlook_send_v1"
DEFAULT_NAME="pjs-outlook-send-office"


def now()->str:
    return datetime.now(timezone.utc).isoformat()


def check_settings(settings:dict[str,str])->None:
    if settings.get("SUPABASE_URL","").rstrip("/")!="https://"+PROJECT_HOST:
        raise ValueError("Email sender only supports the independent PJS Supabase project")
    if len(settings.get("SUPABASE_SERVICE_ROLE_KEY","").strip())<50:
        raise ValueError("Missing/placeholder independent Supabase service role credential")
    try: UUID(settings.get("PJS_OFFICE_OWNER_USER_ID",""))
    except (ValueError,TypeError): raise ValueError("Set PJS_OFFICE_OWNER_USER_ID to the OMS owner's UUID") from None
    if settings.get("PJS_ENABLE_LIVE_EMAIL_SEND","0") not in ("0","1"):
        raise ValueError("PJS_ENABLE_LIVE_EMAIL_SEND must be 0 or 1")
    if settings.get("PJS_ENABLE_LIVE_EMAIL_SEND","0")=="1":
        if os.name!="nt":raise ValueError("Live sending requires an authorized Windows Outlook desktop")
        smtp=settings.get("PJS_OUTLOOK_ACCOUNT_SMTP","").strip()
        if not smtp or "@" not in smtp:raise ValueError("Set PJS_OUTLOOK_ACCOUNT_SMTP privately before enabling live sends")


def heartbeat(db,owner:str,name:str,state:str,request_id:str|None=None,live:bool=False)->None:
    db.table("oms_outlook_workers").upsert({
       "owner_id":owner,"worker_name":name,
       "machine_name":socket.gethostname(),"status":state,
       "last_seen_at":now(),"current_job_id":request_id,
       "details":{"mode":"email_send","live_enabled":live,"no_auto_retry":True}
    }).execute()


def claim(db,owner:str,name:str)->dict|None:
    result=db.rpc("oms_claim_email_send",{
        "p_owner_id":owner,"p_worker_name":name
    }).execute()
    values=result.data or []
    return values[0] if values else None


def finish(db,request_id:str,name:str,sent:bool,message:str)->None:
    response=db.rpc("oms_finish_email_send",{
        "p_request_id":request_id,"p_worker_name":name,
        "p_send_invoked":bool(sent),"p_detail":message[:350]
    }).execute()
    if response.data is not True:
        raise RuntimeError("Email acknowledgement was not confirmed in PJS database")


def _same_timestamp(left:str,right:str)->bool:
    def parse(value:str)->datetime:
        result=datetime.fromisoformat(str(value).replace("Z","+00:00"))
        if result.tzinfo is None:raise ValueError("Missing timestamp timezone")
        return result.astimezone(timezone.utc)
    return parse(left)==parse(right)


def submit_reply_all(original_path:Path,details:DispatchDetails,attachments:tuple[Path,...],*,smtp:str,outlook=None)->None:
    """This method is the ONLY code path that invokes Outlook Send.

    Outlook's ReplyAll() determines recipients from an actual verified
    message already present in the explicitly authorized account.
    No addresses are parsed from the .eml, supplied by PJS OMS, or logged.
    """
    details.validate()
    if outlook is None:
        import win32com.client # type: ignore
        outlook=win32com.client.Dispatch("Outlook.Application")
    account=resolve_account(outlook,smtp)
    message_id=source_message_id(original_path)
    original=find_original_message(account,message_id,max_scan=700)
    paths=tuple(Path(p) for p in attachments)
    if len(paths)<2 or len(set(paths))!=len(paths):
        raise ValueError("Exactly selected Invoice and LR PDFs are required")
    for file in paths:
        if file.suffix.lower()!=".pdf" or not file.is_file() or not file.read_bytes().startswith(b"%PDF-"):
            raise ValueError("Verified PDF attachment missing or invalid")
    if not callable(getattr(original,"ReplyAll",None)):
        raise ValueError("Outlook original cannot produce a Reply All")
    reply=original.ReplyAll()
    if reply is None:raise RuntimeError("Outlook did not create Reply All")
    # Never use a different account or silently default to a personal mailbox.
    reply.SendUsingAccount=account
    recipients=getattr(reply,"Recipients",None)
    if recipients is None or int(recipients.Count)<1 or not recipients.ResolveAll():
        raise ValueError("Outlook Reply All recipient resolution failed; review manually")
    reply.HTMLBody=dispatch_html(details)+str(getattr(reply,"HTMLBody","") or "")
    for file in paths:
        reply.Attachments.Add(str(file.resolve()))
    # Safe Outlook draft copy is created before the irreversible Send.
    reply.Save()
    # IMPORTANT: .Send() submits to Outlook, not proof of customer delivery.
    reply.Send()


def execute_send(db,request:dict,*,live_enabled:bool=False,smtp:str="",send=submit_reply_all)->str:
    """Fail closed; never send without explicit current approval and all files."""
    if not live_enabled:
        raise ValueError("Live sending remains disabled on this Windows PC")
    if request.get("status")!="running" or not request.get("id") or not request.get("worker_name"):
        raise ValueError("Not a claimed email sending request")
    owner=str(request.get("owner_id") or "")
    try: UUID(owner); UUID(str(request.get("process_id")));UUID(str(request.get("original_document_id")))
    except (ValueError,TypeError):raise ValueError("Invalid approved request identity") from None
    rows=(db.table("oms_processes")
      .select("id,user_id,process_no,party_name,sales_order_no,data,deleted_at,updated_at,team_id")
      .eq("id",request["process_id"]).eq("process_no",request["process_no"])
      .eq("user_id",owner).limit(1).execute().data or [])
    if len(rows)!=1:raise ValueError("Matching owner process is missing")
    proc=rows[0]
    if proc.get("team_id") or proc.get("deleted_at") or (proc.get("data") or {}).get("stage")!="Email to Client":
        raise ValueError("Process is no longer a personal Email to Client record")
    if not _same_timestamp(proc.get("updated_at",""),request.get("process_updated_at","")):
        raise ValueError("Process changed after email approval. Review current fields and cancel/reconcile, do not send")
    selected={
        str(request.get("original_document_id")):"emailDoc",
        str(request.get("invoice_document_id")):"invoiceDoc",
        str(request.get("lr_document_id")):"lrDoc",
    }
    if len(selected)!=3:raise ValueError("Original, Invoice and LR must be separate document IDs")
    docs=(db.table("oms_documents")
      .select("id,process_id,user_id,kind,name,path,created_at,deleted_at")
      .eq("process_id",proc["id"]).eq("user_id",owner)
      .is_("deleted_at","null").execute().data or [])
    byid={str(d["id"]):d for d in docs}
    for doc_id,kind in selected.items():
        if doc_id not in byid or byid[doc_id].get("kind")!=kind:
            raise ValueError("Approved attachment is missing, deleted, or changed kind: "+kind)
    # Pass ONLY the documents whose identities the owner explicitly approved.
    # om_dispatch_bridge will verify private owner/path, PDF headers and details.
    job={"job_type":"email_reply","process_id":proc["id"],"process_no":proc["process_no"],
         "user_id":owner,"payload":{"email_document_id":request["original_document_id"]}}
    with TemporaryDirectory(prefix="pjs-email-send-") as tmp:
        plan=build_plan(job,proc,list(byid[i] for i in selected),lambda path:db.storage.from_("oms-documents").download(path),Path(tmp))
        if "invoiceDoc" in plan.missing or "lrDoc" in plan.missing:
            raise ValueError("Required dispatch PDFs missing")
        if len(plan.attachments)!=2:
            raise ValueError("Expected one exact Invoice and one LR document")
        # No Send before every identity, permission and completeness check.
        send(plan.conversation,plan.details,plan.attachments,smtp=smtp)
    return "Outlook Reply All Send invoked for verified process. Check Outlook Sent Items and delivery failures."


def run()->None:
    if os.name!="nt":raise SystemExit("Classic Outlook COM sending is supported only on the authorized Windows office PC")
    from dotenv import load_dotenv
    from supabase import create_client
    import pythoncom # type: ignore
    load_dotenv(BASE/".env")
    settings=dict(os.environ)
    check_settings(settings)
    owner=settings["PJS_OFFICE_OWNER_USER_ID"].strip()
    name=settings.get("PJS_EMAIL_WORKER_NAME",DEFAULT_NAME).strip()
    if not 3<=len(name)<=100:raise ValueError("PJS_EMAIL_WORKER_NAME must be 3-100 characters")
    poll=max(10,min(120,int(settings.get("PJS_EMAIL_POLL_SECONDS","20"))))
    live=settings.get("PJS_ENABLE_LIVE_EMAIL_SEND","0")=="1"
    db=create_client(settings["SUPABASE_URL"],settings["SUPABASE_SERVICE_ROLE_KEY"])
    pythoncom.CoInitialize()
    LOG.info("Outlook SEND worker started - enabled=%s",live)
    try:
        while True:
            try:
                if not live:
                    heartbeat(db,owner,name,"paused",live=False)
                    time.sleep(poll);continue
                heartbeat(db,owner,name,"idle",live=True)
                request=claim(db,owner,name)
                if request:
                    LOG.info("Claimed approved email send Process %s; request %s",request["process_no"],request["id"])
                    heartbeat(db,owner,name,"busy",request["id"],live=True)
                    try:
                        message=execute_send(db,request,live_enabled=live,smtp=settings["PJS_OUTLOOK_ACCOUNT_SMTP"])
                    except Exception as exc:
                        LOG.exception("Outlook send uncertain for process %s; NEVER auto-retry",request["process_no"])
                        # Even a failure before Send is blocked until manual review.
                        # If acknowledgement itself fails, Running is left untouched.
                        finish(db,request["id"],name,False,type(exc).__name__+": "+str(exc)[:280])
                    else:
                        # If DB acknowledgement fails after .Send(), leave Running.
                        # The next worker start will NOT claim it again.
                        finish(db,request["id"],name,True,message)
                        LOG.info("Outlook Send invoked process %s",request["process_no"])
                time.sleep(poll)
            except KeyboardInterrupt:raise
            except Exception:
                LOG.exception("Email worker cycle error. No reclaim of Running requests")
                try: heartbeat(db,owner,name,"error",live=live)
                except Exception: pass
                time.sleep(max(poll,30))
    except KeyboardInterrupt:
        LOG.info("Outlook SEND worker stopped")
    finally:
        try:heartbeat(db,owner,name,"offline",live=live)
        except Exception: pass
        pythoncom.CoUninitialize()

if __name__=="__main__":run()
