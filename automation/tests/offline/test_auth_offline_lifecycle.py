"""QA-grade offline lifecycle and edge-case tests for Authentication and Forms.

Covers:
- Offline draft persistence across cold app restarts
- Security validation: passwords never cached in draft
- Offline blocked signup/login policies with clear UX feedback
- Draft cleanup after successful network registration
- Session restoration and read-only behavior offline
"""

import pytest
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.login_page import LoginPage
from automation.pages.signup_page import SignupPage
from automation.pages.reports_page import ReportsPage
from automation.offline.test_data import fresh_email

APP = 'com.anonymous.appreact'
pytestmark = [pytest.mark.offline, pytest.mark.authentication]


def test_signup_draft_persists_across_app_restart_offline(
    bundled_app, driver, network_manager, offline_evidence, artifact_dir
):
    """QA Scenario: User enters signup information offline, app is killed and restarted.

    Expected:
    - Signup draft is preserved locally (name, email)
    - Sensitive password fields are never restored
    - Draft indicator ('Saved on this device only...') is displayed
    """
    login = LoginPage(driver)
    login.ensure_login()
    signup = login.open_signup()

    # Step 1: Disconnect all radios
    network_manager.all_off()
    assert network_manager.state().radios_off
    offline_evidence('signup-draft-01-offline')

    # Step 2: Fill out signup form
    test_name = 'Draft QA User'
    test_email = fresh_email('Draft', 'QA')
    test_password = 'Password123!'

    signup.complete_form(
        full_name=test_name,
        email=test_email,
        password=test_password,
        confirmation=test_password,
    )
    WebDriverWait(driver, 15, poll_frequency=0.4).until(
        lambda _: signup._visible(signup.DRAFT_SAVED_LABEL),
        'Draft saved indicator was not visible on the form'
    )
    offline_evidence('signup-draft-02-draft-saved')

    # Step 3: Terminate app and relaunch
    driver.terminate_app(APP)
    driver.activate_app(APP)

    # Step 4: Re-open signup screen
    login.ensure_login()
    signup = login.open_signup()

    # Step 5: Verify draft fields restored, password empty
    WebDriverWait(driver, 15, poll_frequency=0.3).until(
        lambda _: signup.get_input_value(signup.NAME_INPUT) == test_name,
        'Full name draft was not restored after app restart'
    )
    assert signup.get_input_value(signup.EMAIL_INPUT) == test_email
    assert signup.get_input_value(signup.PASSWORD_INPUT) == '', 'Security edge case failed: password must never be cached'
    assert signup.get_input_value(signup.CONFIRM_INPUT) == '', 'Security edge case failed: password confirmation must never be cached'

    offline_evidence('signup-draft-03-restored-after-restart')


def test_signup_blocked_offline_with_graceful_ux(
    bundled_app, driver, network_manager, offline_evidence
):
    """QA Scenario: Submitting signup form while offline must fail gracefully without crash."""
    login = LoginPage(driver)
    login.ensure_login()
    signup = login.open_signup()

    network_manager.all_off()
    assert network_manager.state().radios_off

    test_email = fresh_email('Blocked', 'Signup')
    signup.complete_form('Offline Blocked User', test_email, 'Secret123!')
    signup.submit()

    # Verification: Error box appears, submit button remains interactive (not permanently disabled)
    signup.find_element(signup.ERROR_BOX, timeout=15)
    error_text = signup.get_text(signup.ERROR_BOX)
    assert len(error_text) > 0
    assert signup._visible(signup.SUBMIT_BUTTON)
    offline_evidence('signup-blocked-offline')


def test_login_blocked_offline_recovers_state(
    bundled_app, driver, network_manager, offline_evidence
):
    """QA Scenario: Submitting login credentials offline presents feedback without hanging spinner."""
    login = LoginPage(driver)
    login.ensure_login()

    network_manager.all_off()
    assert network_manager.state().radios_off

    login.login_as('offline.user@example.com', 'SomePassword123!')

    # Verification: Error box displays network / unavailable message, submit button recovers
    login.find_element(login.ERROR_BOX, timeout=15)
    error_text = login.get_error_message()
    assert len(error_text) > 0

    # Ensure button is back to actionable state
    submit_btn = login.find_element(login.SUBMIT_BUTTON)
    assert submit_btn.is_enabled()
    offline_evidence('login-blocked-offline')


def test_signup_draft_purged_after_successful_online_registration(
    bundled_app, driver, network_manager, fresh_offline_account, offline_evidence
):
    """QA Scenario: Once registration succeeds online, the local draft is cleared."""
    email, password = fresh_offline_account
    login = LoginPage(driver)
    login.ensure_login()

    # Open signup form again
    signup = login.open_signup()

    # Inputs must be clean and not populate previous account details
    assert signup.get_input_value(signup.NAME_INPUT) == ''
    assert signup.get_input_value(signup.EMAIL_INPUT) == ''
    assert not signup._visible(signup.DRAFT_SAVED_LABEL)
    offline_evidence('signup-draft-purged-online')
    # Leave the shared Appium session on a predictable login route for the
    # following authenticated workflow cases.
    signup.click('signup_login_link')


def test_session_hydration_offline_opens_cached_view(
    bundled_app, driver, network_manager, fresh_offline_account, offline_evidence
):
    """QA Scenario: Authenticated user who goes offline can relaunch app in cached read-only mode."""
    email, password = fresh_offline_account
    login = LoginPage(driver)
    login.login_as(email, password)

    reports = ReportsPage(driver)
    reports.wait_home() if hasattr(reports, 'wait_home') else reports.find_element(reports.HOME)

    # Disable network and cold restart
    network_manager.all_off()
    assert network_manager.state().radios_off

    driver.terminate_app(APP)
    driver.activate_app(APP)

    # App should restore session from local persistence and display offline banner
    reports.find_element(reports.HOME, timeout=25)
    reports.find_element('offline_status_banner', timeout=10)
    offline_evidence('session-restored-offline')
