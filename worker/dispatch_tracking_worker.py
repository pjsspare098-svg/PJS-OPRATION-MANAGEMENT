"""PJS OMS: owner-authorized, read-only carrier tracking and Shree Maruti batch worker.

- Every queued job is bound to its exact Supabase process UUID, Process No.,
  transporter, Tracking ID, owner and tracking_v1 approval.
- Up to 20 Shree Maruti jobs share ONE official multi-AWB website search.
  Per-AWB results are always finished individually through the existing
  transactional oms_finish_tracking RPC.
- Only genuinely Delivered Shree Maruti screenshots are stored as private
  trackingShotDoc files under their verified matching process.
- Unknown/ambiguous results never become "Delivered"; no job or failed
  screenshot is automatically retried. No DataDoc or Outlook action.
- Live browser access is DISABLED by default until a supervised office test.
"""
from __future__ import annotations

import logging
import os
import re
import socket
import sys
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from uuid import UUID, uuid4

from tracking_agent import TrackingJob, run_batch
from carriers import CarrierEngine, TrackResult, normalize_status

BASE = Path(__file__).resolve().parent
LOGS = BASE / "logs"
LOGS.mkdir(exist_ok=True)
LOGGER = logging.getLogger("pjs-dispatch-tracking")
if not LOGGER.handlers:
    LOGGER.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOGS / "dispatch-tracking.log", maxBytes=2_000_000,
                                  backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(handler)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(handler.formatter)
    LOGGER.addHandler(console)

EXPECTED_URL = "https://tbkytdktututiyeoqkwa.supabase.co"
DEFAULT_NAME = "pjs-carrier-tracking-office"
VERSION = "carrier_track_v1"
VALID_STATUSES = {
    "Delivered", "In Transit", "Out for Delivery", "Undelivered", "RTO",
    "RTO Delivered", "Returned", "Cancelled", "Delayed", "Address Issue",
    "Not Found", "Pending",
}
SCREENSHOT_ROOT = BASE / "tracking-screenshots"
MAX_SCREENSHOT = 5 * 1024 * 1024


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_shree_maruti(carrier: str) -> bool:
    normalized = re.sub(r"\s+", " ", str(carrier or "")).upper()
    return "SHREE MARUTI" in normalized or "ARHAM ENTERPRISE" in normalized


def check_settings(settings: dict[str, str]) -> None:
    if settings.get("SUPABASE_URL", "").strip().rstrip("/") != EXPECTED_URL:
        raise ValueError("Tracking worker refuses an unknown Supabase project")
    if not settings.get("SUPABASE_SERVICE_ROLE_KEY", "").strip():
        raise ValueError("Independent Supabase worker credential is missing")
    try:
        UUID(settings.get("PJS_OFFICE_OWNER_USER_ID", "").strip())
    except (ValueError, TypeError):
        raise ValueError("PJS_OFFICE_OWNER_USER_ID must be an OMS user UUID") from None
    name = settings.get("PJS_TRACKING_WORKER_NAME", DEFAULT_NAME).strip()
    if not (3 <= len(name) <= 100):
        raise ValueError("Tracking worker name must be between 3 and 100 characters")
    if settings.get("PJS_ENABLE_LIVE_TRACKING", "0").strip() not in ("0", "1"):
        raise ValueError("PJS_ENABLE_LIVE_TRACKING must be 0 or 1")
    try:
        batch = int(settings.get("PJS_SHREE_MARUTI_BATCH_SIZE", "20"))
    except (TypeError, ValueError):
        raise ValueError("PJS_SHREE_MARUTI_BATCH_SIZE must be an integer 1–20") from None
    if not (1 <= batch <= 20):
        raise ValueError("PJS_SHREE_MARUTI_BATCH_SIZE must be 1–20")


def heartbeat(db, owner: str, name: str, status: str, job_id: str | None = None,
              note: str = "") -> None:
    db.table("oms_tracking_workers").upsert({
        "owner_id": owner, "worker_name": name, "machine_name": socket.gethostname(),
        "status": status, "current_job_id": job_id, "last_seen_at": timestamp(),
        "details": {
            "mode": "shree_maruti_verified_batch_v2",
            "live_enabled": os.getenv("PJS_ENABLE_LIVE_TRACKING", "0") == "1",
            "batch_size": os.getenv("PJS_SHREE_MARUTI_BATCH_SIZE", "20"),
            "note": note[:160],
        },
    }).execute()


