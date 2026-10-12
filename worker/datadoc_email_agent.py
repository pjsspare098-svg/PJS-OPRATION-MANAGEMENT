"""DataDoc 'Disp. Detail Send To Client' transaction adapter.

Translated from modDataDocEmailSubmit.bas. Unlike the old macro, this adapter:
- requires an explicitly identified *SENT* email proof (.eml or .msg),
  never the inbound .eml used to start Outlook Reply All;
- does not scan office shares or guess a filename;
- never logs credentials, reads them only via the existing DataDocAgent env;
- does not submit without two independent explicit safety gates;
- checks process and work before and after a non-idempotent submission.
Do not auto-retry uncertain outcomes.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import re

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

WORK = "Disp. Detail Send To Client"
NEXT_WORK = "Original Doc. And Mtrl Rcvd. Conf. - India GST"


@dataclass(frozen=True)
class EmailSubmitOutcome:
    state: str
    process_no: str
    message: str

    @property
    def confirmed(self) -> bool:
        return self.state in {"confirmed", "already_exists"}


def validate_sent_proof(process_no: str, proof: Path) -> Path:
    number = str(process_no or "").strip()
    if not re.fullmatch(r"[0-9]{5,9}", number):
        raise ValueError("Invalid Process No.")
    path = proof.expanduser().resolve()
    if path.suffix.lower() not in {".eml", ".msg"}:
        raise ValueError("DataDoc email proof must be saved sent .eml or .msg")
    if not path.is_file() or path.stat().st_size == 0:
        raise FileNotFoundError("Verified sent email proof is unavailable")
    if not re.search(r"(?<![0-9])" + re.escape(number) + r"(?![0-9])", path.stem):
        raise ValueError("Proof filename does not contain exact Process No.")
    return path


class DataDocEmailAgent:
    def __init__(self, datadoc, *, timeout: float = 12.0):
        """Reuse logged-in DataDocAgent; do not create a second Chrome session."""
        self.datadoc = datadoc
        self.timeout = timeout

    @property
    def driver(self):
        if self.datadoc.driver is None:
            raise RuntimeError("DataDoc Chrome session is not running")
        return self.datadoc.driver

    def _work_exists(self) -> bool:
        self.driver.switch_to.default_content()
        wanted = re.sub(r"[^a-z0-9]", "", WORK.lower())
        for row in self.driver.find_elements(By.XPATH, "//tr"):
            text = re.sub(r"[^a-z0-9]", "", (row.text or "").lower())
            if wanted in text:
                return True
        return False

    def _select_next_user(self, user: str) -> None:
        panel = self.driver.find_element(By.ID, "cphContent_Panel1")
        target = re.sub(r"\s+", " ", user).strip().casefold()
        if not target:
            raise ValueError("Next Response User is required")
        chosen = []
        for label in panel.find_elements(By.TAG_NAME, "label"):
            if re.sub(r"\s+", " ", label.text or "").strip().casefold() != target:
                continue
            ref = label.get_attribute("for")
            if not ref:
                continue
            choice = panel.find_element(By.ID, ref)
            if choice.get_attribute("type") != "checkbox":
                continue
            chosen.append(choice)
        if len(chosen) != 1:
            raise ValueError("Could not uniquely identify configured DataDoc next-user checkbox")
        for checkbox in panel.find_elements(By.CSS_SELECTOR, "input[type='checkbox']"):
            if checkbox.is_selected() and checkbox != chosen[0]:
                checkbox.click()
        if not chosen[0].is_selected():
            chosen[0].click()

    def submit_sent_proof(self, process_no: str, proof_file: str | Path,
                          *, approved: bool = False) -> EmailSubmitOutcome:
        path = validate_sent_proof(process_no, Path(proof_file))
        number = str(process_no).strip()
        if not approved or os.getenv("PJS_ENABLE_LIVE_DATADOC_EMAIL", "0") != "1":
            return EmailSubmitOutcome("dry_run", number, "Validated sent proof; DataDoc submission disabled")
        # Any action below may be partially successful. Never retry automatically.
        if not self.datadoc.ensure_started():
            return EmailSubmitOutcome("needs_review", number, "DataDoc login/search is unavailable")
        if not self.datadoc._open_process(number):
            return EmailSubmitOutcome("needs_review", number, "Exact process not found in DataDoc")
        if self._work_exists():
            return EmailSubmitOutcome("already_exists", number, "Email work already exists; no duplicate submit")
        try:
            driver = self.driver
            wait = WebDriverWait(driver, self.timeout)
            add = wait.until(EC.element_to_be_clickable((By.XPATH,
                "//a[contains(@class,'bmd-modalButton') and normalize-space(.)='Add']")))
            add.click()
            frame = wait.until(EC.presence_of_element_located((By.XPATH,
                "//iframe[contains(@class,'bmd-modal') or contains(@src,'Transaction') or contains(@src,'transaction')]")))
            driver.switch_to.frame(frame)
            Select(wait.until(EC.presence_of_element_located((By.ID, "cphContent_ddlWork")))).select_by_visible_text(WORK)
            Select(wait.until(EC.presence_of_element_located((By.ID, "cphContent_ddlNextWork")))).select_by_visible_text(NEXT_WORK)
            user = os.getenv("PJS_DATADOC_EMAIL_NEXT_USER", "Vivek Pal").strip()
            self._select_next_user(user)
            uploader = wait.until(EC.presence_of_element_located((By.ID, "cphContent_fileAttachment1")))
            uploader.send_keys(str(path))
            # Final action is gated; no client-side retry on a lost response.
            wait.until(EC.element_to_be_clickable((By.ID, "cphContent_btnSubmit"))).click()
            driver.switch_to.default_content()
            if self.datadoc._open_process(number) and self._work_exists():
                return EmailSubmitOutcome("confirmed", number, "DataDoc email submission confirmed by reopening process")
            return EmailSubmitOutcome("needs_review", number, "Submission attempted, not confirmed. Inspect DataDoc before any retry")
        except Exception as exc:
            return EmailSubmitOutcome("needs_review", number,
                f"Possible partial DataDoc email submission; manual reconciliation needed ({type(exc).__name__})")
        finally:
            try:
                self.driver.switch_to.default_content()
            except Exception:
                pass
