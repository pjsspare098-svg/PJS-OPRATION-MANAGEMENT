"""Launch only approved PJS worker entrypoints, including isolated Python 3.13 installs."""
from pathlib import Path
import runpy
import sys

BASE = Path(__file__).resolve().parent
ALLOWED = {
    "independent_worker.py",
    "outlook_draft_worker.py",
    "dispatch_tracking_worker.py",
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ALLOWED:
        raise SystemExit("Usage: python start_worker.py [independent_worker.py | outlook_draft_worker.py | dispatch_tracking_worker.py]")
    entry = sys.argv[1]
    sys.path.insert(0, str(BASE))
    sys.argv = [str(BASE / entry), *sys.argv[2:]]
    runpy.run_path(str(BASE / entry), run_name="__main__")
