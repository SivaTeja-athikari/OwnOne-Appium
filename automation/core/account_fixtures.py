"""Shared UI-created accounts for offline and sibling authentication suites."""
import os
import pytest
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.login_page import LoginPage
from automation.pages.signup_page import SignupPage
from automation.pages.reports_page import ReportsPage
from automation.offline.test_data import fresh_email


def offline_account_scope(fixture_name, config):
    # Regression farm batches run one test module in one process, allowing the
    # module's related cases to reuse a single authenticated test account.
    farm_reuse = config.getoption('--farm-reuse-session')
    single_reuse = config.getoption('--reuse-app-session') and not config.getoption('--farm-worker')
    return 'session' if farm_reuse or single_reuse else 'function'


def require_online_precondition(driver):
    """Skip online-dependent cases when the emulator cannot reach internet."""
    page = ReportsPage(driver)
    try:
        WebDriverWait(driver, 20, poll_frequency=0.5).until(
            lambda _: 'Network: Offline' not in page.network_label()
            and 'Network: Checking' not in page.network_label(),
            'Emulator internet did not become reachable after radio preflight',
        )
    except TimeoutException:
        pytest.skip('Emulator has no internet reachability; online test precondition is unavailable')


@pytest.fixture(scope=offline_account_scope)
def fresh_offline_account(driver, environment):
    if os.environ.get('OFFLINE_FIREBASE_CONFIGURED') != '1':
        pytest.skip('Firebase project configuration is required to register an account')
    login = LoginPage(driver)
    signup = SignupPage(driver)
    login.ensure_login()
    require_online_precondition(driver)
    if environment != 'production':
        login.select_environment(environment)
        # Environment changes rehydrate auth state asynchronously. Recheck the
        # login route before navigating so signup cannot race that transition.
        login.ensure_login()
    email = fresh_email('Alex', 'Morgan')
    password = 'OfflineTest2026!'
    login.open_signup()
    signup.create_account('Alex Morgan', email, password,
                          ['acme-corp'])
    login.find_element(login.SUCCESS_MESSAGE)
    # Signup intentionally creates the account without authenticating it.
    # Sign in once here, then reuse this authenticated session for every report case.
    login.login_as(email, password)
    ReportsPage(driver).wait_home()
    return email, password