def claim(db, owner: str, name: str) -> dict | None:
    """Legacy single-job queue for non-Shree carriers and backward compatibility."""
    response = db.rpc("oms_claim_approved_tracking", {
        "p_worker_name": name, "p_owner_id": owner,
    }).execute()
    rows = response.data or []
    return rows[0] if rows else None


def claim_shree_batch(db, owner: str, name: str, size: int) -> list[dict]:
    response = db.rpc("oms_claim_approved_shree_maruti_batch", {
        "p_worker_name": name, "p_owner_id": owner, "p_limit": size,
    }).execute()
    return response.data or []


def verify_job(db, job: dict, owner: str) -> TrackingJob:
    """Revalidate immutable job identity and CURRENT process before Selenium."""
    if job.get("user_id") != owner or job.get("job_type") != "tracking":
        raise ValueError("Claimed job owner or type does not match worker")
    payload = job.get("payload") or {}
    if (payload.get("tracking_version") != VERSION
            or payload.get("approved_for_tracking") is not True):
        raise ValueError("Unapproved or legacy tracking request refused")
    if job.get("status") != "running":
        raise ValueError("Tracking job was not atomically claimed")

    rows = db.table("oms_processes").select(
        "id,user_id,process_no,data,deleted_at"
    ).eq("id", job["process_id"]).eq("user_id", owner).eq(
        "process_no", job["process_no"]
    ).is_("deleted_at", "null").limit(1).execute().data or []
    if len(rows) != 1:
        raise ValueError("Current process missing or inaccessible")
    data = rows[0].get("data") or {}
    if str(data.get("stage", "")).strip().lower() != "dispatch tracking":
        raise ValueError("Process no longer belongs to Dispatch Tracking")
    carrier = str(data.get("transporter") or "").strip()
    tracking_id = str(data.get("lr") or "").strip()
    if (carrier != str(payload.get("transporter", "")).strip()
            or tracking_id != str(payload.get("tracking_id", "")).strip()):
        raise ValueError("Carrier or LR changed since job approval")
    return TrackingJob(str(job["process_no"]), carrier, tracking_id)


def result_from_carrier(result: TrackResult) -> dict:
    status = normalize_status(result.status)
    if status not in VALID_STATUSES:
        return {"success": False, "status": "Error",
                "detail": "Carrier status was missing, ambiguous or unrecognized.",
                "delivery_date": "", "screenshot_path": ""}
    return {
        "success": True, "status": status,
        "detail": str(result.detail or status)[:900],
        "delivery_date": str(result.delivery_date or "")[:100],
        "screenshot_path": str(result.screenshot_path or "") if status == "Delivered" else "",
    }


def failed_lookup(message: str) -> dict:
    return {"success": False, "status": "Error",
            "detail": message[:900], "delivery_date": "", "screenshot_path": ""}


def execute_tracking(db, job: dict, owner: str, engine: CarrierEngine) -> dict:
    tracking = verify_job(db, job, owner)
    outcome = run_batch([tracking], engine, only_pending=False)[0]
    if outcome.error or outcome.status not in VALID_STATUSES:
        return failed_lookup("Carrier lookup failed or was inconclusive; review manually.")
    return {
        "success": True, "status": outcome.status,
        "detail": (outcome.detail or outcome.status)[:900],
        "delivery_date": outcome.delivery_date[:100],
        "screenshot_path": outcome.screenshot_path if outcome.status == "Delivered" else "",
    }


