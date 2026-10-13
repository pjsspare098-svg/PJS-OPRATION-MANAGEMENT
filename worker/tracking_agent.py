"""PJS tracking coordinator translated from modTrackingEngineMain/TrackingDataBridge.

Runs the six Selenium adapters from carriers.py without Excel, with stable
record keys and separate error/not-found/success outcomes. It has no Supabase
write permissions: callers explicitly persist *verified* results in their
authorized job workflow. Carrier lookups are read-only.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Any
import argparse
import json
import re

from carriers import CarrierEngine, normalize_status

DONE = {"delivered", "rto delivered", "returned", "cancelled"}
RETRYABLE = ("timed out", "timeout", "temporarily unavailable", "service unavailable", "connection")


@dataclass(frozen=True)
class TrackingJob:
    process_no: str
    transporter: str
    tracking_id: str
    current_status: str = ""

    def __post_init__(self):
        if not self.process_no.strip() or not self.tracking_id.strip() or not self.transporter.strip():
            raise ValueError("Process No., transporter and tracking ID are required")
        if len(self.process_no) > 50 or len(self.tracking_id) > 120:
            raise ValueError("Oversized tracking identifier refused")


@dataclass(frozen=True)
class TrackingOutcome:
    process_no: str
    transporter: str
    tracking_id: str
    status: str
    detail: str
    delivery_date: str = ""
    screenshot_path: str = ""
    checked_at: str = ""
    error: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


def pending(job: TrackingJob) -> bool:
    s = (job.current_status or "").strip().lower()
    return not s or s in {"pending", "not checked", "error", "not found", "in transit", "out for delivery", "delayed", "undelivered"}


def run_batch(jobs: Iterable[TrackingJob], engine: Any, *, only_pending: bool = True,
              on_result: Callable[[TrackingOutcome], None] | None = None) -> list[TrackingOutcome]:
    # Cache one result per exact carrier/process/consignment and refuse duplicate
    # lookups within one batch. No HTTP requests for skipped/done rows.
    seen: dict[tuple[str, str, str], TrackingOutcome] = {}
    results: list[TrackingOutcome] = []
    for job in jobs:
        if only_pending and not pending(job):
            continue
        key = (job.process_no.strip(), job.transporter.strip().upper(), job.tracking_id.strip())
        if key in seen:
            results.append(seen[key])
            continue
        now = datetime.now(timezone.utc).isoformat()
        try:
            response = engine.track(job.transporter, job.tracking_id, job.process_no)
            reported = str(getattr(response, "status", "") or "").strip()
            raw = str(getattr(response, "detail", "") or reported).strip()
            # Prefer extracted carrier status over timeline detail, which may
            # mention an old unsuccessful delivery while the current status changed.
            status = normalize_status(reported or raw)
            if status in {"Error", "Unknown"}:
                raise ValueError("Carrier did not provide a recognized current shipment status")
            result = TrackingOutcome(
                job.process_no, job.transporter, job.tracking_id, status, raw,
                str(getattr(response, "delivery_date", "") or ""),
                str(getattr(response, "screenshot_path", "") or ""), now,
            )
        except LookupError as exc:
            result = TrackingOutcome(job.process_no, job.transporter, job.tracking_id,
                                     "Not Found", "Carrier reports no result for this tracking ID", checked_at=now)
        except Exception as exc:
            # Preserve unknown outcomes separately; never record as delivered.
            result = TrackingOutcome(job.process_no, job.transporter, job.tracking_id,
                                     "Error", "Carrier lookup requires review", checked_at=now,
                                     error=f"{type(exc).__name__}: {exc}"[:350])
        seen[key] = result
        results.append(result)
        if on_result is not None:
            on_result(result)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="PJS safe batch carrier status tracker")
    parser.add_argument("--input", type=Path, required=True, help="JSON list of process_no/transporter/tracking_id")
    parser.add_argument("--output", type=Path, required=True, help="JSON outcome file (never modifies source)")
    parser.add_argument("--screenshots", type=Path, default=Path("tracking-screenshots"))
    parser.add_argument("--live", action="store_true", help="Explicit permission to open external carrier websites")
    parser.add_argument("--all", action="store_true", help="Include records with already completed status")
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(data, list) or len(data) > 500:
        parser.error("Input must be a JSON list with at most 500 rows")
    jobs = [TrackingJob(str(row["process_no"]), str(row["transporter"]),
                        str(row["tracking_id"]), str(row.get("current_status", ""))) for row in data]
    if not args.live:
        parser.error("Dry-run safety: pass --live only after checking the carrier identifiers and websites")
    engine = CarrierEngine(str(args.screenshots))
    try:
        results = run_batch(jobs, engine, only_pending=not args.all)
    finally:
        engine.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps([r.as_dict() for r in results], indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
