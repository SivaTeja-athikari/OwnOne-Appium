"""Register a fresh device-local account through the same form a user sees."""
from automation.pages.base_page import BasePage


class SignupPage(BasePage):
    NAME_INPUT = 'signup_name_input'
    EMAIL_INPUT = 'signup_email_input'
    PASSWORD_INPUT = 'signup_password_input'
    CONFIRM_INPUT = 'signup_confirm_input'
    SUBMIT_BUTTON = 'signup_submit_btn'
    ERROR_BOX = 'signup_error_message'
    DRAFT_SAVED_LABEL = 'signup_draft_saved'
    LOGIN_LINK = 'signup_login_link'

    def _is_checked(self, test_id):
        element = self.scroll_to(test_id)
        value = element.get_attribute('checked')
        if value is None:
            value = element.get_attribute('value')
        if value is not None:
            return str(value).strip().lower() in ('true', '1', 'yes', 'checked')
        return element.is_selected()

    def complete_form(self, full_name, email, password, tenant_ids=('acme-corp',), confirmation=None):
        self.type_text(self.NAME_INPUT, full_name)
        self.type_text(self.EMAIL_INPUT, email)
        self.type_text(self.PASSWORD_INPUT, password)
        self.type_text(self.CONFIRM_INPUT, password if confirmation is None else confirmation)
        return self

    def submit(self):
        self.click(self.SUBMIT_BUTTON)

    def create_account(self, full_name, email, password, tenant_ids=('acme-corp',)):
        self.complete_form(full_name, email, password, tenant_ids)
        self.submit()

    def get_input_value(self, test_id: str) -> str:
        element = self.scroll_to(test_id)
        platform = self.driver.capabilities.get('platformName', '').lower()
        val = element.get_attribute('value' if platform == 'ios' else 'text') or ''
        if platform == 'android':
            hint = element.get_attribute('hint') or ''
            if val == hint:
                return ''
        else:
            placeholder = element.get_attribute('placeholderValue') or ''
            if placeholder and val == placeholder:
                return ''
        # Android fallback when hint attribute is not separately populated:
        known_placeholders = {
            self.NAME_INPUT: 'Your full name',
            self.EMAIL_INPUT: 'you@example.com',
            self.PASSWORD_INPUT: 'At least 8 characters',
            self.CONFIRM_INPUT: 'Re-enter your password',
        }
        if val == known_placeholders.get(test_id, ''):
            return ''
        return val
