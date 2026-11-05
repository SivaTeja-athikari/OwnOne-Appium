"""Exercise environment-specific accounts, sessions, and sample data in the UI."""
import pytest

from automation.pages.dashboard_page import DashboardPage
from automation.pages.login_page import LoginPage
from automation.pages.signup_page import SignupPage
from automation.offline.test_data import fresh_email


@pytest.mark.matrix
@pytest.mark.authentication
def test_environment_accounts_sessions_and_datasets_are_isolated(
    driver, environment, tenant_config, platform, artifact_dir
):
    login = LoginPage(driver)
    signup = SignupPage(driver)
    dashboard = DashboardPage(driver)
    active_env = environment
    email_by_environment = {
        env: fresh_email('Environment', env.title())
        for env in ('development', 'qa', 'staging')
    }
    password = 'Test@123'
    volume_by_environment = {
        'development': 'USD 18,420',
        'qa': 'USD 76,350',
        'staging': 'USD 284,900',
    }

    def create_account_and_check_data(env):
        nonlocal active_env
        email = email_by_environment[env]
        if dashboard.is_visible(dashboard.TENANT_DISPLAY_NAME, timeout=1):
            dashboard.logout()
        if env != active_env:
            login.select_environment(env)
            active_env = env
        # A previous run may have left a verified SQLite profile for this
        # environment. Clear that read-only cached workspace before asserting
        # fresh-account behavior, so the test remains repeatable on one device.
        if dashboard.is_visible(dashboard.TENANT_DISPLAY_NAME, timeout=2):
            dashboard.logout()
        login.find_element(login.SUBMIT_BUTTON)
        login.login_as(email, password)
        if login.login_result() == 'error':
            error = login.get_error_message().lower()
            assert 'incorrect' in error or 'not found' in error or 'profile is unavailable' in error
            login.open_signup()
            signup.create_account(f'{env.title()} Demo Tester', email, password, [tenant_config['id']])
            login.find_element(login.SUCCESS_MESSAGE, timeout=30)
            login.login_as(email, password)
        dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
        assert dashboard.get_tenant_display_name() == tenant_config['display_name']
        metric = dashboard.find_element('demo_metric_volume')
        attribute = 'content-desc' if platform.lower() == 'android' else 'label'
        accessible_value = metric.get_attribute(attribute) or metric.text
        assert volume_by_environment[env] in accessible_value
        dashboard.capture_screenshot(str(artifact_dir / f'{env}-dashboard.png'))

    # Firebase email addresses are global to the project, so each environment
    # uses a distinct account while its Firestore profile remains environment scoped.
    login.ensure_login()
    login.select_environment('development')
    active_env = 'development'
    create_account_and_check_data('development')
    create_account_and_check_data('qa')
    create_account_and_check_data('staging')
