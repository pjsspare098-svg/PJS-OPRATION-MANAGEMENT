import unittest

from start_worker import ALLOWED, WorkerAlreadyRunning, acquire_worker_lock


class StartWorkerTests(unittest.TestCase):
    def test_only_four_known_workers_including_datadoc_proof(self):
        self.assertEqual(
            ALLOWED,
            {"independent_worker.py", "outlook_draft_worker.py", "dispatch_tracking_worker.py", "datadoc_proof_worker.py"},
        )
        with self.assertRaises(ValueError):
            acquire_worker_lock("../untrusted.py")

    def test_duplicate_process_lock_and_release(self):
        for entry in ("dispatch_tracking_worker.py", "datadoc_proof_worker.py"):
            with self.subTest(worker=entry):
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
