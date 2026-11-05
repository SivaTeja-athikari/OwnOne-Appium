"""
In-memory Mock Driver simulating Appium/WebDriver for offline test validation
and CI environments without physical/virtual mobile hardware.
"""

from typing import Dict, Any, Optional, List

class MockWebElement:
    def __init__(self, element_id: str, tag: str, text: str = "", attributes: Optional[Dict[str, str]] = None):
        self.element_id = element_id
        self.tag = tag
        self._text = text
        self.attributes = attributes or {}
        self.is_displayed_val = True
        self.is_enabled_val = True

    @property
    def text(self) -> str:
        return self._text

    def get_attribute(self, name: str) -> Optional[str]:
        return self.attributes.get(name)

    def is_displayed(self) -> boolean if False else bool:
        return self.is_displayed_val

    def is_enabled(self) -> bool:
        return self.is_enabled_val

    def send_keys(self, value: str) -> None:
        self._text = value
        self.attributes["text"] = value

    def clear(self) -> None:
        self._text = ""
        self.attributes["text"] = ""

    def click(self) -> None:
        # Trigger any simulated side-effects
        pass


class MockAppiumDriver:
    """Simulates an Appium Remote session with a dynamic in-memory DOM."""
    def __init__(self, platform_name: str = "Android", environment: str = "qa", tenant: str = "acme-corp"):
        self.platform_name = platform_name
        self.environment = environment
        self.current_tenant = tenant
        self.is_logged_in = False
        self.elements: Dict[str, MockWebElement] = {}
        self._init_dom()

    def _init_dom(self):
        # Initial login screen elements
        self._register("env_indicator_banner", "button", f"Environment: {self.environment.upper()} • Quality Assurance (QA)")
        self._register("login_email_input", "input", "admin@enterprise.com")
        self._register("login_submit_btn", "button", "Authorize & Sign In")
        self._register("login_tenant_select_acme-corp", "button", "ACME")
        self._register("login_tenant_select_apex-health", "button", "APEX")
        self._register("login_tenant_select_zenith-financial", "button", "ZENITH")
        self._register("persona_admin_btn", "button", "Platform Admin")
        self._register("persona_acme_mgr_btn", "button", "Acme Ops")
        self._register("persona_apex_cmo_btn", "button", "Apex CMO")
        self._register("persona_zenith_aud_btn", "button", "Zenith Auditor")

    def _register(self, test_id: str, tag: str, text: str = ""):
        self.elements[test_id] = MockWebElement(
            element_id=f"elem_{test_id}",
            tag=tag,
            text=text,
            attributes={"resource-id": test_id, "content-desc": test_id, "name": test_id, "testID": test_id},
        )

    def find_element(self, by: str, value: str) -> MockWebElement:
        # Resolve testID from locator value
        key = value
        for prefix in ["~", "id=", "name="]:
            if key.startswith(prefix):
                key = key[len(prefix):]
                break

        if key in self.elements:
            return self.elements[key]
        raise Exception(f"NoSuchElementException: Element '{value}' not found in mock DOM.")

    def find_elements(self, by: str, value: str) -> List[MockWebElement]:
        try:
            return [self.find_element(by, value)]
        except Exception:
            return []

    def get_screenshot_as_file(self, path: str) -> bool:
        with open(path, "w") as f:
            f.write("mock_screenshot_binary_data")
        return True

    @property
    def page_source(self) -> str:
        return f"<AppRoot environment='{self.environment}' tenant='{self.current_tenant}' logged_in='{self.is_logged_in}' />"

    def quit(self) -> None:
        self.elements.clear()

    # Simulator actions
    def simulate_login(self, email: str, tenant_id: str):
        self.is_logged_in = True
        self.current_tenant = tenant_id

        badge_text = "ACME" if tenant_id == "acme-corp" else "APEX" if tenant_id == "apex-health" else "ZENITH"
        name_text = "Acme Logistics & Supply" if tenant_id == "acme-corp" else "Apex Healthcare Solutions" if tenant_id == "apex-health" else "Zenith Capital Group"
        limit_text = "USD 100,000" if tenant_id == "acme-corp" else "USD 25,000" if tenant_id == "apex-health" else "EUR 1,000,000"
        csv_status = "DISABLED" if tenant_id == "apex-health" else "ENABLED"

        self._register("tenant_badge", "text", badge_text)
        self._register("tenant_display_name", "text", name_text)
        self._register("user_role_badge", "text", "ROLE: ADMIN")
        self._register("dashboard_metric_limit", "text", limit_text)
        self._register("feature_flag_reporting", "text", "ENABLED")
        self._register("feature_flag_csv", "text", csv_status)
        self._register("feature_flag_biometrics", "text", "ENABLED")
        self._register("feature_flag_scanner", "text", "ENABLED" if tenant_id != "zenith-financial" else "DISABLED")
        self._register("action_switch_company_btn", "button", "Switch Company")
        self._register("action_logout_btn", "button", "Sign Out")
        self._register("company_option_acme-corp", "button", "Acme Logistics & Supply")
        self._register("company_option_apex-health", "button", "Apex Healthcare Solutions")
        self._register("company_option_zenith-financial", "button", "Zenith Capital Group")

    def simulate_logout(self):
        self.is_logged_in = False
        self.elements.clear()
        self._init_dom()