def execute_shree_batch(db, jobs: list[dict], owner: str, engine: CarrierEngine,
                        on_progress=None) -> dict[str, dict]:
    """Per-job outcomes, never positional result assignment from the carrier UI."""
    if not jobs or len(jobs) > 20:
        raise ValueError("Shree Maruti batch must have 1–20 jobs")
    outputs: dict[str, dict] = {}
    prepared: dict[str, TrackingJob] = {}
    for job in jobs:
        try:
            tracking = verify_job(db, job, owner)
            if not is_shree_maruti(tracking.transporter):
                raise ValueError("Non-Shree carrier was included in bulk claim")
            prepared[job["id"]] = tracking
        except Exception as exc:
            LOGGER.warning("Job %s cannot be processed: %s", job.get("id"), type(exc).__name__)
            outputs[job["id"]] = failed_lookup("Tracking job no longer matches current process; review.")
    if not prepared:
        return outputs
    requests = [(tracking.process_no, tracking.tracking_id)
                for tracking in prepared.values()]
    def browser_progress(done: int, total: int):
        if on_progress:
            on_progress(jobs[0]["id"], done, total)
    try:
        confirmed = engine.track_shree_maruti_batch(
            requests, on_progress=browser_progress if on_progress else None
        )
    except Exception as exc:
        LOGGER.error("Shree Maruti bulk browser error (%s); no automatic retry", type(exc).__name__)
        confirmed = {}
    for job_id, tracking in prepared.items():
        try:
            result = confirmed.get((tracking.process_no, tracking.tracking_id))
            outputs[job_id] = result_from_carrier(result) if result else failed_lookup(
                "Carrier did not return the exact Process No. and AWB pair.")
        except Exception as exc:
            LOGGER.warning("Tracking result mapping failed for job %s: %s", job_id, type(exc).__name__)
            outputs[job_id] = failed_lookup("Carrier returned an invalid result; manual review.")
        if on_progress:
            try:
                on_progress(job_id, len(outputs), len(jobs))
            except Exception:
                LOGGER.warning("Progress heartbeat unavailable; carrier result preserved")
    return outputs


def finish(db, job: dict, name: str, result: dict) -> None:
    response = db.rpc("oms_finish_tracking", {
        "p_job_id": job["id"], "p_worker_name": name,
        "p_success": result["success"], "p_status": result["status"],
        "p_detail": result["detail"], "p_delivery_date": result["delivery_date"],
    }).execute()
    if response.data is not True:
        raise RuntimeError("Tracking completion RPC did not confirm success")


def upload_verified_screenshot(db, job: dict, result: dict) -> bool:
    """Attach delivered AWB screenshot to the exact private OMS process.

    Called only AFTER the atomic finish RPC succeeded. Screenshot storage errors
    do not revert a correctly verified carrier result. Never load arbitrary
    paths supplied from a database job.
    """
    if not result["success"] or result["status"] != "Delivered":
        return False
    screenshot = str(result.get("screenshot_path") or "")
    if not screenshot:
        LOGGER.warning("Delivered tracking for process %s has no screenshot; review", job["process_no"])
        return False
    local_path = Path(screenshot).resolve()
    if not local_path.is_relative_to(SCREENSHOT_ROOT.resolve()):
        raise ValueError("Screenshot path outside authorized tracking-screenshots folder")
    if not local_path.is_file() or not (0 < local_path.stat().st_size <= MAX_SCREENSHOT):
        raise ValueError("Delivered screenshot is missing, empty or exceeds 5 MB")
    process_no = str(job["process_no"])
    awb = str((job.get("payload") or {}).get("tracking_id") or "")
    if not re.fullmatch(r"\d{5,10}", process_no):
        raise ValueError("Invalid Process No. for private screenshot")
    filename = f"Tracking_{process_no}_{re.sub(r'[^a-zA-Z0-9_-]', '_', awb)[:55]}_{uuid4().hex[:8]}.png"
    storage_path = f"{job['user_id']}/{job['process_id']}/{uuid4()}-{filename}"
    with local_path.open("rb") as body:
        db.storage.from_("oms-documents").upload(
            storage_path, body,
            file_options={"content-type": "image/png", "upsert": "false"},
        )
    try:
        db.table("oms_documents").insert({
            "process_id": job["process_id"], "user_id": job["user_id"],
            "kind": "trackingShotDoc", "name": filename, "path": storage_path,
        }).execute()
    except Exception:
        try:
            db.storage.from_("oms-documents").remove([storage_path])
        except Exception:
            LOGGER.warning("Unable to clean unlinked screenshot object for process %s", process_no)
        raise
    try:
        db.table("oms_events").insert({
            "user_id": job["user_id"], "process_id": job["process_id"],
            "process_no": process_no, "action": "Carrier delivered screenshot saved",
            "details": {"job_id": job["id"], "carrier": "SHREE MARUTI",
                        "tracking_id": awb, "document_name": filename},
        }).execute()
    except Exception:
        LOGGER.warning("Screenshot saved but audit event failed for process %s", process_no)
    LOGGER.info("Delivered screenshot saved to private Process %s", process_no)
    return True


