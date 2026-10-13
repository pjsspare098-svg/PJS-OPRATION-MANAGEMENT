"""One-command, read-only PJS Windows worker preflight.

Reads the EXISTING local .env, verifies the independent Supabase credential
without printing it, checks the three Python modules, and shows activation flags.
It never claims jobs, opens Outlook, logs into DataDoc, sends mail, or submits bills.
"""
from __future__ import annotations
import importlib.util
import os
import sys
from pathlib import Path
from uuid import UUID

BASE = Path(__file__).resolve().parent
EXPECTED_URL = "https://tbkytdktututiyeoqkwa.supabase.co"
MODULES = (
    "carriers", "tracking_agent", "dispatch_tracking_worker",
    "independent_worker", "outlook_draft_worker", "start_worker",
)
SWITCHES = ("PJS_ENABLE_LIVE_DATADOC", "PJS_ENABLE_OUTLOOK_DRAFT",
            "PJS_ENABLE_LIVE_TRACKING", "PJS_ENABLE_LIVE_DATADOC_EMAIL")


def preflight() -> int:
    from dotenv import dotenv_values
    from supabase import create_client

    settings_file = BASE / ".env"
    if not settings_file.is_file():
        print("FAIL: worker/.env missing. Copy .env.example and configure it locally.")
        return 1
    local = dotenv_values(settings_file)
    problems = []
    print("PJS OMS OFFICE PREFLIGHT (read-only)")
    print("Python:", sys.version.split()[0])
    if sys.version_info < (3, 12):
        problems.append("Python 3.12+ required")
    sys.path.insert(0, str(BASE))
    for name in MODULES:
        ok = importlib.util.find_spec(name) is not None
        print(("OK:   " if ok else "FAIL: ") + name + ".py")
        if not ok:
            problems.append("Missing " + name + ".py in worker folder")
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PJS_OFFICE_OWNER_USER_ID"):
        existing = (os.environ.get(key) or "").strip()
        saved = (local.get(key) or "").strip()
        if existing and saved and existing != saved:
            print("WARNING: Windows environment overrides .env for " + key)
            problems.append(key + ": conflicting Windows environment value")
    url = (local.get("SUPABASE_URL") or "").strip().rstrip("/")
    if url != EXPECTED_URL:
        problems.append("SUPABASE_URL must match the independent OMS Supabase project")
    key = (local.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if len(key) < 40 or "PASTE_" in key:
        problems.append("Independent Supabase service-role key missing or placeholder")
    owner = (local.get("PJS_OFFICE_OWNER_USER_ID") or "").strip()
    try:
        UUID(owner)
    except (ValueError, TypeError):
        problems.append("PJS_OFFICE_OWNER_USER_ID is not a valid UUID")
    for name in SWITCHES:
        val = (local.get(name) or "0").strip()
        print(name + ": " + ("ENABLED" if val == "1" else "PAUSED" if val == "0" else "INVALID"))
        if val not in ("0", "1"):
            problems.append(name + " must be 0 or 1")
    if problems:
        for problem in problems:
            print("FAIL:", problem)
        return 1
    print("Checking read-only Supabase access to oms_office_workers ...")
    try:
        db = create_client(url, key)
        db.table("oms_office_workers").select("owner_id").limit(1).execute()
    except Exception as exc:
        print("FAIL: Supabase connection / credentials rejected (" + type(exc).__name__ + ")")
        print("Check the service-role key from the SAME independent OMS Supabase project.")
        return 1
    print("PASS: Independent Supabase credentials authenticated; no jobs were claimed.")
    print("NEXT: Start workers with START_OFFICE_WORKERS.bat and verify fresh heartbeats.")
    return 0


if __name__ == "__main__":
    raise SystemExit(preflight())
