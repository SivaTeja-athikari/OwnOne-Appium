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
CONFIDENCE_MARGIN = 0.10


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
        # The device-farm coordinator assigns each worker/batch artifact root
        # with FARM_ARTIFACT_ROOT. Keep the older variable as a fallback for
        # standalone worker invocations.
        self.report_dir = Path(
            os.environ.get(
                "FARM_ARTIFACT_ROOT",
                os.environ.get("FARM_WORKER_ARTIFACTS", "automation/reports"),
            )
        )

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
        self._cache_hits_logged = set()

    @classmethod
    def get_instance(cls) -> "SelfHealingEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_cached_locator(self, test_id: str) -> Optional[Tuple[str, str]]:
        locator = self._healed_locators.get(test_id)
        if locator and test_id not in self._cache_hits_logged:
            self._cache_hits_logged.add(test_id)
            logger.warning(
                "⚡ [SELF-HEAL CACHE HIT] '%s' reused %s:%s",
                test_id, locator[0], locator[1],
            )
        return locator

    def get_cached_id(self, test_id: str) -> Optional[str]:
        return self._healed_mock_ids.get(test_id)

    def clear_cache(self) -> None:
        self._healed_locators.clear()
        self._healed_mock_ids.clear()
        self._cache_hits_logged.clear()

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

        # Check catalog text first, but never accept the first of multiple
        # controls with the same label.
        if descriptor:
            semantic_matches = {}
            for text in descriptor.texts:
                for k, elem in candidates:
                    if (elem.text.strip().lower() == text.strip().lower()
                            and self._matches_mock_role(elem, descriptor.role)):
                        semantic_matches[k] = (elem, text)
            if len(semantic_matches) == 1:
                k, (elem, text) = next(iter(semantic_matches.items()))
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
            if len(semantic_matches) > 1:
                logger.warning("Rejected ambiguous mock semantic heal for %s", test_id)
                return None

        # Fuzzy match on element IDs (guard against collision with other known catalog IDs)
        ranked = []
        for k, elem in candidates:
            if k in LocatorCatalog._lookup and k != test_id:
                continue
            if descriptor and not self._matches_mock_role(elem, descriptor.role):
                continue
            score = difflib.SequenceMatcher(None, test_id.lower(), k.lower()).ratio()
            ranked.append((score, k, elem))
        ranked.sort(key=lambda candidate: candidate[0], reverse=True)
        best_score, best_key, best_elem = ranked[0] if ranked else (0.0, "", None)
        runner_score = ranked[1][0] if len(ranked) > 1 else None

        if (best_elem and best_score >= CONFIDENCE_THRESHOLD
                and (runner_score is None or best_score - runner_score >= CONFIDENCE_MARGIN)):
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
        if best_elem and runner_score is not None and best_score - runner_score < CONFIDENCE_MARGIN:
            logger.warning("Rejected ambiguous mock ID heal for %s: top scores %.2f and %.2f",
                           test_id, best_score, runner_score)

        return None

    @staticmethod
    def _matches_mock_role(elem: Any, role: str) -> bool:
        tag = str(getattr(elem, "tag", "")).lower()
        allowed = {
            "input": {"input", "edittext", "textfield", "securetextfield"},
            "button": {"button"},
            "link": {"link", "button"},
            "tab": {"tab", "button"},
            "switch": {"switch"},
            "checkbox": {"checkbox"},
            "radio": {"radio"},
            "alert": {"alert", "text", "label"},
            "text": {"text", "label"},
            "card": {"card", "view", "group"},
        }
        return not tag or tag in allowed.get(role, {tag})

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

        candidates: Dict[str, Tuple[Any, float, str, str]] = {}
        for by_strategy, query_val, confidence in queries:
            try:
                elements = driver.find_elements(by_strategy, query_val)
                for elem in elements:
                    try:
                        if not elem.is_displayed() or not self._matches_catalog_role(elem, descriptor, platform):
                            continue
                        identity = str(getattr(elem, "id", "") or id(elem))
                        previous = candidates.get(identity)
                        if previous is None or confidence > previous[1]:
                            candidates[identity] = (elem, confidence, by_strategy, query_val)
                    except WebDriverException:
                        continue
            except WebDriverException:
                continue

        ranked = sorted(candidates.values(), key=lambda candidate: candidate[1], reverse=True)
        if not ranked:
            return None
        best = ranked[0]
        runner_up = ranked[1] if len(ranked) > 1 else None
        if best[1] < CONFIDENCE_THRESHOLD:
            return None
        if runner_up and best[1] - runner_up[1] < CONFIDENCE_MARGIN:
            logger.warning(
                "Rejected ambiguous catalog heal for %s: top scores %.2f and %.2f",
                requested_id, best[1], runner_up[1],
            )
            return None

        elem, confidence, by_strategy, query_val = best
        self._healed_locators[requested_id] = (by_strategy, query_val)
        self.telemetry.record(HealingRecord(
            test_id=requested_id,
            strategy="catalog_semantic",
            healed_query=f"{by_strategy}:{query_val}",
            confidence=confidence,
            screen=screen,
            element_attributes={
                "strategy": by_strategy,
                "query": query_val,
                "canonical_id": descriptor.test_id,
                "candidate_count": len(ranked),
                "runner_up_confidence": runner_up[1] if runner_up else None,
            },
        ))
        return elem

    @staticmethod
    def _matches_catalog_role(elem: Any, descriptor: SemanticDescriptor, platform: str) -> bool:
        """Reject semantic text matches on the wrong native control class."""
        expected = descriptor.android_classes if platform == "android" else descriptor.ios_classes
        if not expected:
            return True
        try:
            actual = str(elem.tag_name).strip().lower()
        except WebDriverException:
            return False
        return actual in {name.strip().lower() for name in expected}

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

        ranked_candidates: List[Tuple[float, ET.Element, str]] = []

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

            # Match the declared native role exactly when the catalog has a
            # platform class contract. This avoids healing a button to its
            # label TextView or to another unrelated control.
            if descriptor:
                expected_classes = descriptor.android_classes if platform == "android" else descriptor.ios_classes
                if expected_classes and tag not in {name.lower() for name in expected_classes}:
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
            xpath = self._construct_node_xpath(node, platform)
            if xpath:
                ranked_candidates.append((composite, node, xpath))

        ranked_candidates.sort(key=lambda candidate: candidate[0], reverse=True)
        if ranked_candidates:
            best_score, best_candidate, best_xpath = ranked_candidates[0]
            runner_score = ranked_candidates[1][0] if len(ranked_candidates) > 1 else None
        else:
            best_score, best_candidate, best_xpath, runner_score = 0.0, None, "", None

        if (best_candidate is not None and best_score >= CONFIDENCE_THRESHOLD and best_xpath
                and (runner_score is None or best_score - runner_score >= CONFIDENCE_MARGIN)):
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
                            element_attributes={
                                **dict(best_candidate.attrib),
                                "runner_up_confidence": round(runner_score, 2) if runner_score is not None else None,
                            },
                        ))
                        return elem
            except WebDriverException:
                pass
        elif best_candidate is not None and runner_score is not None and best_score - runner_score < CONFIDENCE_MARGIN:
            logger.warning(
                "Rejected ambiguous XML heal for %s: top scores %.2f and %.2f",
                test_id, best_score, runner_score,
            )

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
