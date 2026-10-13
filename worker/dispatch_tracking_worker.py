"""PJS independent OMS: authorized, read-only six-carrier tracking worker.

One approved website tracking request -> one atomic Supabase claim -> one carrier
lookup -> verified result, event and status. No automatic retry or message sending.
Requires the Windows office user, trusted local .env and independent Supabase.
"""
from __future__ import annotations

import logging
import os
import socket
import sys
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from uuid import UUID

from tracking_agent import TrackingJob, run_batch
from carriers import CarrierEngine

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
    "RTO Delivered", "Returned", "Cancelled", "Delayed", "Address Issue", "Not Found", "Pending"
}


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def heartbeat(db, owner: str, name: str, status: str, job_id: str | None = None,
              note: str = "") -> None:
    db.table("oms_tracking_workers").upsert({
        "owner_id": owner, "worker_name": name, "machine_name": socket.gethostname(),
        "status": status, "current_job_id": job_id, "last_seen_at": timestamp(),
        "details": {"mode": "carrier_lookup_only", "note": note[:160]},
    }).execute()


def claim(db, owner: str, name: str) -> dict | None:
    response = db.rpc("oms_claim_approved_tracking", {
        "p_worker_name": name, "p_owner_id": owner,
    }).execute()
    rows = response.data or []
    return rows[0] if rows else None


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


def execute_tracking(db, job: dict, owner: str, engine: CarrierEngine) -> dict:
    tracking = verify_job(db, job, owner)
    outcome = run_batch([tracking], engine, only_pending=False)[0]
    status = outcome.status
    valid = status in VALID_STATUSES and not outcome.error
    if not valid:
        return {"success": False, "status": "Error",
                "detail": "Carrier lookup failed or was inconclusive; review manually.",
                "delivery_date": ""}
    return {
        "success": True, "status": status,
        "detail": (outcome.detail or status)[:900],
        "delivery_date": outcome.delivery_date[:100],
    }


def finish(db, job: dict, name: str, result: dict) -> None:
    db.rpc("oms_finish_tracking", {
        "p_job_id": job["id"], "p_worker_name": name,
        "p_success": result["success"], "p_status": result["status"],
        "p_detail": result["detail"], "p_delivery_date": result["delivery_date"],
    }).execute()


def main() -> int:
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(BASE / ".env")
    settings = dict(os.environ)
    check_settings(settings)
    owner = settings["PJS_OFFICE_OWNER_USER_ID"].strip()
    name = settings.get("PJS_TRACKING_WORKER_NAME", DEFAULT_NAME).strip()
    live = settings.get("PJS_ENABLE_LIVE_TRACKING", "0").strip() == "1"
    poll = max(10, min(int(settings.get("PJS_TRACKING_POLL_SECONDS", "20")), 120))
    db = create_client(EXPECTED_URL, settings["SUPABASE_SERVICE_ROLE_KEY"].strip())
    engine = None
    LOGGER.info("PJS tracking worker launched (carrier lookups %s)",
                "ENABLED" if live else "PAUSED")
    try:
        while True:
            job = None
            try:
                if not live:
                    heartbeat(db, owner, name, "paused", note="Carrier lookup requires office acceptance.")
                else:
                    heartbeat(db, owner, name, "idle", note="Awaiting approved tracking jobs")
                    job = claim(db, owner, name)
                    if job:
                        heartbeat(db, owner, name, "busy", job["id"], "Carrier lookup in progress")
                        if engine is None:
                            engine = CarrierEngine(str(BASE / "tracking-screenshots"))
                        try:
                            result = execute_tracking(db, job, owner, engine)
                        except Exception as exc:
                            LOGGER.error("Tracking job validation/lookup failed (%s)", type(exc).__name__)
                            result = {"success": False, "status": "Error",
                                      "detail": "Tracking failed; operator must review the job.",
                                      "delivery_date": ""}
                        # A finish network failure MUST NOT cause a second carrier lookup.
                        finish(db, job, name, result)
                        LOGGER.info("Tracking job recorded with status %s", result["status"])
                        heartbeat(db, owner, name, "idle", note="Last lookup recorded")
            except Exception as exc:
                LOGGER.error("Worker/queue error (%s); check local configuration and logs",
                             type(exc).__name__)
                try:
                    heartbeat(db, owner, name, "error",
                              note="Tracking worker error; claimed jobs are not retried")
                except Exception:
                    pass
            finally:
                if engine is not None:
                    engine.close()
                    engine = None
            time.sleep(poll)
    except KeyboardInterrupt:
        LOGGER.info("Tracking worker stopped by operator")
        try:
            heartbeat(db, owner, name, "offline", note="Stopped by operator")
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
