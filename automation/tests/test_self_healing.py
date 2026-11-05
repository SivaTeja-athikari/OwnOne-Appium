"""Unit and contract tests for the Appium Self-Healing UI Element Engine."""
import json
from pathlib import Path
from unittest.mock import MagicMock
import xml.etree.ElementTree as ET

import pytest
from selenium.common.exceptions import TimeoutException

from automation.core.healer import HealingRecord, HealingTelemetry, SelfHealingEngine
from automation.core.locator_catalog import LocatorCatalog, SemanticDescriptor
from automation.core.mock_driver import MockAppiumDriver, MockWebElement
from automation.pages.base_page import BasePage


class TestLocatorCatalog:
    def test_exact_catalog_lookup(self):
        desc = LocatorCatalog.get("login_submit_btn")
        assert desc is not None
        assert desc.role == "button"
        assert "Sign in" in desc.texts
        assert "login_submit_btn" in desc.labels

    def test_input_catalog_lookup(self):
        desc = LocatorCatalog.get("report_title_input")
        assert desc is not None
        assert desc.role == "input"
        assert "e.g. Delivery completed at client site" in desc.placeholders
        assert "Report title *" in desc.neighbor_texts

    def test_dynamic_outcome_pattern_matching(self):
        desc = LocatorCatalog.get("report_outcome_In_progress")
        assert desc is not None
        assert desc.role == "radio"
        assert desc.texts == ["In progress"]

    def test_dynamic_risk_pattern_matching(self):
        desc = LocatorCatalog.get("report_risk_Critical")
        assert desc is not None
        assert desc.role == "radio"
        assert desc.texts == ["Critical"]

    def test_dynamic_checklist_pattern_matching(self):
        desc = LocatorCatalog.get("report_checklist_toggle_2")
        assert desc is not None
        assert desc.role == "checkbox"

    def test_unknown_id_returns_none(self):
        assert LocatorCatalog.get("completely_unknown_widget_id") is None


class TestHealingTelemetry:
    def test_telemetry_recording_and_json_output(self, tmp_path):
        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()

        record = HealingRecord(
            test_id="login_submit_btn",
            strategy="catalog_semantic",
            healed_query="UiSelector().text('Sign in')",
            confidence=0.95,
            screen="LoginPage",
            timestamp="2026-11-05T12:00:00Z",
            element_attributes={"text": "Sign in"},
        )
        telemetry.record(record)

        assert len(telemetry.records) == 1
        output_file = tmp_path / "healed_locators.json"
        assert output_file.exists()

        saved = json.loads(output_file.read_text(encoding="utf-8"))
        assert len(saved) == 1
        assert saved[0]["test_id"] == "login_submit_btn"
        assert saved[0]["confidence"] == 0.95


class TestSelfHealingWithMockDriver:
    def test_heals_element_when_test_id_is_renamed(self, tmp_path):
        driver = MockAppiumDriver(platform_name="Android", environment="qa")
        # Simulate developer renaming 'login_submit_btn' to 'login_action_btn'
        del driver.elements["login_submit_btn"]
        driver._register("login_action_btn", "button", "Authorize & Sign In")

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        page = BasePage(driver, timeout=2)
        page.healer = healer

        # Attempt to find by original test_id
        element = page.find_element("login_submit_btn")
        assert element is not None
        assert element.text == "Authorize & Sign In"
        assert len(telemetry.records) == 1
        assert telemetry.records[0].test_id == "login_submit_btn"

    def test_heals_via_fuzzy_id_similarity(self, tmp_path):
        driver = MockAppiumDriver(platform_name="Android", environment="qa")
        del driver.elements["env_indicator_banner"]
        # Slightly renamed ID
        driver._register("env_indicator_banner_dev", "button", "Environment: DEV")

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        page = BasePage(driver, timeout=2)
        page.healer = healer

        element = page.find_element("env_indicator_banner")
        assert element is not None
        assert "Environment: DEV" in element.text

    def test_fails_when_healing_is_disabled(self, monkeypatch):
        monkeypatch.setenv("ENABLE_SELF_HEALING", "0")
        driver = MockAppiumDriver(platform_name="Android", environment="qa")
        del driver.elements["login_submit_btn"]
        driver._register("login_action_btn", "button", "Authorize & Sign In")

        page = BasePage(driver, timeout=1)
        with pytest.raises(TimeoutException):
            page.find_element("login_submit_btn", timeout=1)


class TestXmlTreeHeuristicResolution:
    def test_heuristic_xml_resolution_on_android(self, tmp_path):
        sample_android_xml = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <android.widget.FrameLayout>
    <android.widget.LinearLayout>
      <android.widget.TextView text="Report title *" />
      <android.widget.EditText
          resource-id="refactored_title_input"
          hint="e.g. Delivery completed at client site"
          text=""
          enabled="true"
          displayed="true" />
      <android.widget.Button
          resource-id="renamed_submit_btn"
          text="Save for submission"
          enabled="true"
          displayed="true" />
    </android.widget.LinearLayout>
  </android.widget.FrameLayout>
