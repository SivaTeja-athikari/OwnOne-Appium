"""
Page Object representing the dynamic Tenant Dashboard.
"""

from typing import Any
from automation.pages.base_page import BasePage
from selenium.common.exceptions import TimeoutException

class DashboardPage(BasePage):
    TENANT_BADGE = "tenant_badge"
    TENANT_DISPLAY_NAME = "tenant_display_name"
    USER_ROLE_BADGE = "user_role_badge"
    METRIC_LIMIT = "dashboard_metric_limit"
    FLAG_REPORTING = "feature_flag_reporting"
    FLAG_CSV = "feature_flag_csv"
    FLAG_BIOMETRICS = "feature_flag_biometrics"
    FLAG_SCANNER = "feature_flag_scanner"
    SWITCH_COMPANY_BTN = "action_switch_company_btn"
    LOGOUT_BTN = "action_logout_btn"

    def get_tenant_badge(self) -> str:
        return self.get_text(self.TENANT_BADGE)

    def get_tenant_display_name(self) -> str:
        return self.get_text(self.TENANT_DISPLAY_NAME)

    def get_user_role(self) -> str:
        return self.get_text(self.USER_ROLE_BADGE)

    def get_max_transaction_limit(self) -> str:
        return self.get_text(self.METRIC_LIMIT)

    def get_feature_status(self, flag_name: str) -> str:
        flag_map = {
            "reporting": self.FLAG_REPORTING,
            "csv_export": self.FLAG_CSV,
            "biometrics": self.FLAG_BIOMETRICS,
            "scanner": self.FLAG_SCANNER,
        }
        test_id = flag_map.get(flag_name, self.FLAG_REPORTING)
        element = self.scroll_to(test_id)
        attribute = 'content-desc' if self.driver.capabilities.get('platformName', '').lower() == 'android' else 'label'
        return element.get_attribute(attribute) or self.get_text(test_id)

    def open_company_switcher(self) -> None:
        self.click(self.SWITCH_COMPANY_BTN)
        self.find_element('company_switch_modal')

    def logout(self) -> None:
        for _ in range(3):
            for _ in range(10):
                if self.is_visible(self.LOGOUT_BTN, timeout=1):
                    break
                self.scroll('up')
            self.find_element(self.LOGOUT_BTN).click()
            try:
                self.find_element('login_submit_btn', timeout=6)
                return
            except TimeoutException:
                pass
        self.find_element('login_submit_btn')
