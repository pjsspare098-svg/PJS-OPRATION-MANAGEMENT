import unittest
from unittest.mock import Mock
from tracking_agent import TrackingJob, run_batch, pending
from carriers import normalize_status


class TrackingAgentTests(unittest.TestCase):
    def test_status_precedence(self):
        self.assertEqual(normalize_status("UNDELIVERED"), "Undelivered")
        self.assertEqual(normalize_status("OUT FOR DELIVERY"), "Out for Delivery")
        self.assertEqual(normalize_status("RTO DELIVERED"), "RTO Delivered")
        self.assertEqual(normalize_status("NOT DELIVERED"), "Undelivered")
        self.assertEqual(normalize_status("DELIVERED"), "Delivered")
        self.assertEqual(normalize_status("IN TRANSIT"), "In Transit")
        self.assertEqual(normalize_status("NOT FOUND"), "Not Found")

    def test_missing_fields(self):
        with self.assertRaises(ValueError):
            TrackingJob("292168", "VRL", "")

    def test_skip_done(self):
        engine = Mock()
        rows = [TrackingJob("292168", "VRL", "5555", "Delivered")]
        self.assertEqual(run_batch(rows, engine), [])
        engine.track.assert_not_called()

    def test_dedup(self):
        engine = Mock()
        engine.track.return_value = Mock(detail="IN TRANSIT", delivery_date="", screenshot_path=None)
        row = TrackingJob("292168", "VRL", "5555", "Pending")
        outcomes = run_batch([row, row], engine)
        self.assertEqual(len(outcomes), 2)
        self.assertEqual(engine.track.call_count, 1)
        self.assertEqual(outcomes[0].status, "In Transit")

    def test_not_found_separate(self):
        engine = Mock()
        engine.track.side_effect = LookupError("Missing docket")
        result = run_batch([TrackingJob("292168", "ACPL", "123")], engine)[0]
        self.assertEqual(result.status, "Not Found")
        self.assertNotIn("delivered", result.status.lower())

    def test_error_does_not_overwrite_delivered(self):
        engine = Mock()
        engine.track.side_effect = RuntimeError("Timeout")
        result = run_batch([TrackingJob("292168", "ARC", "123")], engine)[0]
        self.assertEqual(result.status, "Error")
        self.assertTrue(result.error)


if __name__ == "__main__":
    unittest.main()
