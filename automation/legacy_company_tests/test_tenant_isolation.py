"""Membership and company policy checks using accounts registered in the UI."""
import pytest
from automation.pages.login_page import LoginPage
from automation.pages.dashboard_page import DashboardPage
from automation.pages.company_switch_modal import CompanySwitchModal
from automation.config.tenants import get_tenant_config
from selenium.webdriver.support.ui import WebDriverWait


@pytest.mark.tenant_isolation
class TestTenantIsolation:
    def test_authorized_company_switch_updates_branding_and_features(self, driver, register_account, artifact_dir):
        email, password = register_account(['acme-corp', 'apex-health', 'zenith-financial'], 'multicompany')
        login = LoginPage(driver)
        dashboard = DashboardPage(driver)
        switcher = CompanySwitchModal(driver)
        login.login_as(email, password)
        dashboard.find_element(dashboard.TENANT_BADGE)
        assert dashboard.get_tenant_badge() == 'ACME'
        dashboard.open_company_switcher()
        switcher.select_company('apex-health')
        WebDriverWait(driver, 15).until(lambda _: dashboard.get_tenant_badge() == 'APEX')
        assert dashboard.get_tenant_display_name() == get_tenant_config('apex-health')['display_name']
        assert 'DISABLED' in dashboard.get_feature_status('csv_export')
        dashboard.capture_screenshot(str(artifact_dir / '01-apex-policy.png'))
        dashboard.open_company_switcher()
        switcher.select_company('zenith-financial')
        WebDriverWait(driver, 15).until(lambda _: dashboard.get_tenant_badge() == 'ZENITH')
        assert 'EUR' in dashboard.get_max_transaction_limit()
        dashboard.capture_screenshot(str(artifact_dir / '02-zenith-currency.png'))
        dashboard.logout()

    def test_prevent_unauthorized_company_switch(self, driver, register_account, artifact_dir):
        email, password = register_account(['acme-corp'], 'restricted')
        LoginPage(driver).login_as(email, password)
        dashboard = DashboardPage(driver)
        switcher = CompanySwitchModal(driver)
        dashboard.find_element(dashboard.TENANT_BADGE)
        dashboard.open_company_switcher()
        switcher.select_company('zenith-financial')
        assert 'not authorized' in switcher.get_unauthorized_error_text()
        switcher.capture_screenshot(str(artifact_dir / 'unauthorized-company.png'))
        switcher.close()
        assert dashboard.get_tenant_badge() == 'ACME'
        dashboard.logout()
