"""Sign in with credentials created through the Signup screen."""
from automation.pages.base_page import BasePage
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.support.ui import WebDriverWait
from appium.webdriver.common.appiumby import AppiumBy


class LoginPage(BasePage):
    EMAIL_INPUT = 'login_email_input'
    PASSWORD_INPUT = 'login_password_input'
    SUBMIT_BUTTON = 'login_submit_btn'
    ERROR_BOX = 'login_error_message'
    ENV_BANNER = 'env_indicator_banner'
    SIGNUP_LINK = 'login_signup_link'
    SUCCESS_MESSAGE = 'signup_success_message'

    def auth_screen(self):
        from automation.pages.reports_page import ReportsPage
        dashboard = ReportsPage(self.driver)

        def visible_workspace():
            if dashboard._visible(dashboard.HOME):
                return True
            # Some Android builds expose the bottom tab labels through
            # accessibility IDs even when the nested reports testID is not
            # returned in the initial native tree snapshot.
            for label in ('Reports', 'Account'):
                try:
                    if any(element.is_displayed() for element in self.driver.find_elements(AppiumBy.ACCESSIBILITY_ID, label)):
                        return True
                except WebDriverException:
                    continue
            return False

        def visible_android_text(text):
            if self.driver.capabilities.get('platformName', '').lower() != 'android':
                return False
            try:
                return bool(self.driver.find_elements(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    f'new UiSelector().text("{text}")',
                ))
            except WebDriverException:
                return False

        return WebDriverWait(self.driver, 60, poll_frequency=0.3).until(
            lambda _: 'login' if self._login_submit_visible() or visible_android_text('Sign in')
            else ('dashboard' if visible_workspace() else False),
            'Neither Login nor Reports became visible',
        )

    def _login_submit_visible(self):
        if self._visible(self.SUBMIT_BUTTON):
            return True
        try:
            self.find_element(self.SUBMIT_BUTTON, timeout=0)
            return True
        except TimeoutException:
            return False

    def login_result(self, timeout=60):
        from automation.pages.reports_page import ReportsPage
        dashboard = ReportsPage(self.driver)

        def check(_):
            self.dismiss_ios_password_suggestion()
            if dashboard._visible(dashboard.HOME):
                return 'dashboard'
            # On iOS, the scroll position may place report_connectivity_card
            # above the viewport while inside the authenticated workspace tabs.
            for tab_name in ('Reports', 'Account'):
                try:
                    if self._visible(tab_name):
                        return 'dashboard'
                except Exception:
                    pass
            if self._visible(self.ERROR_BOX):
                return 'error'
            return False

        return WebDriverWait(self.driver, timeout, poll_frequency=0.3).until(
            check,
            'Login produced neither a dashboard nor an error',
        )

    def ensure_login(self):
        from automation.pages.signup_page import SignupPage
        from automation.pages.reports_page import ReportsPage
        signup = SignupPage(self.driver)
        try:
            signup.find_element(signup.NAME_INPUT, timeout=0)
            on_signup = True
        except TimeoutException:
            on_signup = False
        if on_signup:
            if self.driver.capabilities.get('platformName', '').lower() == 'android' and not self.is_mock:
                self.driver.back()
            else:
                signup.click('signup_login_link')
        if self.auth_screen() == 'dashboard':
            ReportsPage(self.driver).logout()
        self.find_element(self.SUBMIT_BUTTON)

    def enter_email(self, email):
        self.type_text(self.EMAIL_INPUT, email)
        return self

    def enter_password(self, password):
        self.type_text(self.PASSWORD_INPUT, password)
        return self

    def click_sign_in(self):
        self.click(self.SUBMIT_BUTTON)

    def login_as(self, email, password):
        self.wait_for_form_ready()
        self.enter_email(email)
        self.enter_password(password)
        self.click_sign_in()

    def wait_for_form_ready(self, timeout=20):
        """Wait for the login form to mount; each input action waits until enabled."""
        def ready(_):
            try:
                fields = []
                for test_id in (self.EMAIL_INPUT, self.PASSWORD_INPUT, self.SUBMIT_BUTTON):
                    element = self._visible(test_id)
                    if not element:
                        element = self.find_element(test_id, timeout=0)
                    fields.append(element)
                return all(fields)
            except (TimeoutException, WebDriverException):
                # Firebase auth can replace the login tree while Appium is
                # inspecting it. Retry against the fresh accessibility tree.
                return False

        return WebDriverWait(self.driver, timeout, poll_frequency=0.25).until(
            ready, 'Login form did not become enabled',
        )

    def open_signup(self):
        from automation.pages.signup_page import SignupPage
        signup = SignupPage(self.driver)

        if signup.wait_for_form_ready(timeout=0):
            return signup

        self.hide_keyboard_if_present()
        self.click(self.SIGNUP_LINK)

        # Give the route transition a short window to mount
        try:
            return WebDriverWait(self.driver, 4, poll_frequency=0.3).until(
                lambda _: signup if signup.wait_for_form_ready(timeout=0) else False
            )
        except TimeoutException:
            pass

        # If the outer Pressable click did not trigger the route on Android, target the inner TextView or click gesture
        if not self.is_mock and self.driver.capabilities.get('platformName', '').lower() == 'android':
            try:
                for txt_elem in self.driver.find_elements(
                    AppiumBy.ANDROID_UIAUTOMATOR, 'new UiSelector().text("Create an account")'
                ):
                    if txt_elem.is_displayed():
                        txt_elem.click()
                        break
            except WebDriverException:
                pass

            try:
                return WebDriverWait(self.driver, 4, poll_frequency=0.3).until(
                    lambda _: signup if signup.wait_for_form_ready(timeout=0) else False
                )
            except TimeoutException:
                pass

            # Coordinate click fallback
            try:
                link_elem = self._visible(self.SIGNUP_LINK)
                if link_elem:
                    rect = link_elem.rect
                    self.driver.execute_script('mobile: clickGesture', {
                        'x': int(rect['x'] + rect['width'] / 2),
                        'y': int(rect['y'] + rect['height'] / 2),
                    })
            except WebDriverException:
                pass

        WebDriverWait(self.driver, 15, poll_frequency=0.3).until(
            lambda _: signup.wait_for_form_ready(timeout=0),
            'Signup form fields did not become ready after selecting Create an account',
        )
        return signup

    def select_environment(self, environment):
        from automation.config.environments import get_environment_config
        expected = 'Active Environment: ' + get_environment_config(environment)['label']
        attribute = 'content-desc' if self.driver.capabilities.get('platformName', '').lower() == 'android' else 'label'
        banner = self.find_element(self.ENV_BANNER)
        if banner.get_attribute(attribute) != expected:
            self.click(self.ENV_BANNER)
            self.click(f'env_switch_{environment}_btn')

        def selected(_):
            try:
                current = self._visible(self.ENV_BANNER)
                return current and current.get_attribute(attribute) == expected
            except WebDriverException:
                return False

        WebDriverWait(self.driver, 20, poll_frequency=0.3).until(
            selected, f'App did not switch to requested environment: {environment}',
        )
        self.auth_screen()
        print(f'[Environment] Verified active app environment: {environment}', flush=True)

    def get_error_message(self):
        return self.get_text(self.ERROR_BOX)

    def get_environment_banner_text(self):
        return self.get_text(self.ENV_BANNER)

    def get_input_value(self, test_id: str) -> str:
        element = self.scroll_to(test_id)
        return element.get_attribute('value' if self.driver.capabilities.get('platformName', '').lower() == 'ios' else 'text') or ''
