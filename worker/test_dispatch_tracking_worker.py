import unittest
from unittest.mock import Mock
from carriers import TrackResult
from dispatch_tracking_worker import (
    VERSION, check_settings, execute_tracking, verify_job,
)

OWNER = "12345678-1234-4234-8234-123456789abc"


def approved():
    return {
        "id": "job-a", "user_id": OWNER, "process_id": "process-a",
        "process_no": "292168", "job_type": "tracking", "status": "running",
        "payload": {
            "tracking_version": VERSION, "approved_for_tracking": True,
            "transporter": "VRL", "tracking_id": "554433"
        },
    }


def database(data=None):
    db = Mock()
    row = {
        "id": "process-a", "user_id": OWNER, "process_no": "292168",
        "deleted_at": None,
        "data": data or {"stage": "Dispatch Tracking", "transporter": "VRL", "lr": "554433"},
    }
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value.execute.return_value.data = [row]
    return db


class TrackingWorkerTests(unittest.TestCase):
    def test_valid_settings(self):
        check_settings({"SUPABASE_URL": "https://tbkytdktututiyeoqkwa.supabase.co",
                        "SUPABASE_SERVICE_ROLE_KEY": "local-test-not-a-real-key",
                        "PJS_OFFICE_OWNER_USER_ID": OWNER})

    def test_refuses_wrong_supabase_project(self):
        with self.assertRaisesRegex(ValueError, "unknown Supabase"):
            check_settings({"SUPABASE_URL": "https://example.supabase.co",
                            "SUPABASE_SERVICE_ROLE_KEY": "test",
                            "PJS_OFFICE_OWNER_USER_ID": OWNER})

    def test_only_approved_versioned_jobs(self):
        job = approved()
        job["payload"]["approved_for_tracking"] = False
        with self.assertRaisesRegex(ValueError, "Unapproved"):
            verify_job(database(), job, OWNER)

    def test_rejects_stale_lr(self):
        with self.assertRaisesRegex(ValueError, "Carrier or LR changed"):
            verify_job(database({"stage": "Dispatch Tracking", "transporter": "VRL", "lr": "other"}),
                       approved(), OWNER)

    def test_rejects_other_stage(self):
        with self.assertRaisesRegex(ValueError, "no longer"):
            verify_job(database({"stage": "Complete", "transporter": "VRL", "lr": "554433"}),
                       approved(), OWNER)

    def test_delivered_verified(self):
        engine = Mock()
        engine.track.return_value = TrackResult("Delivered", "DELIVERED", "12 Oct 2026")
        result = execute_tracking(database(), approved(), OWNER, engine)
        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "Delivered")
        engine.track.assert_called_once_with("VRL", "554433", "292168")

    def test_not_found_not_delivered(self):
        engine = Mock()
        engine.track.side_effect = LookupError("Carrier did not find docket")
        result = execute_tracking(database(), approved(), OWNER, engine)
        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "Not Found")

    def test_inconclusive_does_not_count_as_delivery(self):
        engine = Mock()
        engine.track.return_value = TrackResult("Error", "Tracking service error")
        result = execute_tracking(database(), approved(), OWNER, engine)
        self.assertFalse(result["success"])


if __name__ == "__main__":
    unittest.main()
