"""Authentication module validation and duplicate-account behavior on native UI."""
import pytest
from automation.pages.login_page import LoginPage
from automation.pages.signup_page import SignupPage


@pytest.mark.authentication
class TestAuthenticationValidation:
    def test_duplicate_signup_is_rejected(self, driver, fresh_offline_account, artifact_dir):
        # Reuse the suite account; this test checks duplicate registration and
        # should not create another Firebase user just to obtain credentials.
        email, password = fresh_offline_account
        login = LoginPage(driver)
        signup = SignupPage(driver)
        login.ensure_login()
        login.open_signup()
        signup.create_account('Another User', email, password)
        signup.find_element(signup.ERROR_BOX, timeout=45)
        assert 'already exists' in signup.get_text(signup.ERROR_BOX)
        signup.capture_screenshot(str(artifact_dir / 'duplicate-rejected.png'))
        signup.click('signup_login_link')

    def test_password_confirmation_is_required(self, driver, artifact_dir):
        login = LoginPage(driver)
        signup = SignupPage(driver)
        login.ensure_login()
        login.find_element(login.SUBMIT_BUTTON)
        login.open_signup()
        signup.complete_form('Validation User', 'test.confirmation@example.com', 'Test@123', confirmation='Other@123')
        signup.submit()
        assert 'do not match' in signup.get_text(signup.ERROR_BOX)
        signup.capture_screenshot(str(artifact_dir / 'confirmation-rejected.png'))
        signup.click('signup_login_link')
