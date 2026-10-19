"""Shree Maruti Supabase queue mapping and delivered proof storage tests (offline)."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from carriers import TrackResult
import dispatch_tracking_worker as worker

OWNER = "12345678-1234-4234-8234-123456789abc"


def job(index, awb, process=None):
    process = process or str(295840 + index)
    return {
        "id": "tracking-job-" + str(index), "user_id": OWNER,
        "process_id": "process-uuid-" + str(index),
        "process_no": process, "job_type": "tracking", "status": "running",
        "payload": {
            "tracking_version": worker.VERSION, "approved_for_tracking": True,
            "transporter": "SHREE MARUTI", "tracking_id": awb,
        },
    }


def database_for(jobs):
    db = Mock()
    query = (db.table.return_value.select.return_value.eq.return_value.eq
             .return_value.eq.return_value.is_.return_value.limit.return_value.execute)
    query.side_effect = [
        SimpleNamespace(data=[{
            "id": j["process_id"], "user_id": OWNER,
            "process_no": j["process_no"], "deleted_at": None,
            "data": {"stage": "Dispatch Tracking", "transporter": "SHREE MARUTI",
                     "lr": j["payload"]["tracking_id"]},
        }]) for j in jobs
    ]
    db.rpc.return_value.execute.return_value.data = True
    return db


class ShreeSupabaseMappingTests(unittest.TestCase):
    def test_exact_job_order_does_not_assign_another_awb_result(self):
        jobs = [job(1, "00123456789"), job(2, "98765432100"), job(3, "33333333333")]
        db = database_for(jobs)
        engine = Mock()
        # Deliberately reverse the carrier response order.
        engine.track_shree_maruti_batch.return_value = {
            (jobs[2]["process_no"], "33333333333"): TrackResult("Returned", "RETURNED TO SENDER"),
            (jobs[1]["process_no"], "98765432100"): TrackResult("Delivered", "DELIVERED", "19 OCT", "/test.png"),
            (jobs[0]["process_no"], "00123456789"): TrackResult("In Transit", "PICKED UP"),
        }
        outcomes = worker.execute_shree_batch(db, jobs, OWNER, engine)
        self.assertEqual(outcomes[jobs[0]["id"]]["status"], "In Transit")
        self.assertEqual(outcomes[jobs[1]["id"]]["status"], "Delivered")
        self.assertEqual(outcomes[jobs[2]["id"]]["status"], "Returned")
        self.assertEqual(outcomes[jobs[1]["id"]]["screenshot_path"], "/test.png")
        self.assertEqual(outcomes[jobs[0]["id"]]["screenshot_path"], "")
        engine.track_shree_maruti_batch.assert_called_once_with(
            [(x["process_no"], x["payload"]["tracking_id"]) for x in jobs],
            on_progress=None
        )

    def test_missing_exact_pair_fails_not_delivered(self):
        jobs = [job(1, "00123456789"), job(2, "98765432100")]
        db = database_for(jobs)
        engine = Mock()
        engine.track_shree_maruti_batch.return_value = {
            (jobs[0]["process_no"], "00123456789"): TrackResult("Delivered", "DELIVERED")
        }
        outcomes = worker.execute_shree_batch(db, jobs, OWNER, engine)
        self.assertTrue(outcomes[jobs[0]["id"]]["success"])
        self.assertFalse(outcomes[jobs[1]["id"]]["success"])
        self.assertEqual(outcomes[jobs[1]["id"]]["status"], "Error")

    def test_stale_tracking_id_rejected_before_browser(self):
        claimed = job(1, "00123456789")
        db = database_for([claimed])
        query = (db.table.return_value.select.return_value.eq.return_value.eq
                 .return_value.eq.return_value.is_.return_value.limit.return_value.execute)
        query.side_effect = None
        query.return_value.data = [{
            "data": {"stage": "Dispatch Tracking", "transporter": "SHREE MARUTI",
                     "lr": "different-awb"}
        }]
        engine = Mock()
        outcome = worker.execute_shree_batch(db, [claimed], OWNER, engine)
        self.assertFalse(outcome[claimed["id"]]["success"])
        engine.track_shree_maruti_batch.assert_not_called()

    def test_unrecognized_status_never_updates_record_as_delivered(self):
        outcome = worker.result_from_carrier(TrackResult("Shipment ???", "Unknown carrier text"))
        self.assertFalse(outcome["success"])
        self.assertEqual(outcome["status"], "Error")
        self.assertEqual(worker.result_from_carrier(TrackResult("Undelivered", "Delivery failed"))["status"], "Undelivered")

    def test_batch_claim_bounded_via_new_owner_scoped_rpc(self):
        db = Mock()
        db.rpc.return_value.execute.return_value.data = [job(1, "12345678")]
        output = worker.claim_shree_batch(db, OWNER, "authorized-tracker", 20)
        self.assertEqual(len(output), 1)
        db.rpc.assert_called_once_with("oms_claim_approved_shree_maruti_batch", {
            "p_worker_name": "authorized-tracker", "p_owner_id": OWNER, "p_limit": 20,
        })

    def test_one_job_finish_writes_exact_rpc_identity(self):
        db = Mock()
        db.rpc.return_value.execute.return_value.data = True
        target = job(1, "00123456789")
        result = {"success": True, "status": "In Transit", "detail": "Booked at Surat",
                  "delivery_date": "", "screenshot_path": ""}
        worker.finish(db, target, "tracking-office", result)
        db.rpc.assert_called_once_with("oms_finish_tracking", {
            "p_job_id": target["id"], "p_worker_name": "tracking-office",
            "p_success": True, "p_status": "In Transit", "p_detail": "Booked at Surat",
            "p_delivery_date": "",
        })

    def test_attach_only_verified_delivered_screenshot_to_own_process(self):
        with tempfile.TemporaryDirectory() as root, patch.object(worker, "SCREENSHOT_ROOT", Path(root)):
            target = job(1, "00123456789")
            file = Path(root) / "SHREE_MARUTI" / "295841_00123456789.png"
            file.parent.mkdir()
            file.write_bytes(b"\x89PNG\r\n\x1a\n" + b"test-screenshot")
            db = Mock()
            result = {"success": True, "status": "Delivered", "screenshot_path": str(file)}
            self.assertTrue(worker.upload_verified_screenshot(db, target, result))
            insert_args = db.table.return_value.insert.call_args_list[0].args[0]
            self.assertEqual(insert_args["user_id"], OWNER)
            self.assertEqual(insert_args["process_id"], target["process_id"])
            self.assertEqual(insert_args["kind"], "trackingShotDoc")
            self.assertTrue(insert_args["path"].startswith(OWNER + "/" + target["process_id"] + "/"))
            self.assertIn("295841", insert_args["name"])
            self.assertIn("00123456789", insert_args["name"])
            db.storage.from_.return_value.upload.assert_called_once()
            self.assertFalse(worker.upload_verified_screenshot(db, target, {
                "success": True, "status": "In Transit", "screenshot_path": str(file)
            }))

    def test_refuse_screenshot_outside_worker_private_folder(self):
        with tempfile.TemporaryDirectory() as root, patch.object(worker, "SCREENSHOT_ROOT", Path(root)):
            target = job(1, "00123456789")
            with self.assertRaisesRegex(ValueError, "outside authorized"):
                worker.upload_verified_screenshot(Mock(), target, {
                    "success": True, "status": "Delivered", "screenshot_path": "/tmp/not-ours.png"
                })

    def test_finish_failure_never_retries_or_uploads_unconfirmed_result(self):
        jobs = [job(1, "123456789")]
        db = Mock()
        db.rpc.return_value.execute.side_effect = RuntimeError("Network response uncertain")
        with patch.object(worker, "upload_verified_screenshot") as screenshot:
            worker.record_jobs(db, OWNER, "office", jobs, {
                jobs[0]["id"]: {
                    "success": True, "status": "Delivered", "detail": "Delivered",
                    "delivery_date": "", "screenshot_path": "/example.png",
                }
            })
            screenshot.assert_not_called()
            self.assertEqual(db.rpc.call_count, 1)

    def test_safe_default_live_mode_and_batch_setting(self):
        worker.check_settings({
            "SUPABASE_URL": worker.EXPECTED_URL,
            "SUPABASE_SERVICE_ROLE_KEY": "not-real",
            "PJS_OFFICE_OWNER_USER_ID": OWNER,
            "PJS_ENABLE_LIVE_TRACKING": "0",
            "PJS_SHREE_MARUTI_BATCH_SIZE": "20",
        })
        with self.assertRaisesRegex(ValueError, "must be 1"):
            worker.check_settings({
                "SUPABASE_URL": worker.EXPECTED_URL, "SUPABASE_SERVICE_ROLE_KEY": "x",
                "PJS_OFFICE_OWNER_USER_ID": OWNER, "PJS_SHREE_MARUTI_BATCH_SIZE": "21",
            })


if __name__ == "__main__":
    unittest.main()
