"""The application's three real native bottom tabs and their page titles."""

from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.base_page import BasePage


class WorkspaceNavigation(BasePage):
    TITLES = {'Companies': 'Your companies', 'Account': 'Your account'}

    def open_tab(self, label):
        if label not in ('Overview', 'Companies', 'Account'):
            raise ValueError(f'Unknown app tab: {label}')
        WebDriverWait(self.driver, self.timeout, poll_frequency=0.3).until(
            lambda _: next((item for item in self.driver.find_elements(
                AppiumBy.ACCESSIBILITY_ID, label) if item.is_displayed()), False),
            f'{label} tab was not accessible',
        ).click()
        if label == 'Overview':
            self.find_element('tenant_display_name')
        else:
            title = self.find_element('workspace_screen_title')
            assert self.TITLES[label] in (title.text or title.get_attribute('label') or '')
