"""Real-device critical path: create account, return to Login, sign in, and persist."""
import pytest
from automation.pages.login_page import LoginPage
from automation.pages.signup_page import SignupPage
from automation.pages.dashboard_page import DashboardPage
from automation.offline.test_data import fresh_email


@pytest.mark.smoke
@pytest.mark.authentication
class TestSignupLoginFlow:
    def test_signup_login_and_online_reauthentication_after_relaunch(self, driver, environment, tenant_config, artifact_dir, platform):
        login = LoginPage(driver)
        signup = SignupPage(driver)
        dashboard = DashboardPage(driver)
        login.ensure_login()
        if environment != 'production':
            login.select_environment(environment)
            login.ensure_login()
        email = fresh_email('Smoke', platform.title())
        password = 'OfflineTest2026!'
        print(f'\n[Flow] Signup account: {email}', flush=True)
        login.capture_screenshot(str(artifact_dir / '01-login.png'))
        login.open_signup()
        signup.create_account(f'{platform.title()} Signup Tester', email, password, [tenant_config['id']])
        try:
            login.find_element(login.SUCCESS_MESSAGE, timeout=30)
            assert 'Account created' in login.get_text(login.SUCCESS_MESSAGE)
            assert not dashboard.is_visible(dashboard.TENANT_DISPLAY_NAME, timeout=1)
            login.capture_screenshot(str(artifact_dir / '02-account-created-returned-to-login.png'))
            print('[Flow] Account created; Login screen confirmed', flush=True)
        except Exception:
            if not signup.is_visible(signup.ERROR_BOX, timeout=2) or 'already exists' not in signup.get_text(signup.ERROR_BOX).lower():
                raise
            signup.click('signup_login_link')
            if not login.is_visible(login.SUBMIT_BUTTON, timeout=3):
                if platform.lower() == 'android':
                    driver.back()
                else:
                    signup.click('signup_login_link')
            login.find_element(login.SUBMIT_BUTTON)
            login.capture_screenshot(str(artifact_dir / '02-existing-account-ready-to-login.png'))
            print('[Flow] Fixed test account already exists; continuing with login', flush=True)
        login.login_as(email, password)
        dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
        assert dashboard.get_tenant_badge() == tenant_config['badge_text']
        assert dashboard.get_tenant_display_name() == tenant_config['display_name']
        dashboard.capture_screenshot(str(artifact_dir / '03-signed-in-dashboard.png'))
        print('[Flow] Signed in using the registered credentials', flush=True)
        app_id = 'com.anonymous.appreact'
        driver.terminate_app(app_id)
        driver.activate_app(app_id)
        if not login.is_visible(login.SUBMIT_BUTTON, timeout=3):
            # The app intentionally restores the last verified profile as a
            # read-only cached workspace when Firebase has no in-memory user.
            dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
            banner = dashboard.find_element('offline_status_banner')
            accessibility_attribute = 'content-desc' if platform.lower() == 'android' else 'label'
            assert 'cached' in (banner.get_attribute(accessibility_attribute) or '').lower()
            dashboard.logout()
        login.find_element(login.SUBMIT_BUTTON)
        if environment != 'production':
            login.select_environment(environment)
        login.login_as(email, password)
        dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
        assert dashboard.get_tenant_badge() == tenant_config['badge_text']
        dashboard.capture_screenshot(str(artifact_dir / '04-session-restored-after-relaunch.png'))
        print('[Flow] Online sign-in succeeded after relaunch', flush=True)
        dashboard.logout()
        login.find_element(login.SUBMIT_BUTTON)
        login.login_as(email, 'Wrong@123')
        assert 'incorrect' in login.get_error_message()
        login.capture_screenshot(str(artifact_dir / '05-wrong-password-rejected.png'))
        login.login_as(email, password)
        dashboard.find_element(dashboard.TENANT_DISPLAY_NAME)
        dashboard.logout()
        login.find_element(login.SUBMIT_BUTTON)
        login.capture_screenshot(str(artifact_dir / '06-final-logout.png'))
        print('[Flow] Wrong password rejected; correct login and final logout passed', flush=True)
