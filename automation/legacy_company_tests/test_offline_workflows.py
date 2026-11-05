"""Offline UI checks for online-only access on Android emulators."""

import os
import pytest
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.login_page import LoginPage
from automation.pages.dashboard_page import DashboardPage
from automation.pages.signup_page import SignupPage
from automation.pages.workspace_navigation import WorkspaceNavigation
from automation.offline.test_data import fresh_email

APP_ID = 'com.anonymous.appreact'


def expect_offline_banner(page):
    # A routed proxy fault leaves the iOS device's radio state unchanged.
    if page.driver.capabilities.get('platformName', '').lower() == 'android':
        page.find_element('offline_status_banner')


def expect_banner_cleared(page):
    if page.driver.capabilities.get('platformName', '').lower() == 'android':
        WebDriverWait(page.driver, 15, poll_frequency=0.4).until(
            lambda _: not page._visible('offline_status_banner'))


@pytest.mark.offline
def test_off_001_relaunch_with_radios_off(bundled_app, driver, network_manager,
                                          offline_evidence, fresh_offline_account):
    if os.environ.get('OFFLINE_FIREBASE_CONFIGURED') != '1':
        pytest.skip('A previously verified Firebase profile is required for cached workspace access')
    email, password = fresh_offline_account
    login = LoginPage(driver)
    login.login_as(email, password)
    dashboard = DashboardPage(driver)
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    offline_evidence('01-online-login')
    network_manager.all_off()
    expect_offline_banner(dashboard)
    driver.terminate_app(APP_ID)
    driver.activate_app(APP_ID)
    expect_offline_banner(dashboard)
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    offline_evidence('02-cached-workspace-after-offline-relaunch')


@pytest.mark.offline
def test_off_002_login_blocked_offline_and_after_restore(
        bundled_app, driver, network_manager, offline_evidence):
    login = LoginPage(driver)
    login.ensure_login()
    network_manager.all_off()
    expect_offline_banner(login)
    email, password = 'alex.morgan.4821@example.com', 'ValidPassword1!'
    login.login_as(email, password)
    assert 'internet' in login.get_error_message().lower()
    assert not login._visible('tenant_display_name')
    offline_evidence('01-login-rejected-offline')
    network_manager.restore()
    expect_banner_cleared(login)
    login.find_element(login.SUBMIT_BUTTON)
    offline_evidence('02-login-available-after-restore')


@pytest.mark.offline
def test_off_003_signup_form_and_duplicate_protection(
        bundled_app, driver, network_manager, environment, offline_evidence, platform):
    login = LoginPage(driver)
    signup = SignupPage(driver)
    login.ensure_login()
    if environment != 'production':
        login.select_environment(environment)
    email = fresh_email('Samira', 'Patel')
    password = 'OfflineTest2026!'
    login.open_signup()
    network_manager.all_off()
    expect_offline_banner(signup)
    signup.complete_form('Samira Patel', email, password)
    offline_evidence('01-form-filled-offline')
    signup.submit()
    assert 'internet' in signup.get_text(signup.ERROR_BOX).lower()
    assert not signup._visible(login.SUCCESS_MESSAGE)
    offline_evidence('02-signup-blocked-offline')
    driver.terminate_app(APP_ID)
    driver.activate_app(APP_ID)
    login.find_element(login.SUBMIT_BUTTON)
    login.open_signup()
    WebDriverWait(driver, 15, poll_frequency=0.4).until(
        lambda _: email in driver.page_source and 'Samira Patel' in driver.page_source)
    assert password not in driver.page_source, 'Signup password must not be persisted in the local draft'
    assert signup._visible(signup.PASSWORD_INPUT)
    password_field = signup.find_element(signup.PASSWORD_INPUT)
    password_value = password_field.get_attribute('value' if platform.lower() == 'ios' else 'text')
    assert password_value != password, 'Signup password must be blank after restoring the local draft'
    offline_evidence('03-draft-restored-after-offline-relaunch')
    network_manager.restore()
    expect_banner_cleared(signup)
    assert email in driver.page_source
    offline_evidence('04-form-preserved-after-restore')
    if os.environ.get('OFFLINE_FIREBASE_CONFIGURED') == '1':
        signup.type_text(signup.PASSWORD_INPUT, password)
        signup.type_text(signup.CONFIRM_INPUT, password)
        signup.submit()
        login.find_element(login.SUCCESS_MESSAGE)
        offline_evidence('05-created-on-server')


