"""Concise manager-facing authentication scenarios using one shared test account."""

import time
import allure
import pytest

from automation.pages.login_page import LoginPage
from automation.pages.reports_page import ReportsPage
from automation.pages.signup_page import SignupPage

pytestmark = [pytest.mark.offline, pytest.mark.authentication]


@allure.suite('01 Authentication')
@allure.title('AUTH-001 · Empty sign-up form shows required validation')
@pytest.mark.regression
@pytest.mark.ios_smoke
def test_signup_empty_form_validation(bundled_app, driver, offline_evidence):
    login = LoginPage(driver)
    login.ensure_login()

    with allure.step('Verify empty login form validation'):
        if login.get_input_value(login.EMAIL_INPUT):
            login.enter_email('')
        if login.get_input_value(login.PASSWORD_INPUT):
            login.enter_password('')
        login.click_sign_in()
        assert login.get_error_message() == 'Please enter a valid email address.'

    with allure.step('Verify empty sign-up form validation'):
        signup = login.open_signup()
        for field in (
            signup.NAME_INPUT,
            signup.EMAIL_INPUT,
            signup.PASSWORD_INPUT,
            signup.CONFIRM_INPUT,
        ):
            if signup.get_input_value(field):
                signup.type_text(field, '')
        signup.submit()
        assert signup.get_text(signup.ERROR_BOX) == 'Please enter your full name.'
        offline_evidence('auth-empty-signup-validation')
        signup.click(signup.LOGIN_LINK)
        login.find_element(login.SUBMIT_BUTTON)


@allure.suite('01 Authentication')
@allure.title('AUTH-002 · Valid sign-up, invalid and valid online login')
@pytest.mark.regression
@pytest.mark.ios_smoke
def test_signup_invalid_and_valid_login_online(
    bundled_app, driver, fresh_offline_account, offline_evidence,
):
    """Cross-platform auth flow; this case needs no radio control."""
    email, password = fresh_offline_account
    login = LoginPage(driver)
    reports = ReportsPage(driver)
    if not reports.is_visible(reports.HOME):
        login.login_as(email, password)
        reports.wait_home()

    offline_evidence('auth-valid-signup-and-login')
    with allure.step('Reject invalid password without opening the workspace'):
        reports.logout()
        login.login_as(email, 'WrongPassword-2026!')
        login.find_element(login.ERROR_BOX, timeout=25)
        assert login.get_error_message().strip()
        assert not reports.is_visible(reports.HOME, timeout=2)
        offline_evidence('auth-invalid-password-rejected')

    with allure.step('Accept valid credentials while online'):
        login.login_as(email, password)
        reports.wait_home()
        offline_evidence('auth-valid-login')


@allure.suite('01 Authentication')
@allure.title('AUTH-003 · Login blocked offline and recovers after reconnect')
@pytest.mark.regression
def test_login_blocked_offline_and_recovers_online(
    bundled_app, driver, fresh_offline_account, network_manager, offline_evidence,
):
    email, password = fresh_offline_account
    login = LoginPage(driver)
    reports = ReportsPage(driver)
    if not reports.is_visible(reports.HOME):
        login.login_as(email, password)
        reports.wait_home()

    with allure.step('Block login while offline, then recover with the same credentials'):
        reports.logout()
        network_manager.all_off()
        assert network_manager.state().radios_off
        reports.wait_offline()
        login.login_as(email, password)
        login.find_element(login.ERROR_BOX, timeout=20)
        assert 'internet' in login.get_error_message().lower()
        assert not reports.is_visible(reports.HOME, timeout=2)
        offline_evidence('auth-login-blocked-offline')

        network_manager.restore()
        assert not network_manager.state().radios_off
        reports.wait_connected(timeout=60)
        result = 'error'
        for attempt in range(2):
            login.login_as(email, password)
            result = login.login_result(timeout=45)
            if result == 'dashboard':
                break
            message = login.get_error_message().lower()
            if attempt == 0 and ('internet' in message or 'network' in message):
                reports.wait_connected(timeout=60)
                time.sleep(2)
                continue
            raise AssertionError(f'Login did not recover after connectivity returned: {message}')
        assert result == 'dashboard', 'Valid credentials should open the workspace after reconnect'
        reports.wait_home()
        offline_evidence('auth-login-recovers-after-reconnect')
