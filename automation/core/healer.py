"""Standard Self-Healing UI Element Engine for Appium Mobile Automation.

Recovers element interactions when React Native UI testIDs change, drift,
or are refactored between native builds. Operates across three tiers:
1. Semantic Catalog matching (known text, accessibility labels, placeholders).
2. Deep XML page-source inspection with fuzzy similarity scoring.
3. Telemetry recording to Allure reports and JSON audit files.
"""
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import difflib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By
from appium.webdriver.common.appiumby import AppiumBy

from automation.core.locator_catalog import LocatorCatalog, SemanticDescriptor

logger = logging.getLogger("automation.healer")
CONFIDENCE_THRESHOLD = 0.82


@dataclass
class HealingRecord:
    test_id: str
    strategy: str  # 'catalog_semantic' | 'heuristic_xml_tree' | 'mock_fallback'
    healed_query: str
    confidence: float
    screen: str
    element_attributes: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HealingTelemetry:
    """Aggregates self-healing telemetry and writes audit trails for developers."""
    _instance: Optional["HealingTelemetry"] = None

    def __init__(self):
        self.records: List[HealingRecord] = []
        self.report_dir = Path(os.environ.get("FARM_WORKER_ARTIFACTS", "automation/reports"))

    @classmethod
    def get_instance(cls) -> "HealingTelemetry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def record(self, record: HealingRecord) -> None:
        self.records.append(record)
        logger.warning(
            "⚡ [SELF-HEALED] '%s' on %s via %s -> %s (Confidence: %.2f)",
            record.test_id,
            record.screen or "Screen",
            record.strategy,
            record.healed_query,
            record.confidence,
        )
        # Log to Allure test step if allure is installed and active
        try:
            import allure
            allure.attach(
                json.dumps(asdict(record), indent=2),
                name=f"Self-Healed: {record.test_id}",
                attachment_type=allure.attachment_type.JSON,
            )
        except Exception:
            pass

        self._flush()

    def _flush(self) -> None:
        try:
            self.report_dir.mkdir(parents=True, exist_ok=True)
            output_file = self.report_dir / "healed_locators.json"
            data = [asdict(r) for r in self.records]
            output_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.debug("Failed to flush healing telemetry: %s", exc)


