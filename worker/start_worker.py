"""Run approved Windows office workers with a process-wide single-instance lock.

The launcher and Windows startup shortcut may be clicked multiple times. This
guard prevents duplicate consumers for the SAME local worker script. A held
lock automatically releases if a Python process exits or crashes.
"""
from __future__ import annotations

import os
from pathlib import Path
import runpy
import sys

BASE = Path(__file__).resolve().parent
# The approved launcher starts only DataDoc portal submission workers.
# Legacy scripts remain in git for audit/reference but cannot be launched here.
ALLOWED = {
    "independent_worker.py",
    "datadoc_proof_worker.py",
}


class WorkerAlreadyRunning(RuntimeError):
    """This Windows user already started the selected worker entrypoint."""


def acquire_worker_lock(entry: str):
    if entry not in ALLOWED:
        raise ValueError("Unknown worker entrypoint")
    lock_dir = BASE / "logs"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_file = lock_dir / (entry.removesuffix(".py") + ".lock")
    handle = lock_file.open("a+b")
    try:
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (OSError, IOError) as exc:
        handle.close()
        raise WorkerAlreadyRunning(
            "This PJS worker is already running. Use Control Tower to verify its heartbeat."
        ) from exc
    return handle


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ALLOWED:
        raise SystemExit("Usage: python start_worker.py [independent_worker.py | datadoc_proof_worker.py]")
    entry = sys.argv[1]
    sys.path.insert(0, str(BASE))
    try:
        handle = acquire_worker_lock(entry)
    except WorkerAlreadyRunning as exc:
        print(str(exc))
        return
    try:
        sys.argv = [str(BASE / entry), *sys.argv[2:]]
        runpy.run_path(str(BASE / entry), run_name="__main__")
    finally:
        handle.close()


if __name__ == "__main__":
    main()
