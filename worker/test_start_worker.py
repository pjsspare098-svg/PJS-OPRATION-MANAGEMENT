import unittest

from start_worker import ALLOWED, WorkerAlreadyRunning, acquire_worker_lock


class StartWorkerTests(unittest.TestCase):
    def test_only_three_known_workers(self):
        self.assertEqual(
            ALLOWED,
            {"independent_worker.py", "outlook_draft_worker.py", "dispatch_tracking_worker.py"},
        )
        with self.assertRaises(ValueError):
            acquire_worker_lock("../untrusted.py")

    def test_duplicate_process_lock_and_release(self):
        entry = "dispatch_tracking_worker.py"
        first = acquire_worker_lock(entry)
        try:
            with self.assertRaises(WorkerAlreadyRunning):
                acquire_worker_lock(entry)
        finally:
            first.close()
        again = acquire_worker_lock(entry)
        again.close()


if __name__ == "__main__":
    unittest.main()