class SelfHealingEngine:
    """Locates elements via multi-tier fallback when primary testID lookup fails."""
    _instance: Optional["SelfHealingEngine"] = None

    def __init__(self, telemetry: Optional[HealingTelemetry] = None):
        self.telemetry = telemetry or HealingTelemetry.get_instance()
        self.enabled = os.environ.get("ENABLE_SELF_HEALING", "1").lower() not in ("0", "false", "no")
        self._healed_locators: Dict[str, Tuple[str, str]] = {}
        self._healed_mock_ids: Dict[str, str] = {}

    @classmethod
    def get_instance(cls) -> "SelfHealingEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_cached_locator(self, test_id: str) -> Optional[Tuple[str, str]]:
        return self._healed_locators.get(test_id)

    def get_cached_id(self, test_id: str) -> Optional[str]:
        return self._healed_mock_ids.get(test_id)

    def clear_cache(self) -> None:
        self._healed_locators.clear()
        self._healed_mock_ids.clear()

    def heal(self, driver: Any, test_id: str, screen: str = "") -> Optional[Any]:
        if not self.enabled:
            return None

        # 1. Handle in-memory Mock Driver
        if isinstance(getattr(driver, "elements", None), dict):
            return self._heal_mock_driver(driver, test_id, screen)

        platform = str(driver.capabilities.get("platformName", "")).lower()

        # 2. Phase 1: Semantic Catalog Resolution
        descriptor = LocatorCatalog.get(test_id)
        if descriptor:
            healed = self._try_catalog_resolution(driver, test_id, descriptor, platform, screen)
            if healed:
                return healed

        # 3. Phase 2: Page Source XML Tree Heuristic Match
        return self._try_xml_heuristic_resolution(driver, test_id, descriptor, platform, screen)

    def _heal_mock_driver(self, driver: Any, test_id: str, screen: str) -> Optional[Any]:
        """Resolves elements within MockAppiumDriver via semantic text or ID similarity."""
        descriptor = LocatorCatalog.get(test_id)
        candidates = list(driver.elements.items())

        # Check catalog texts first
        if descriptor:
            for text in descriptor.texts:
                for k, elem in candidates:
                    if elem.text.strip().lower() == text.strip().lower():
                        self._healed_mock_ids[test_id] = k
                        self.telemetry.record(HealingRecord(
                            test_id=test_id,
                            strategy="mock_fallback",
                            healed_query=f"mock:text('{text}')",
                            confidence=0.95,
                            screen=screen,
                            element_attributes={"key": k, "tag": elem.tag, "text": elem.text},
                        ))
                        return elem

        # Fuzzy match on element IDs (guard against collision with other known catalog IDs)
        best_elem = None
        best_score = 0.0
        best_key = ""
        for k, elem in candidates:
            if k in LocatorCatalog._lookup and k != test_id:
                continue
            score = difflib.SequenceMatcher(None, test_id.lower(), k.lower()).ratio()
            if score > best_score:
                best_score = score
                best_elem = elem
                best_key = k

        if best_elem and best_score >= CONFIDENCE_THRESHOLD:
            self._healed_mock_ids[test_id] = best_key
            self.telemetry.record(HealingRecord(
                test_id=test_id,
                strategy="mock_fallback",
                healed_query=f"mock:id('{best_key}')",
                confidence=best_score,
                screen=screen,
                element_attributes={"key": best_key, "tag": best_elem.tag, "text": best_elem.text},
            ))
            return best_elem

        return None

    def _try_catalog_resolution(
        self, driver: Any, requested_id: str, descriptor: SemanticDescriptor, platform: str, screen: str
    ) -> Optional[Any]:
        """Queries known alternative labels, texts, and placeholders defined in the catalog."""
        queries: List[Tuple[str, str, float]] = []

        if platform == "android":
            # Exact Accessibility label / content-desc
            for lbl in descriptor.labels:
                if descriptor.role == "input":
                    queries.append((AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().className("android.widget.EditText").description("{lbl}")', 0.95))
                else:
                    queries.append((AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().description("{lbl}")', 0.95))

            # Exact Visible text (no loose textContains)
            for txt in descriptor.texts:
                if descriptor.role == "input":
                    queries.append((AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().className("android.widget.EditText").text("{txt}")', 0.92))
                elif descriptor.role == "button":
                    queries.append((AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().text("{txt}")', 0.92))
                else:
                    queries.append((AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().text("{txt}")', 0.90))

            # Input placeholder / hint
            for ph in descriptor.placeholders:
                queries.append((AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().className("android.widget.EditText").text("{ph}")', 0.90))

            # Sibling / child to neighbor text (e.g. input following its field label)
            if descriptor.role == "input":
                for neighbor in descriptor.neighbor_texts:
                    xpath = f'//*[@text="{neighbor}"]/following::android.widget.EditText[1]'
                    queries.append((By.XPATH, xpath, 0.85))
        else:
            # iOS queries
            for lbl in descriptor.labels:
                if descriptor.role == "input":
                    queries.append((By.XPATH, f'//XCUIElementTypeTextField[@name="{lbl}" or @label="{lbl}"]', 0.95))
                    queries.append((By.XPATH, f'//XCUIElementTypeSecureTextField[@name="{lbl}" or @label="{lbl}"]', 0.95))
                else:
                    queries.append((AppiumBy.ACCESSIBILITY_ID, lbl, 0.95))

            for txt in descriptor.texts:
                if descriptor.role == "button":
                    queries.append((By.XPATH, f'//XCUIElementTypeButton[@name="{txt}" or @label="{txt}"]', 0.92))
                else:
                    queries.append((By.XPATH, f'//*[@name="{txt}" or @label="{txt}" or @value="{txt}"]', 0.90))

            for ph in descriptor.placeholders:
                queries.append((By.XPATH, f'//XCUIElementTypeTextField[@placeholderValue="{ph}"]', 0.92))
                queries.append((By.XPATH, f'//XCUIElementTypeSecureTextField[@placeholderValue="{ph}"]', 0.92))

            for neighbor in descriptor.neighbor_texts:
                xpath = f'//*[@name="{neighbor}" or @label="{neighbor}"]/following::XCUIElementTypeTextField[1]'
                queries.append((By.XPATH, xpath, 0.85))

        for by_strategy, query_val, confidence in queries:
            try:
                elements = driver.find_elements(by_strategy, query_val)
                for elem in elements:
                    try:
                        if elem.is_displayed():
                            self._healed_locators[requested_id] = (by_strategy, query_val)
                            self.telemetry.record(HealingRecord(
                                test_id=requested_id,
                                strategy="catalog_semantic",
                                healed_query=f"{by_strategy}:{query_val}",
                                confidence=confidence,
                                screen=screen,
                                element_attributes={"strategy": by_strategy, "query": query_val, "canonical_id": descriptor.test_id},
                            ))
                            return elem
                    except WebDriverException:
                        continue
            except WebDriverException:
                continue

        return None

    def _try_xml_heuristic_resolution(
        self, driver: Any, test_id: str, descriptor: Optional[SemanticDescriptor], platform: str, screen: str
    ) -> Optional[Any]:
        """Parses active page_source XML hierarchy and scores nodes by structural similarity."""
        try:
            page_source = driver.page_source
            if not page_source:
                return None
            root = ET.fromstring(page_source.encode("utf-8") if isinstance(page_source, str) else page_source)
        except Exception as exc:
            logger.debug("Failed to parse page source for healing: %s", exc)
            return None

        best_score = 0.0
        best_candidate: Optional[ET.Element] = None
        best_xpath = ""

        # Walk all elements and calculate composite score
        for node in root.iter():
            tag = node.tag.lower()
            attribs = node.attrib

            # Candidate collision guard:
            # If this node's ID belongs to another known element in our catalog,
            # it is that known element, NOT the element we are trying to heal!
            raw_id = (attribs.get("resource-id") or attribs.get("name") or attribs.get("content-desc") or "").strip()
            bare_id = raw_id.split("/")[-1] if "/" in raw_id else raw_id
            if bare_id and bare_id in LocatorCatalog._lookup and bare_id != test_id:
                continue

            # Match target role if known
            if descriptor:
                if descriptor.role == "input" and not any(k in tag for k in ("edittext", "textfield", "input")):
                    continue
                if descriptor.role == "button" and not any(k in tag for k in ("button", "viewgroup", "pressable", "text")):
                    continue
                if descriptor.role == "card" and not any(k in tag for k in ("viewgroup", "layout", "view", "other")):
                    continue
                if descriptor.role in ("alert", "text") and any(k in tag for k in ("edittext", "textfield", "input", "button")):
                    continue

            # 1. Identifier similarity (resource-id / name / content-desc)
            id_score = difflib.SequenceMatcher(None, test_id.lower(), bare_id.lower()).ratio() if bare_id else 0.0

            # 2. Text / Label similarity
            text_val = (attribs.get("text") or attribs.get("label") or attribs.get("value") or "").strip()
            text_score = 0.0
            if descriptor and text_val:
                for expected_text in descriptor.texts + descriptor.labels:
                    sim = difflib.SequenceMatcher(None, expected_text.lower(), text_val.lower()).ratio()
                    if sim > text_score:
                        text_score = sim

            # 3. Placeholder similarity
            hint_val = (attribs.get("hint") or attribs.get("placeholderValue") or "").strip()
            hint_score = 0.0
            if descriptor and hint_val:
                for expected_ph in descriptor.placeholders:
                    sim = difflib.SequenceMatcher(None, expected_ph.lower(), hint_val.lower()).ratio()
                    if sim > hint_score:
                        hint_score = sim

            # Weighted composite score
            composite = max(id_score * 0.9, text_score * 0.95, hint_score * 0.9)
            if composite > best_score:
                xpath = self._construct_node_xpath(node, platform)
                if xpath:
                    best_score = composite
                    best_candidate = node
                    best_xpath = xpath

        if best_candidate is not None and best_score >= CONFIDENCE_THRESHOLD and best_xpath:
            try:
                elements = driver.find_elements(By.XPATH, best_xpath)
                for elem in elements:
                    if elem.is_displayed():
                        self._healed_locators[test_id] = (By.XPATH, best_xpath)
                        self.telemetry.record(HealingRecord(
                            test_id=test_id,
                            strategy="heuristic_xml_tree",
                            healed_query=f"xpath:{best_xpath}",
                            confidence=round(best_score, 2),
                            screen=screen,
                            element_attributes=dict(best_candidate.attrib),
                        ))
                        return elem
            except WebDriverException:
                pass

        return None

    def _construct_node_xpath(self, node: ET.Element, platform: str) -> str:
        """Constructs an actionable XPath locator for a candidate XML node."""
        attribs = node.attrib
        tag = node.tag

        if platform == "android":
            if attribs.get("resource-id"):
                return f'//{tag}[@resource-id="{attribs["resource-id"]}"]'
            if attribs.get("content-desc"):
                return f'//{tag}[@content-desc="{attribs["content-desc"]}"]'
            if attribs.get("text"):
                return f'//{tag}[@text="{attribs["text"]}"]'
        else:
            if attribs.get("name"):
                return f'//{tag}[@name="{attribs["name"]}"]'
            if attribs.get("label"):
                return f'//{tag}[@label="{attribs["label"]}"]'
            if attribs.get("placeholderValue"):
                return f'//{tag}[@placeholderValue="{attribs["placeholderValue"]}"]'

        return ""
