"""Offline Shree Maruti VBA V2 adaptation tests. No Chrome, carrier or Supabase network."""
import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from carriers import TrackResult
from shree_maruti_batch import (
    ShreeMarutiBatchTracker, clean_awb, exact_awb_in, safe_segment,
)


class ShreeMarutiBatchTests(unittest.TestCase):
    def setUp(self):
        self.tracker = ShreeMarutiBatchTracker(Mock(), Path(tempfile.gettempdir()) / "shree-tests")
        self.tracker._ensure_page = Mock(return_value=True)
        self.tracker._submit = Mock()
        self.tracker._read_one = Mock()
        self.tracker._capture_result = Mock(side_effect=lambda p, a, status: f"shot-{p}-{a}-{status}.png")

    def test_awb_token_boundaries(self):
        self.assertTrue(exact_awb_in("AWB: 00123456789 | Delivered", "00123456789"))
        self.assertFalse(exact_awb_in("AWB: 900123456789", "00123456789"))
        self.assertFalse(exact_awb_in("AWB: 001234567899", "00123456789"))
        self.assertEqual(safe_segment("../295845:tmp"), "295845_tmp")
        self.assertEqual(clean_awb(" 00 1234 \r\n"), "001234")

    def test_many_processes_map_by_exact_pair_not_result_position(self):
        jobs = [("295845", "00123456789"), ("295846", "99900112233"),
                ("295847", "77889912345")]
        facts = {
            "00123456789": ("In Transit", "In Transit | Surat", "19 OCT 11:00 AM"),
            "99900112233": ("Delivered", "Delivered | Pune", "19 OCT 12:00 PM"),
            "77889912345": ("Returned", "Returned to sender | reason", "18 OCT 1:00 PM"),
        }
        self.tracker._read_one.side_effect = lambda awb: facts[awb]
        results = self.tracker.track_many(jobs)
        self.tracker._submit.assert_called_once_with([a for _, a in jobs])
        self.assertEqual(results[("295845", "00123456789")].status, "In Transit")
        self.assertEqual(results[("295846", "99900112233")].status, "Delivered")
        self.assertEqual(results[("295847", "77889912345")].status, "Returned")
        self.assertEqual(results[("295846", "99900112233")].screenshot_path, "shot-295846-99900112233-Delivered.png")
        self.assertEqual(results[("295845", "00123456789")].screenshot_path, "shot-295845-00123456789-In Transit.png")
        self.assertEqual(results[("295847", "77889912345")].screenshot_path, "shot-295847-77889912345-Returned.png")
        self.assertEqual(self.tracker._capture_result.call_count, 3)

    def test_same_awb_in_two_processes_is_looked_up_once_but_saved_twice(self):
        jobs = [("295845", "123456789"), ("295846", "123456789")]
        self.tracker._read_one.return_value = ("Delivered", "DELIVERED", "19 OCT")
        results = self.tracker.track_many(jobs)
        self.tracker._submit.assert_called_once_with(["123456789"])
        self.tracker._read_one.assert_called_once_with("123456789")
        self.assertNotEqual(results[jobs[0]].screenshot_path, results[jobs[1]].screenshot_path)
        self.assertEqual(self.tracker._capture_result.call_count, 2)

    def test_failed_awb_only_rechecked_once_not_successful_awbs(self):
        jobs = [("295845", "123456789"), ("295846", "987654321")]
        attempts = {"123456789": 0, "987654321": 0}
        def read(awb):
            attempts[awb] += 1
            if awb == "987654321" and attempts[awb] == 1:
                raise RuntimeError("React hero mismatched active AWB")
            return ("Delivered", "Carrier: Delivered", "19 OCT") if awb == "123456789" else (
                "In Transit", "Carrier: Dispatched", "18 OCT"
            )
        self.tracker._read_one.side_effect = read
        results = self.tracker.track_many(jobs)
        self.assertEqual(self.tracker._submit.call_args_list[0].args[0], ["123456789", "987654321"])
        self.assertEqual(self.tracker._submit.call_args_list[1].args[0], ["987654321"])
        self.assertEqual(attempts, {"123456789": 1, "987654321": 2})
        self.assertEqual(results[jobs[0]].status, "Delivered")
        self.assertEqual(results[jobs[0]].screenshot_path, "shot-295845-123456789-Delivered.png")
        self.assertEqual(results[jobs[1]].status, "In Transit")

    def test_ambiguous_awb_fails_closed_after_two_attempts(self):
        self.tracker._read_one.side_effect = RuntimeError("AWB and hero mismatch")
        row = ("295845", "123456789")
        result = self.tracker.track_many([row])[row]
        self.assertEqual(result.status, "Error")
        self.assertIsNone(result.screenshot_path)
        self.assertEqual(self.tracker._read_one.call_count, 2)

    def test_rejects_bad_ids_without_opening_selenium(self):
        with self.assertRaises(ValueError):
            self.tracker.track_many([("xx", "123456789")])
        with self.assertRaises(ValueError):
            self.tracker.track_many([("295845", "1;234")])
        with self.assertRaises(ValueError):
            self.tracker.track_many([("295845", "123456789")] * 21)
        self.tracker._submit.assert_not_called()

    def test_journey_event_status_not_hero_progress_bar(self):
        tracker = ShreeMarutiBatchTracker(Mock(), "test-shots")
        tracker._belongs_to = Mock(return_value=True)
        latest_item = Mock()
        latest_item.text = "Returned to sender\nReason: Consignee refused"
        tracker._find = Mock(return_value=latest_item)
        tracker._text = Mock(side_effect=["Returned to sender", "11:30 AM · Pune", "19 OCT", "Out for Delivery"])
        status, detail, date = tracker._latest_journey("123456789")
        self.assertEqual(status, "Returned")
        self.assertIn("Reason: Consignee refused", detail)
        self.assertIn("19 OCT", date)
        self.assertIn("Current progress marker: Out for Delivery", detail)
        self.assertIn("latest journey used", detail)

    def test_direct_official_url_replaces_legacy_page(self):
        tracker = ShreeMarutiBatchTracker(Mock(), "test-shots")
        tracker.driver.current_url = "https://shreemaruti.com/track-shipment/"
        tracker._until = Mock(return_value=True)
        self.assertTrue(tracker._ensure_page())
        tracker.driver.get.assert_called_once_with("https://tracking.shreemaruti.com/")

    def test_direct_single_awb_without_chips_is_valid_only_for_submitted_awb(self):
        tracker = ShreeMarutiBatchTracker(Mock(), "test-shots")
        tracker._submitted_awbs = ["26184200069988"]
        hero = Mock()
        hero.text = "DELIVERED | AWB 26184200069988"
        tracker._find = Mock(side_effect=lambda selector, scope=None: hero if selector == "section.status-hero .status-hero-top" else None)
        tracker._chips = Mock(return_value=[])
        self.assertTrue(tracker._belongs_to("26184200069988"))
        self.assertFalse(tracker._belongs_to("2618420006998"))
        tracker._select("26184200069988")
        tracker._submitted_awbs = ["26184200069988", "26184200069989"]
        self.assertFalse(tracker._belongs_to("26184200069988"))

    def test_full_page_screenshot_for_in_transit_is_process_and_awb_named(self):
        with tempfile.TemporaryDirectory() as directory:
            tracker = ShreeMarutiBatchTracker(Mock(), directory)
            tracker._belongs_to = Mock(return_value=True)
            tracker._find = Mock(return_value=None)
            image = b"\x89PNG\r\n\x1a\n" + b"simulated-image"
            tracker.driver.execute_cdp_cmd.return_value = {
                "data": base64.b64encode(image).decode("ascii")
            }
            path = tracker._capture_result("295845", "00123456789", "In Transit")
            self.assertIsNotNone(path)
            self.assertEqual(Path(path).read_bytes(), image)
            self.assertIn("295845_00123456789_In_Transit", Path(path).name)
            tracker.driver.save_screenshot.assert_not_called()
            tracker.driver.execute_cdp_cmd.assert_called_once()

    def test_screenshot_rejected_when_active_awb_changes_during_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            tracker = ShreeMarutiBatchTracker(Mock(), directory)
            tracker._belongs_to = Mock(side_effect=[True, True, False])
            tracker._find = Mock(return_value=None)
            tracker.driver.execute_cdp_cmd.return_value = {
                "data": base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"image").decode()
            }
            self.assertIsNone(tracker._capture_result("295845", "123456789", "Delivered"))
            self.assertEqual(list(Path(directory).glob("*.png")), [])

    def test_hero_and_active_chip_must_match_exact_awb(self):
        tracker = ShreeMarutiBatchTracker(Mock(), "test-shots")
        chip, hero = Mock(), Mock()
        chip.text, hero.text = "123456789", "AWB 999123456789 · Delivered"
        tracker._find = Mock(side_effect=[chip, hero])
        self.assertFalse(tracker._belongs_to("123456789"))


if __name__ == "__main__":
    unittest.main()
