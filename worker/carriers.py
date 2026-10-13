import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


@dataclass
class TrackResult:
    status: str
    detail: str
    delivery_date: str = ""
    screenshot_path: Optional[str] = None


def normalize_status(text: str) -> str:
    """Conservative translation of the user's TRACKING MASTER VBA status table.

    Carrier-specific adapters should extract the CURRENT event, not full history.
    Unknown or challenge text must never be guessed as In Transit or Delivered.
    """
    u = re.sub(r"\s+", " ", (text or "").strip()).upper()
    if not u:
        return "Unknown"
    if any(x in u for x in (
        "VERIFICATION REQUIRED", "VERIFY YOU ARE HUMAN", "CAPTCHA",
        "ACCESS DENIED", "BLOCKED REQUEST", "PLEASE ENABLE JAVASCRIPT",
        "SERVICE UNAVAILABLE", "DATABASE ERROR",
    )):
        return "Error"
    if "RTO DELIVERED" in u:
        return "RTO Delivered"
    if any(x in u for x in ("UNDELIVERED", "NOT DELIVERED", "DELIVERY FAILED", "FAILED DELIVERY")):
        return "Undelivered"
    if "RETURN TO ORIGIN" in u or re.search(r"\bRTO\b", u):
        return "RTO"
    if "RETURNED" in u or re.search(r"\bRETURN\b", u):
        return "Returned"
    if "CANCELLED" in u or "CANCELED" in u:
        return "Cancelled"
    if "OUT FOR DELIVERY" in u:
        return "Out for Delivery"
    if re.search(r"\bDELIVERED\b", u):
        return "Delivered"
    if any(x in u for x in ("NOT FOUND", "NO RECORD", "NO CONSIGNMENT", "NO RESULT")):
        return "Not Found"
    if any(x in u for x in ("ERROR", "EXCEPTION", "TIMEOUT", "TIMED OUT", "CONNECTION REFUSED")):
        return "Error"
    if "ADDRESS" in u and ("ISSUE" in u or "INCORRECT" in u):
        return "Address Issue"
    if "DELAY" in u:
        return "Delayed"
    if "PENDING" in u or "NOT CHECKED" in u:
        return "Pending"
    if any(x in u for x in (
        "IN TRANSIT", "IN-TRANSIT", "TRANSIT", "DISPATCHED",
        "BOOKED", "PICKED UP", "PICKUP COMPLETED", "SHIPPED",
    )):
        return "In Transit"
    return "Unknown"