def record_jobs(db, owner: str, name: str, jobs: list[dict],
                results: dict[str, dict]):
    """Finish each atomic claim independently; never re-run a carrier lookup."""
    for job in jobs:
        outcome = results.get(job["id"]) or failed_lookup("Tracking worker produced no result; review.")
        try:
            finish(db, job, name, outcome)
            LOGGER.info("Tracking saved: process %s, status %s",
                        job["process_no"], outcome["status"])
        except Exception as exc:
            # If a network failure happened after SQL commit, outcome is
            # uncertain; DO NOT issue finish twice or run the browser again.
            LOGGER.error("Tracking finish uncertain: process %s, job %s (%s). Manual reconciliation required.",
                         job["process_no"], job["id"], type(exc).__name__)
            continue
        if outcome["success"] and outcome["status"] == "Delivered":
            try:
                upload_verified_screenshot(db, job, outcome)
            except Exception as exc:
                LOGGER.error("Screenshot not attached for Process %s (%s); status saved, review manually",
                             job["process_no"], type(exc).__name__)


def main() -> int:
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(BASE / ".env")
    settings = dict(os.environ)
    check_settings(settings)
    owner = settings["PJS_OFFICE_OWNER_USER_ID"].strip()
    name = settings.get("PJS_TRACKING_WORKER_NAME", DEFAULT_NAME).strip()
    live = settings.get("PJS_ENABLE_LIVE_TRACKING", "0").strip() == "1"
    batch_size = int(settings.get("PJS_SHREE_MARUTI_BATCH_SIZE", "20"))
    poll = max(10, min(int(settings.get("PJS_TRACKING_POLL_SECONDS", "20")), 120))
    db = create_client(EXPECTED_URL, settings["SUPABASE_SERVICE_ROLE_KEY"].strip())
    engine = None
    LOGGER.info("PJS tracking worker started (carrier lookups %s, Shree batch %s)",
                "ENABLED" if live else "PAUSED", batch_size)
    try:
        while True:
            try:
                if not live:
                    heartbeat(db, owner, name, "paused", note="No carrier lookups while live=0")
                else:
                    heartbeat(db, owner, name, "idle", note="Awaiting approved carrier tracking jobs")
                    jobs = claim_shree_batch(db, owner, name, batch_size)
                    if not jobs:
                        individual = claim(db, owner, name)
                        jobs = [individual] if individual else []
                    if jobs:
                        heartbeat(db, owner, name, "busy", jobs[0]["id"],
                                  f"Tracking {len(jobs)} authorized job(s)")
                        if engine is None:
                            engine = CarrierEngine(str(SCREENSHOT_ROOT))
                        if len(jobs) > 1 or is_shree_maruti(
                            str((jobs[0].get("payload") or {}).get("transporter") or "")
                        ):
                            def progress(_job_id, completed, total):
                                if completed % 3 == 0 or completed == total:
                                    heartbeat(db, owner, name, "busy", jobs[0]["id"],
                                              f"Shree Maruti batch results {completed}/{total}")
                            outcomes = execute_shree_batch(db, jobs, owner, engine, on_progress=progress)
                        else:
                            try:
                                outcomes = {jobs[0]["id"]: execute_tracking(db, jobs[0], owner, engine)}
                            except Exception as exc:
                                LOGGER.error("Tracking validation/browser failed (%s)", type(exc).__name__)
                                outcomes = {jobs[0]["id"]: failed_lookup("Tracking error; operator review required.")}
                        record_jobs(db, owner, name, jobs, outcomes)
                        heartbeat(db, owner, name, "idle", note="Carrier tracking outcomes saved")
            except Exception as exc:
                LOGGER.error("Worker/queue error (%s); no automatic retry of claimed jobs",
                             type(exc).__name__)
                try:
                    heartbeat(db, owner, name, "error",
                              note="Tracking worker error; manually reconcile running jobs")
                except Exception:
                    pass
                # A broken Selenium browser must be recreated for a future,
                # newly approved job; no currently claimed job is retried.
                if engine is not None:
                    engine.close()
                    engine = None
            time.sleep(poll)
    except KeyboardInterrupt:
        LOGGER.info("Tracking worker stopped by operator")
    finally:
        if engine is not None:
            engine.close()
        try:
            heartbeat(db, owner, name, "offline", note="Stopped by operator")
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