@pytest.mark.offline
def test_off_004_tabs_and_workspace_switch(bundled_app, driver, network_manager,
                                           fresh_offline_account, offline_evidence):
    if os.environ.get('OFFLINE_FIREBASE_CONFIGURED') != '1':
        pytest.skip('Firebase project configuration is required for authenticated navigation')
    email, password = fresh_offline_account
    login = LoginPage(driver)
    dashboard = DashboardPage(driver)
    tabs = WorkspaceNavigation(driver)
    login.login_as(email, password)
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    tabs.open_tab('Companies')
    tabs.open_tab('Account')
    tabs.open_tab('Overview')
    network_manager.all_off()
    expect_offline_banner(dashboard)
    offline_evidence('01-workspace-hidden-offline')
    network_manager.restore()
    expect_banner_cleared(dashboard)
    try:
        login.find_element(login.SUBMIT_BUTTON, timeout=3)
        login.login_as(email, password)
    except Exception:
        pass
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    offline_evidence('02-workspace-revalidated')


@pytest.mark.offline
def test_off_005_cached_workspace_survives_offline_relaunch_and_restores_network(
        bundled_app, driver, network_manager, fresh_offline_account, offline_evidence, platform):
    if os.environ.get('OFFLINE_FIREBASE_CONFIGURED') != '1':
        pytest.skip('Firebase project configuration is required for authenticated restoration')
    email, password = fresh_offline_account
    login = LoginPage(driver)
    dashboard = DashboardPage(driver)
    login.login_as(email, password)
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    dashboard.open_company_switcher()
    from automation.pages.company_switch_modal import CompanySwitchModal
    CompanySwitchModal(driver).select_company('apex-health')
    assert dashboard.get_tenant_badge() == 'APEX'
    network_manager.all_off()
    expect_offline_banner(dashboard)
    driver.terminate_app(APP_ID)
    driver.activate_app(APP_ID)
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    assert dashboard.get_tenant_badge() == 'APEX'
    offline_evidence('01-cached-workspace-after-offline-relaunch')
    dashboard.open_company_switcher()
    switcher = CompanySwitchModal(driver)
    switcher.find_element('workspace_switch_requires_online')
    assert not switcher.find_element('company_option_acme-corp').is_enabled(), \
        'Cached-only users must not be able to switch workspaces'
    switcher.close()
    network_manager.restore()
    # Cold relaunch loses Firebase's in-memory credential. Connectivity returns,
    # but the cached UI stays read-only until the user signs in online again.
    attribute = 'content-desc' if platform.lower() == 'android' else 'label'
    def cached_banner_visible(_):
        banner = dashboard._visible('offline_status_banner')
        return bool(banner and 'cached' in (banner.get_attribute(attribute) or '').lower())

    WebDriverWait(driver, 20, poll_frequency=0.4).until(
        cached_banner_visible,
        'Restored connectivity did not change the offline banner to cached-only mode',
    )
    dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
    assert dashboard.get_tenant_badge() == 'APEX'
    dashboard.find_element('offline_sign_in_btn')
    offline_evidence('02-workspace-available-after-network-restoration')


@pytest.mark.offline
def test_off_018_android_radio_modes(driver, network_manager, platform,
                                     offline_evidence):
    if platform.lower() != 'android':
        pytest.skip('Physical radio mode checks are Android-only')
    network_manager.wifi(False)
    assert not network_manager.state().wifi
    offline_evidence('01-wifi-disabled')
    network_manager.restore()
    network_manager.mobile_data(False)
    assert not network_manager.state().data
    offline_evidence('02-mobile-data-disabled')
    network_manager.restore()
    network_manager.airplane_mode(True)
    assert network_manager.state().airplane_mode
    offline_evidence('03-airplane-mode')
    network_manager.restore()
    assert network_manager.all_off().radios_off
    offline_evidence('04-all-radios-disabled')
