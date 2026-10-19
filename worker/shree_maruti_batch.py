"""Shree Maruti October-2026 React tracker, adapted from approved VBA V2.

No Excel or database access in this module. One Selenium session submits up to
20 AWBs, selects the exact AWB chip and verifies the active hero belongs to it
before saving its *latest journey event*. Fail closed on ambiguous results.

The official tracker is opened directly at tracking.shreemaruti.com. The older
Shree Maruti public page is not required. Validate its live DOM on the authorized
Windows workstation before enabling carrier lookups.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from selenium.webdriver.common.by import By

from carriers import TrackResult, normalize_status

LOG = logging.getLogger(__name__)
PAGE_URL = "https://tracking.shreemaruti.com/"
MAX_BATCH = 20
POLL_SECONDS = 0.2
PAGE_TIMEOUT = 18
RESULT_TIMEOUT = 18
SEARCH = "form.search-bar input.search-input"
BUTTON = "form.search-bar button.btn-primary"
CHIPS = "span.tracked-chip"
CHIP_BUTTON = "button.tracked-chip-label"
ACTIVE_CHIP = "span.tracked-chip.active button.tracked-chip-label"
HERO = "section.status-hero .status-hero-top"
LATEST = "section.journey li.journey-item.latest"
JOURNEY = "section.journey li.journey-item"


def safe_segment(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", str(value)).strip("_")[:75] or "unknown"


def clean_awb(value: str) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def exact_awb_in(text: str, awb: str) -> bool:
    """Do not mistake AWB 123456 for another consignment 91234567."""
    return re.search(r"(?<![a-z0-9])" + re.escape(awb) + r"(?![a-z0-9])",
                     text or "", re.IGNORECASE) is not None


class ShreeMarutiBatchTracker:
    def __init__(self, driver, screenshot_dir: str | Path):
        self.driver = driver
        self.screenshot_dir = Path(screenshot_dir)
        # Never accept a chipless single-AWB hero from an earlier search.
        self._submitted_awbs: list[str] = []

    def _find(self, css: str, scope=None):
        try:
            matches = (scope or self.driver).find_elements(By.CSS_SELECTOR, css)
            return matches[0] if matches else None
        except Exception:
            return None

    def _text(self, css: str, scope=None) -> str:
        element = self._find(css, scope)
        return (element.text or "").strip() if element is not None else ""

    def _until(self, condition, seconds: float):
        limit = time.monotonic() + seconds
        while True:
            try:
                result = condition()
                if result:
                    return result
            except Exception:
                pass
            if time.monotonic() >= limit:
                return None
            time.sleep(POLL_SECONDS)

    def _activate_context(self) -> bool:
        """Find the actual React input either on the page or within an iframe."""
        try:
            self.driver.switch_to.default_content()
            if self._find(SEARCH) is not None:
                return True
            frames = self.driver.find_elements(By.TAG_NAME, "iframe")
            for frame in frames[:8]:
                self.driver.switch_to.default_content()
                try:
                    self.driver.switch_to.frame(frame)
                    if self._find(SEARCH) is not None:
                        return True
                except Exception:
                    continue
        except Exception:
            pass
        try:
            self.driver.switch_to.default_content()
        except Exception:
            pass
        return False

    def _ensure_page(self, force=False) -> bool:
        try:
            self.driver.switch_to.default_content()
            current = str(self.driver.current_url or "").lower()
            current_is_tracker = current.startswith(PAGE_URL.lower())
            if force or not current_is_tracker:
                self.driver.get(PAGE_URL)
            if self._until(self._activate_context, PAGE_TIMEOUT):
                return True
            # Reopen once only when the original page truly failed.
            self.driver.switch_to.default_content()
            self.driver.get(PAGE_URL)
            return bool(self._until(self._activate_context, PAGE_TIMEOUT))
        except Exception as exc:
            LOG.warning("Shree Maruti tracking page unavailable: %s", type(exc).__name__)
            return False

    def _chips(self):
        try:
            return self.driver.find_elements(By.CSS_SELECTOR, CHIPS)
        except Exception:
            return []

    def _clear_previous(self):
        """Never reuse a stale chip OR stale chipless single-AWB hero."""
        if not self._chips() and self._find(HERO) is None:
            return
        try:
            buttons = self.driver.find_elements(
                By.XPATH, "//button[normalize-space()='Clear all' or @aria-label='Clear all']"
            )
            if buttons:
                buttons[0].click()
                if self._until(lambda: not self._chips(), 3):
                    return
        except Exception:
            pass
        # If Clear All changed, refresh ONLY because the page cannot be reused safely.
        self.driver.switch_to.default_content()
        self.driver.refresh()
        if (not self._until(self._activate_context, PAGE_TIMEOUT)
                or self._chips() or self._find(HERO) is not None):
            raise RuntimeError("Old Shree Maruti results could not be cleared safely")

    def _submit(self, awbs: list[str]):
        if not awbs or len(awbs) > MAX_BATCH:
            raise ValueError("Shree Maruti search must contain 1–20 AWBs")
        if not self._activate_context():
            raise RuntimeError("Shree Maruti search context is unavailable")
        self._submitted_awbs = []
        self._clear_previous()
        # Clearing the old result may have reloaded the page / iframe.
        if not self._activate_context():
            raise RuntimeError("Shree Maruti search context disappeared after reset")
        box = self._find(SEARCH)
        button = self._find(BUTTON)
        if box is None or button is None:
            raise RuntimeError("Shree Maruti search input or Track button was not found")
        payload = ",".join(awbs)
        box.clear()
        box.send_keys(payload)
        typed = re.sub(r"\s+", "", box.get_attribute("value") or "")
        if typed != payload:
            raise RuntimeError("Shree Maruti input differs from submitted AWBs; refusing lookup")
        if not self._until(lambda: button.is_enabled(), 2):
            raise RuntimeError("Shree Maruti Track button is disabled")
        button.click()
        self._submitted_awbs = list(awbs)

    def _matching_chip(self, awb: str):
        for chip in self._chips():
            label = self._find(CHIP_BUTTON, chip)
            if label is not None and (label.text or "").strip().casefold() == awb.casefold():
                return label
        return None

    def _belongs_to(self, awb: str) -> bool:
        label = self._find(ACTIVE_CHIP)
        hero = self._find(HERO)
        if hero is None or not exact_awb_in(hero.text or "", awb):
            return False
        if label is not None:
            return (label.text or "").strip().casefold() == awb.casefold()
        # Shree Maruti's direct tracker has NO chips for a one-AWB search.
        # This fallback is permitted only if our current request has exactly
        # one AWB and there are no chips showing another active shipment.
        return (len(self._submitted_awbs) == 1
                and self._submitted_awbs[0].casefold() == awb.casefold()
                and not self._chips())

    def _select(self, awb: str):
        # A single tracking ID can show the hero directly without a chip.
        # In a multi-AWB response we require the exact selectable chip.
        def select_ready():
            if len(self._submitted_awbs) == 1 and self._belongs_to(awb):
                return True
            return self._matching_chip(awb)
        target = self._until(select_ready, RESULT_TIMEOUT)
        if target is None:
            raise LookupError("Matching shipment result was not found for this AWB")
        if target is not True and not self._belongs_to(awb):
            target.click()
        if not self._until(lambda: self._belongs_to(awb), RESULT_TIMEOUT):
            raise RuntimeError("Selected AWB and shipment hero did not agree")

    def _current_progress_step(self) -> str:
        """Read only the green/current progress marker, NOT all 'done' marks."""
        return self._text("section.status-hero .progress-step.current .progress-label")

    def _latest_journey(self, awb: str) -> tuple[str, str, str]:
        if not self._belongs_to(awb):
            raise RuntimeError("Carrier result switched AWB during lookup")
        item = self._find(LATEST) or self._find(JOURNEY)
        if item is None:
            raise RuntimeError("Latest journey event not visible")
        title = self._text(".journey-title", item)
        sub = self._text(".journey-sub", item)
        day = self._text("section.journey .journey-day-label")
        if not title:
            raise RuntimeError("Carrier journey title was empty")
        status = normalize_status(title)
        if status in ("Unknown", "Error"):
            raise RuntimeError("Carrier journey status is unrecognized")
        item_text = (item.text or "").strip()
        reason = ""
        match = re.search(r"\bReason\s*:\s*(.*)", item_text, re.IGNORECASE | re.DOTALL)
        if match:
            reason = re.sub(r"\s+", " ", match.group(0)).strip()[:260]
        # Keep the carrier's displayed date/time; do not invent the year.
        event_time = re.split(r"\s*[·•]\s*", sub, maxsplit=1)[0].strip()
        date = " ".join(x for x in (day, event_time) if x)[:100]
        marker = self._current_progress_step()
        # In returned/undelivered cases the green marker can still show an
        # earlier stage. The *latest shipment journey* remains authoritative.
        marker_note = f"Current progress marker: {marker}" if marker else ""
        if marker and normalize_status(marker) != status:
            marker_note += " (journey differs; latest journey used)"
        detail = " | ".join(x for x in (title, date, sub, reason, marker_note) if x)[:900]
        if not self._belongs_to(awb):
            raise RuntimeError("Carrier result changed before it was recorded")
        return status, detail, date

    def _capture_result(self, process: str, awb: str, status: str) -> str | None:
        if not self._belongs_to(awb):
            return None
        self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        name = f"{safe_segment(process)}_{safe_segment(awb)}_{safe_segment(status)}_{stamp}_{uuid4().hex[:8]}.png"
        path = self.screenshot_dir / name
        try:
            hero = self._find("section.status-hero")
            if hero is not None:
                self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", hero)
            if not self._belongs_to(awb):
                return None
            if not self.driver.save_screenshot(str(path)) or not path.is_file() or path.stat().st_size == 0:
                raise RuntimeError("Selenium did not produce a screenshot")
            return str(path)
        except Exception as exc:
            LOG.warning("Verified carrier status %s, but screenshot failed for process %s (%s)",
                        status, process, type(exc).__name__)
            return None

    def _read_one(self, awb: str) -> tuple[str, str, str]:
        self._select(awb)
        if not self._until(
            lambda: self._belongs_to(awb) and (
                self._find(LATEST) is not None or self._find(JOURNEY) is not None
            ), RESULT_TIMEOUT
        ):
            raise RuntimeError("Latest shipment journey failed to load for selected AWB")
        return self._latest_journey(awb)

    def track_many(self, requests: list[tuple[str, str]], on_progress=None) -> dict[tuple[str, str], TrackResult]:
        """One submission per group; always map back to *exact* Process No.+AWB."""
        if not requests or len(requests) > MAX_BATCH:
            raise ValueError("Shree Maruti batch size must be 1–20")
        clean: list[tuple[str, str]] = []
        for process, awb in requests:
            proc, number = str(process).strip(), clean_awb(awb)
            if not re.fullmatch(r"\d{5,10}", proc):
                raise ValueError("Invalid Process No. in Shree Maruti batch")
            if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._/-]{3,79}", number):
                raise ValueError("Invalid tracking AWB in Shree Maruti batch")
            clean.append((proc, number))
        unique = list(dict.fromkeys(awb for _, awb in clean))
        def progress(index: int):
            if on_progress is not None:
                try:
                    on_progress(index, len(unique))
                except Exception:
                    LOG.warning("Shree Maruti progress heartbeat unavailable; continuing lookup")
        resolved: dict[str, tuple[str, str, str]] = {}
        screenshots: dict[tuple[str, str], str | None] = {}
        processes_by_awb: dict[str, list[str]] = {}
        for process, awb in clean:
            processes_by_awb.setdefault(awb, []).append(process)
        errors: dict[str, str] = {}
        if not self._ensure_page():
            return {(p, a): TrackResult("Error", "Shree Maruti website not reachable")
                    for p, a in clean}
        try:
            self._submit(unique)
        except Exception as exc:
            LOG.warning("Shree Maruti batch submission failed: %s", type(exc).__name__)
            # Recover page once and attempt each AWB individually only if bulk failed.
            for awb in unique:
                errors[awb] = "Carrier batch search unavailable"
        else:
            # Collect all first: resubmitting one failed AWB must not erase others.
            for index, awb in enumerate(unique, 1):
                try:
                    resolved[awb] = self._read_one(awb)
                    for process in processes_by_awb[awb]:
                        screenshots[(process, awb)] = self._capture_result(process, awb, resolved[awb][0])
                except Exception as exc:
                    errors[awb] = type(exc).__name__
                finally:
                    progress(index)
        # A failed read-only lookup can be rechecked just once, without
        # re-submitting already verified AWBs or retrying database writes.
        for index, awb in enumerate(list(errors), 1):
            try:
                if not self._ensure_page():
                    raise RuntimeError("Tracking page unavailable")
                self._submit([awb])
                resolved[awb] = self._read_one(awb)
                for process in processes_by_awb[awb]:
                    screenshots[(process, awb)] = self._capture_result(process, awb, resolved[awb][0])
                errors.pop(awb, None)
            except Exception as exc:
                errors[awb] = type(exc).__name__
            finally:
                progress(index)
        output: dict[tuple[str, str], TrackResult] = {}
        for process, awb in clean:
            if awb not in resolved:
                output[(process, awb)] = TrackResult(
                    "Error", "Carrier lookup was inconclusive for this exact tracking ID")
                continue
            status, detail, date = resolved[awb]
            # Every verified status may have a screenshot, captured while its
            # own AWB was active BEFORE another search replaced the result.
            shot = screenshots.get((process, awb))
            output[(process, awb)] = TrackResult(status, detail, date, shot)
        return output
