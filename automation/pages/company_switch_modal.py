"""
Page Object representing the Company Switcher Modal.
"""

from typing import Any
from automation.pages.base_page import BasePage

class CompanySwitchModal(BasePage):
    MODAL = "company_switch_modal"
    CLOSE_BTN = "company_switch_close_btn"
    UNAUTHORIZED_ERROR = "unauthorized_tenant_error"

    def select_company(self, tenant_id: str) -> None:
        option_id = f"company_option_{tenant_id}"
        self.click(option_id)

    def get_unauthorized_error_text(self) -> str:
        return self.get_text(self.UNAUTHORIZED_ERROR)

    def close(self) -> None:
        self.click(self.CLOSE_BTN)