</hierarchy>"""

        driver = MagicMock()
        driver.capabilities = {"platformName": "Android"}
        driver.page_source = sample_android_xml

        mock_elem = MagicMock()
        mock_elem.is_displayed.return_value = True
        driver.find_elements.return_value = [mock_elem]

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        # Heal input where testID was renamed to 'refactored_title_input'
        healed = healer.heal(driver, "report_title_input", screen="ReportsPage")
        assert healed is not None
        assert len(telemetry.records) == 1
        assert telemetry.records[0].strategy in ("catalog_semantic", "heuristic_xml_tree")

    def test_heuristic_xml_resolution_on_ios(self, tmp_path):
        sample_ios_xml = """<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
  <XCUIElementTypeApplication>
    <XCUIElementTypeWindow>
      <XCUIElementTypeTextField
          name="refactored_email_field"
          label="Email address"
          placeholderValue="you@example.com"
          value="" />
      <XCUIElementTypeButton
          name="refactored_submit_action"
          label="Sign in" />
    </XCUIElementTypeWindow>
  </XCUIElementTypeApplication>
</AppiumAUT>"""

        driver = MagicMock()
        driver.capabilities = {"platformName": "iOS"}
        driver.page_source = sample_ios_xml

        mock_elem = MagicMock()
        mock_elem.is_displayed.return_value = True
        driver.find_elements.return_value = [mock_elem]

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        # Heal button where testID was renamed to 'refactored_submit_action'
        healed = healer.heal(driver, "login_submit_btn", screen="LoginPage")
        assert healed is not None
        assert len(telemetry.records) == 1
        assert "Sign in" in telemetry.records[0].healed_query

    def test_candidate_collision_guard_prevents_stealing_sibling_identity(self, tmp_path):
        """Ensure a visible sibling input (signup_name_input) does NOT falsely heal signup_confirm_input."""
        sample_xml = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <android.widget.FrameLayout>
    <android.widget.LinearLayout>
      <android.widget.EditText
          resource-id="signup_name_input"
          text="John Doe"
          enabled="true"
          displayed="true" />
      <android.widget.EditText
          resource-id="signup_email_input"
          text="john@example.com"
          enabled="true"
          displayed="true" />
    </android.widget.LinearLayout>
  </android.widget.FrameLayout>
</hierarchy>"""
        driver = MagicMock()
        driver.capabilities = {"platformName": "Android"}
        driver.page_source = sample_xml
        driver.find_elements.return_value = []

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        # Attempt to heal 'signup_confirm_input' when only name and email inputs are on screen
        healed = healer.heal(driver, "signup_confirm_input", screen="SignupPage")
        assert healed is None
        assert len(telemetry.records) == 0

    def test_is_visible_negative_assertion_returns_false_without_false_healing(self, tmp_path):
        """Ensure is_visible('report_connectivity_card') on a screen without reports returns False."""
        driver = MockAppiumDriver(platform_name="Android", environment="qa")
        # Ensure report_connectivity_card is not on this mock screen
        driver.elements.pop("report_connectivity_card", None)

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        page = BasePage(driver, timeout=1)
        page.healer = healer

        # Must cleanly evaluate to False without falsely matching login elements
        assert not page.is_visible("report_connectivity_card", timeout=1)
        assert len(telemetry.records) == 0

    def test_healed_locator_cache_accelerates_subsequent_matches(self, tmp_path):
        """Ensure once an element is healed, subsequent _matches calls hit the cache."""
        driver = MockAppiumDriver(platform_name="Android", environment="qa")
        del driver.elements["login_submit_btn"]
        driver._register("login_action_btn", "button", "Authorize & Sign In")

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        page = BasePage(driver, timeout=1)
        page.healer = healer

        elem = page.find_element("login_submit_btn")
        assert elem is not None
        assert healer.get_cached_id("login_submit_btn") == "login_action_btn"

        # Direct _matches call should now resolve immediately using the cached ID
        matches = page._matches("login_submit_btn")
        assert len(matches) == 1
        assert matches[0].text == "Authorize & Sign In"

    def test_inline_error_does_not_heal_to_input_field(self, tmp_path):
        """Ensure report_emergency_contact_error does NOT match report_emergency_contact_input."""
        desc = LocatorCatalog.get("report_emergency_contact_error")
        assert desc is not None
        assert desc.role == "alert"

        sample_xml = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <android.widget.FrameLayout>
    <android.widget.LinearLayout>
      <android.widget.EditText
          resource-id="report_emergency_contact_input"
          content-desc="On-site contact phone (optional)"
          text="+14155550130"
          enabled="true"
          displayed="true" />
    </android.widget.LinearLayout>
  </android.widget.FrameLayout>
</hierarchy>"""
        driver = MagicMock()
        driver.capabilities = {"platformName": "Android"}
        driver.page_source = sample_xml
        driver.find_elements.return_value = []

        telemetry = HealingTelemetry()
        telemetry.report_dir = tmp_path
        telemetry.records.clear()
        healer = SelfHealingEngine(telemetry=telemetry)

        healed = healer.heal(driver, "report_emergency_contact_error", screen="ReportsPage")
        assert healed is None
        assert len(telemetry.records) == 0


