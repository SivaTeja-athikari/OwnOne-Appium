"""Run all company profiles on the actual CLI-selected environment and platform."""
import pytest
from automation.config.tenants import TENANTS
from automation.pages.login_page import LoginPage
from automation.pages.dashboard_page import DashboardPage


@pytest.mark.matrix
@pytest.mark.parametrize('tenant_id', ['acme-corp', 'apex-health', 'zenith-financial'])
def test_company_profile_on_selected_environment(driver, register_account, tenant_id, artifact_dir):
    config = TENANTS[tenant_id]
    email, password = register_account([tenant_id], f'matrix.{tenant_id}')
    LoginPage(driver).login_as(email, password)
    dashboard = DashboardPage(driver)
    dashboard.find_element(dashboard.TENANT_BADGE)
    assert dashboard.get_tenant_badge() == config['badge_text']
    assert dashboard.get_tenant_display_name() == config['display_name']
    assert config['currency'] in dashboard.get_max_transaction_limit()
    expected = 'ENABLED' if config['features']['csv_export'] else 'DISABLED'
    assert expected in dashboard.get_feature_status('csv_export')
    dashboard.capture_screenshot(str(artifact_dir / 'company-profile.png'))
    dashboard.logout()