class CarrierEngine:
    def __init__(self, screenshot_dir: str):
        self.screenshot_dir = Path(screenshot_dir)
        self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        self.driver: Optional[WebDriver] = None

    def start(self) -> WebDriver:
        if self.driver is not None:
            try:
                _ = self.driver.current_url
                return self.driver
            except Exception:
                self.close()

        options = Options()
        if os.getenv("PJS_HEADLESS", "0") == "1":
            options.add_argument("--headless=new")
        options.add_argument("--start-maximized")
        options.add_argument("--disable-notifications")
        options.add_argument("--disable-popup-blocking")
        options.add_argument("--disable-dev-shm-usage")

        profile = os.getenv("PJS_CHROME_PROFILE", "").strip()
        if profile:
            options.add_argument(f"--user-data-dir={profile}")

        self.driver = webdriver.Chrome(options=options)
        self.driver.set_page_load_timeout(int(os.getenv("PJS_PAGELOAD_TIMEOUT", "35")))
        return self.driver

    def close(self):
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
        self.driver = None

    def screenshot(self, process_no: str, transporter: str) -> str:
        driver = self.start()
        safe = re.sub(r"[^A-Za-z0-9_-]+", "_", transporter.upper())
        folder = self.screenshot_dir / safe
        folder.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Process references are external input; never let one escape screenshot folder.
        safe_process = re.sub(r"[^A-Za-z0-9_-]+", "_", str(process_no)).strip("_")[:50] or "process"
        path = folder / f"{safe_process}_{stamp}.png"
        driver.save_screenshot(str(path))
        return str(path)

    def wait(self, seconds=15):
        return WebDriverWait(self.start(), seconds)

    def ensure_url(self, url: str, reuse_contains: Optional[str] = None):
        driver = self.start()
        current = ""
        try:
            current = driver.current_url or ""
        except Exception:
            pass
        if reuse_contains and reuse_contains.lower() in current.lower():
            return
        driver.get(url)

    def track(self, transporter: str, tracking_id: str, process_no: str) -> TrackResult:
        name = re.sub(r"\s+", " ", (transporter or "").strip().upper())
        if "SHREE MARUTI" in name or "ARHAM ENTERPRISE" in name:
            name = "SHREE MARUTI"
        elif "V EXPRESS" in name or "V-EXPRESS" in name or "VEXPRESS" in name:
            name = "V EXPRESS"
        elif "TCI FREIGHT" in name:
            name = "TCI FREIGHT"
        elif "VRL" in name:
            name = "VRL"
        elif "ACPL" in name:
            name = "ACPL"
        elif re.search(r"\bARC\b", name):
            name = "ARC"
        if not str(tracking_id or "").strip() or not str(process_no or "").strip():
            raise ValueError("Process No. and tracking ID are required before opening a carrier website.")
        handlers = {
            "SHREE MARUTI": self.track_shree_maruti,
            "SHREE MARUTI (ARHAM)": self.track_shree_maruti,
            "VRL": self.track_vrl,
            "ACPL": self.track_acpl,
            "V EXPRESS": self.track_vexpress,
            "TCI FREIGHT": self.track_tci_freight,
            "ARC": self.track_arc,
        }
        if name not in handlers:
            raise ValueError(f"No Python tracker configured for {name or 'blank transporter'}")
        result = handlers[name](tracking_id, process_no)
        # Outcome is stored as a structured value, never inferred from a screenshot.
        return result

    def _shree_database_error(self) -> bool:
        driver = self.start()
        try:
            body = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
        except Exception:
            return False
        phrases = [
            "database error",
            "error establishing a database connection",
            "service unavailable",
            "temporarily unavailable",
            "internal server error",
        ]
        return any(p in body for p in phrases)

    def _find_shree_box(self):
        driver = self.start()
        driver.switch_to.default_content()
        try:
            return WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, "sentenceInput"))
            )
        except TimeoutException:
            pass

        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for i in range(min(len(frames), 3)):
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(i)
                box = WebDriverWait(driver, 2).until(
                    EC.presence_of_element_located((By.ID, "sentenceInput"))
                )
                return box
            except Exception:
                continue

        driver.switch_to.default_content()
        return None

    def track_shree_maruti(self, tracking_id: str, process_no: str) -> TrackResult:
        driver = self.start()
        self.ensure_url("https://shreemaruti.com/track-shipment/", "shreemaruti.com/track-shipment")

        if self._shree_database_error():
            driver.refresh()
            time.sleep(2)
            if self._shree_database_error():
                raise WebDriverException("Shree Maruti site database unavailable")

        box = self._find_shree_box()
        driver.switch_to.default_content()
        try:
            box = WebDriverWait(driver, 8).until(EC.presence_of_element_located((By.ID, "sentenceInput")))
        except TimeoutException:
            try:
                driver.switch_to.frame(0)
                box = WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, "sentenceInput")))
            finally:
                pass
        if box is None:
            raise TimeoutException("Shree Maruti tracking input not found")

        box.clear()
        box.send_keys(tracking_id)
        typed = (box.get_attribute("value") or "").strip()
        if typed != tracking_id:
            raise WebDriverException(
                f"Shree Maruti input did not accept tracking ID. Expected {tracking_id}, got {typed}"
            )

        button = WebDriverWait(driver, 8).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, ".track-btn"))
        )
        button.click()

        status = ""
        delivery_date = ""
        end = time.time() + 12
        while time.time() < end:
            if self._shree_database_error():
                raise WebDriverException("Shree Maruti database error while reading result")
            try:
                status = driver.execute_script(
                    "var e=document.querySelector('div.status-title');return e?e.textContent:'';"
                ) or ""
                delivery_date = driver.execute_script(
                    "var e=document.querySelector('div.status-time');return e?e.textContent:'';"
                ) or ""
            except Exception:
                pass
            if status.strip():
                break
            time.sleep(0.25)

        if not status.strip():
            raise TimeoutException("Shree Maruti result not found")

        driver.switch_to.default_content()
        shot = self.screenshot(process_no, "SHREE MARUTI") if normalize_status(status) in ("Delivered", "RTO Delivered") else None
        return TrackResult(normalize_status(status), status.strip(), delivery_date.strip(), shot)

    def track_vrl(self, tracking_id: str, process_no: str) -> TrackResult:
        driver = self.start()
        self.ensure_url("https://www.vrlgroup.in/Tracking/TrackShipment")

        try:
            box = WebDriverWait(driver, 12).until(
                EC.presence_of_element_located((By.ID, "lrno"))
            )
        except TimeoutException:
            box = WebDriverWait(driver, 8).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'input[placeholder="Enter your LR No."]'))
            )
        box.clear()
        box.send_keys(tracking_id)

        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "input.track-submit-button"))
        ).click()

        meta = WebDriverWait(driver, 15).until(
            lambda d: (d.find_element(By.CLASS_NAME, "track-meta").text or "").strip()
        )
        parts = [p.strip() for p in str(meta).split("•")]
        raw_status = parts[0] if parts else str(meta)
        eta = parts[1].replace("ETA - ", "").strip() if len(parts) > 1 else ""

        try:
            result_area = driver.find_element(By.CSS_SELECTOR, "section.track-card.track-card--timeline")
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", result_area)
        except Exception:
            pass

        shot = self.screenshot(process_no, "VRL") if normalize_status(raw_status) in ("Delivered", "RTO Delivered") else None
        return TrackResult(normalize_status(raw_status), str(meta).strip(), eta, shot)

    def track_acpl(self, tracking_id: str, process_no: str) -> TrackResult:
        driver = self.start()
        self.ensure_url("https://acplcargo.com/GCTRACKING.php")

        box = WebDriverWait(driver, 12).until(
            EC.presence_of_element_located((By.NAME, "gcnumber"))
        )
        box.clear()
        box.send_keys(tracking_id)
        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(.,'Search')]"))
        ).click()

        row_status = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((
                By.XPATH,
                "(//h3[contains(text(),'DISPATCH DETAILS')]/following::table[1]//tbody/tr[1]/td[3])"
            ))
        ).text.strip()
        delivery_date = ""
        try:
            delivery_date = driver.find_element(
                By.XPATH,
                "(//h3[contains(text(),'DISPATCH DETAILS')]/following::table[1]//tbody/tr[1]/td[1])"
            ).text.strip()
        except Exception:
            pass

        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        shot = self.screenshot(process_no, "ACPL") if normalize_status(row_status) in ("Delivered", "RTO Delivered") else None
        return TrackResult(normalize_status(row_status), row_status, delivery_date, shot)

    def _close_vexpress_popups(self):
        driver = self.start()
        selectors = [
            "button.btn-close", "button.close", "button[data-dismiss='modal']",
            "button[data-bs-dismiss='modal']", ".modal button.btn-close",
            ".modal button.close", ".modal .btn-close", "span.close"
        ]
        for sel in selectors:
            try:
                for element in driver.find_elements(By.CSS_SELECTOR, sel):
                    if element.is_displayed():
                        element.click()
                        time.sleep(0.1)
            except Exception:
                pass

    def track_vexpress(self, tracking_id: str, process_no: str) -> TrackResult:
        driver = self.start()
        self.ensure_url("https://vxpress.in/track-shipment/")
        self._close_vexpress_popups()

        try:
            WebDriverWait(driver, 12).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "a.dropdown-toggle"))
            ).click()
        except Exception:
            pass

        box = WebDriverWait(driver, 12).until(
            EC.presence_of_element_located((By.ID, "DocketNumber"))
        )
        box.clear()
        box.send_keys(tracking_id)
        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='GO']"))
        ).click()

        end = time.time() + 15
        raw_status = ""
        while time.time() < end:
            try:
                modal = driver.find_elements(
                    By.XPATH,
                    "//h2[contains(@class,'modal-title') and contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'docket number not found')]"
                )
                if modal:
                    raise LookupError("Docket Number Not Found")
                raw_status = driver.find_element(
                    By.XPATH, "//div[contains(@class,'current-status')]/b"
                ).text.strip()
            except LookupError:
                raise
            except Exception:
                raw_status = ""
            if raw_status:
                break
            time.sleep(0.25)

        if not raw_status:
            raise TimeoutException("V Express tracking result not found")

        try:
            result = driver.find_element(By.CSS_SELECTOR, "div.information-docket-list")
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", result)
        except Exception:
            pass
        shot = self.screenshot(process_no, "V EXPRESS") if normalize_status(raw_status) in ("Delivered", "RTO Delivered") else None
        self._close_vexpress_popups()
        return TrackResult(normalize_status(raw_status), raw_status, "", shot)

    def track_tci_freight(self, tracking_id: str, process_no: str) -> TrackResult:
        driver = self.start()
        self.ensure_url("https://tcifreight.in/")

        box = WebDriverWait(driver, 14).until(
            EC.presence_of_element_located((By.ID, "form-field-consignmentno"))
        )
        box.clear()
        box.send_keys(tracking_id)

        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//span[contains(text(),'Track Consignment')]"))
        ).click()

        WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(.,'TRACK DETAIL')]"))
        ).click()

        raw_status = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.XPATH, "(//div[contains(@class,'MuiStepContent-root')]//p)[1]"))
        ).text.strip()

        delivery_date = ""
        try:
            delivery_date = driver.find_element(By.XPATH, "(//p[contains(text(),'-20')])[1]").text.strip()
        except Exception:
            pass

        shot = self.screenshot(process_no, "TCI FREIGHT") if normalize_status(raw_status) in ("Delivered", "RTO Delivered") else None
        try:
            driver.find_element(By.XPATH, "//button[@aria-label='close']").click()
        except Exception:
            pass
        return TrackResult(normalize_status(raw_status), raw_status, delivery_date, shot)

    def track_arc(self, tracking_id: str, process_no: str) -> TrackResult:
        driver = self.start()
        self.ensure_url("https://online.arclimited.com/cnstrk/cnstrk.aspx")

        box = WebDriverWait(driver, 12).until(
            EC.presence_of_element_located((By.ID, "txtCNSMCNNO"))
        )
        box.clear()
        box.send_keys(tracking_id)
        WebDriverWait(driver, 8).until(
            EC.element_to_be_clickable((By.ID, "submit"))
        ).click()

        status_cell = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((
                By.XPATH,
                "//table[@id='tblData']//td[contains(translate(normalize-space(.),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ'),' ON ')]"
            ))
        )
        raw_status = re.sub(r"\s+", " ", status_cell.text).strip()
        delivery_date = ""
        match = re.search(r"\bON\s+(.+)$", raw_status, re.I)
        if match:
            delivery_date = match.group(1).strip()

        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", status_cell)
        shot = self.screenshot(process_no, "ARC") if normalize_status(raw_status) in ("Delivered", "RTO Delivered") else None
        return TrackResult(normalize_status(raw_status), raw_status, delivery_date, shot)
