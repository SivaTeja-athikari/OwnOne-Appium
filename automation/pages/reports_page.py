"""Page object for the current Reports / Account application."""
import os
import re
import time
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.base_page import BasePage
from automation.pages.login_page import LoginPage


class ReportsPage(BasePage):
    HOME = 'report_connectivity_card'

    def tab(self, label):
        self.hide_keyboard_if_present()
        if self.is_mock:
            return
        platform = self.driver.capabilities.get('platformName', '').lower()
        if platform == 'android':
            # On Android NativeTabs, prefer the inner TextView with the tab label text
            text_elems = self.driver.find_elements(
                AppiumBy.ANDROID_UIAUTOMATOR,
                f'new UiSelector().text("{label}")',
            )
            for elem in text_elems:
                try:
                    if elem.is_displayed():
                        elem.click()
                        return
                except WebDriverException:
                    pass
            # Next try content-description selector
            desc_elems = self.driver.find_elements(
                AppiumBy.ANDROID_UIAUTOMATOR,
                f'new UiSelector().description("{label}")',
            )
            for elem in desc_elems:
                try:
                    if elem.is_displayed():
                        elem.click()
                        return
                except WebDriverException:
                    pass

        # Standard accessibility ID fallback
        elem = WebDriverWait(self.driver, self.timeout).until(lambda _: next(
            (e for e in self.driver.find_elements(AppiumBy.ACCESSIBILITY_ID, label) if e.is_displayed()), False))
        elem.click()

    def logout(self):
        self.hide_keyboard_if_present()

        def profile_loaded(_=None):
            if self._visible('profile_identity_card'):
                return True
            if self.driver.capabilities.get('platformName', '').lower() == 'android':
                try:
                    return bool(self.driver.find_elements(
                        AppiumBy.ANDROID_UIAUTOMATOR,
                        'new UiSelector().text("Your profile")',
                    ))
                except WebDriverException:
                    return False
            return False

        # If not already on profile, tap Account tab with retries
        if not profile_loaded():
            start_time = time.time()
            while time.time() - start_time < 20:
                self.tab('Account')
                # Wait up to 3 seconds for profile screen to mount
                for _ in range(6):
                    if profile_loaded():
                        break
                    time.sleep(0.5)
                if profile_loaded():
                    break

        WebDriverWait(self.driver, 10, poll_frequency=0.3).until(
            profile_loaded,
            'Profile screen did not load after opening the Account tab',
        )

        try:
            self.click('account_logout_btn')
        except TimeoutException:
            if self.driver.capabilities.get('platformName', '').lower() != 'android':
                raise
            sign_out = self.driver.find_element(
                AppiumBy.ANDROID_UIAUTOMATOR,
                'new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text("Sign out"))',
            )
            sign_out.click()
        self.find_element('login_submit_btn')

    def compose(self):
        self._select_report_section('compose')

    def activity(self):
        self._select_report_section('history')

    def _select_report_section(self, section):
        """Bring the report section switcher back into view before selecting it."""
        test_id = f'report_section_{section}'
        tab = self._visible(test_id)
        if not tab:
            if self.driver.capabilities.get('platformName', '').lower() == 'android':
                # Try UiScrollable first, then use the page object's verified
                # scroll container. The first native scrollable can sometimes
                # be a nested child, so scrollToBeginning alone is not enough
                # to bring the section switcher back into view.
                try:
                    self.driver.find_element(
                        AppiumBy.ANDROID_UIAUTOMATOR,
                        'new UiScrollable(new UiSelector().scrollable(true)).scrollToBeginning(12)',
                    )
                except Exception:
                    pass
                tab = self._visible(test_id)
            # A repeated bounded scroll is needed on long report forms and
            # after Android connectivity changes trigger a native-tree redraw.
            # Check the target after every gesture; stop when the page cannot
            # move any further.
            for _ in range(12):
                if tab:
                    break
                can_scroll = self.scroll('up')
                tab = self._visible(test_id)
                if tab or can_scroll is False:
                    break
        if not tab:
            raise AssertionError(f'Report section tab did not become visible after scrolling to the top: {test_id}')
        self.click(test_id)

    def fill(self, title='Delivery inspection', location='Hyderabad Warehouse 02', details='Delivery received. Packaging intact. Supervisor notified.'):
        self.compose()
        self.set_text_if_changed('report_title_input', title)
        self.set_text_if_changed('report_location_input', location)
        if self.dropdown_value('category') != 'Delivery':
            self.select_dropdown('category', 'Delivery')
        if self.dropdown_value('priority') != 'High':
            self.select_dropdown('priority', 'High')
        self.set_text_if_changed('report_details_input', details)

    def set_text_if_changed(self, test_id, expected):
        if self.value(test_id) != expected:
            self.type_text(test_id, expected)

    def network_label(self):
        element = self.scroll_to('network_status_pill')
        attr = 'label' if self.driver.capabilities.get('platformName', '').lower() == 'ios' else 'content-desc'
        return element.get_attribute(attr) or element.text or ''

    def wait_offline(self, timeout=20):
        return WebDriverWait(self.driver, timeout, poll_frequency=0.3).until(
            lambda _: 'Offline' in self.network_label(),
            'Network status did not become Offline',
        )

    def wait_connected(self, timeout=60):
        return WebDriverWait(self.driver, timeout, poll_frequency=0.3).until(
            lambda _: 'Online' in self.network_label() or 'Reconnecting' in self.network_label(),
            'App did not reach Online state after radios were restored',
        )

    def discard_draft_if_present(self):
        self.compose()
        button = self.scroll_to('report_discard_btn')
        if not button.is_enabled():
            return False
        self.click('report_discard_btn')
        if self.driver.capabilities.get('platformName', '').lower() == 'ios':
            self.driver.switch_to.alert.accept()
        else:
            discard = WebDriverWait(self.driver, 5, poll_frequency=0.2).until(
                lambda _: self.driver.find_element(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    'new UiSelector().textMatches("(?i)discard")',
                ),
                'Discard confirmation did not appear',
            )
            discard.click()
        WebDriverWait(self.driver, 10, poll_frequency=0.3).until(
            lambda _: self.is_visible('report_submit_btn')
            and not self.is_enabled('report_discard_btn'),
            'Draft was not cleared',
        )
        return True

    def is_enabled(self, test_id):
        try:
            return self.scroll_to(test_id).is_enabled()
        except Exception:
            return False

    def select_dropdown(self, field, value):
        self.click(f'report_{field}_dropdown')
        self.demo_pause()
        self.click(f'report_{field}_option_{value.replace(" ", "_")}')
        self.demo_pause()

    def choose_scenario(self, scenario_key):
        self.click('report_open_scenario_picker_btn')
        self.demo_pause()
        self.click(f'report_scenario_{scenario_key}')
        self.demo_pause()

    def dropdown_value(self, field):
        element = self.scroll_to(f'report_{field}_dropdown')
        platform = self.driver.capabilities.get('platformName', '').lower()
        attr = 'label' if platform == 'ios' else 'content-desc'
        accessible_label = element.get_attribute(attr) or ''
        prefix = 'Report type: ' if field == 'category' else 'Priority: '
        if accessible_label.startswith(prefix):
            return accessible_label[len(prefix):].split('. Choose', 1)[0]
        return element.text or accessible_label

    def field_label(self, field):
        labels = {
            'title': 'Report title',
            'location': 'Site / location',
            'details': 'What happened?',
        }
        label = labels[field]
        self.scroll_to(f'report_{field}_input')
        if self.driver.capabilities.get('platformName', '').lower() == 'android':
            element = WebDriverWait(self.driver, self.timeout, poll_frequency=0.3).until(
                lambda _: self.driver.find_element(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    f'new UiSelector().textContains("{label}")',
                ),
                f'Visible field label not found: {label}',
            )
            return element.text
        return self.get_text(f'report_{field}_input_label')

    def select_outcome(self, outcome):
        self.click(f'report_outcome_{outcome.replace(" ", "_")}')
        self.demo_pause()

    def select_risk_level(self, risk):
        self.click(f'report_risk_{risk}')
        self.demo_pause()

    def demo_pause(self):
        """Hold a visible selection briefly when producing demo recordings."""
        try:
            seconds = min(3.0, max(0.0, float(os.environ.get('OFFLINE_DEMO_PAUSE_SECONDS', '0'))))
        except ValueError:
            seconds = 0.0
        if seconds == 0:
            return
        started = time.monotonic()
        WebDriverWait(self.driver, seconds + 0.2, poll_frequency=0.1).until(
            lambda _: time.monotonic() - started >= seconds,
            'Demo selection hold did not complete',
        )

    def enter_emergency_contact(self, contact):
        self.type_text('report_emergency_contact_input', contact)

    def toggle_follow_up(self):
        self.click('report_requires_follow_up_toggle')
        self.demo_pause()

    def enter_follow_up_date(self, date_str):
        self.type_text('report_follow_up_date_input', date_str)

    def enter_sign_off_name(self, name):
        self.type_text('report_sign_off_name_input', name)

    def enter_work_order_reference(self, reference):
        self.type_text('report_work_order_reference_input', reference)

    def enter_next_action(self, note):
        self.type_text('report_next_action_input', note)

    def toggle_checklist_item(self, index):
        self.click(f'report_checklist_toggle_{index}')
        self.demo_pause()

    def is_checked(self, identifier):
        element = self.scroll_to(identifier)
        value = element.get_attribute('checked')
        if value is None:
            value = element.get_attribute('value')
        if value is not None:
            return str(value).strip().lower() in ('true', '1', 'yes', 'checked')
        return element.is_selected()

    def value(self, identifier):
        element = self.scroll_to(identifier)
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
        known_placeholders = {
            'report_title_input': 'e.g. Delivery completed at client site',
            'report_location_input': 'e.g. Hyderabad · Warehouse 02',
            'report_details_input': 'Describe the work completed and any follow-up needed',
            'report_work_order_reference_input': 'e.g. WO-2048 or service ticket ID',
            'report_next_action_input': 'Who needs to do what next? Add a handover note if useful.',
        }
        if val == known_placeholders.get(identifier, ''):
            return ''
        return val

    def assert_fields(self, title, location, details):
        for name, expected in [('title', title), ('location', location), ('details', details)]:
            assert self.value(f'report_{name}_input') == expected

    def assert_inline_error(self, field, expected):
        identifier = f'report_{field}_error'
        assert self.get_text(identifier) == expected

    def assert_inline_error_absent(self, field):
        assert not self.is_visible(f'report_{field}_error'), f'Unexpected inline error remains for {field}'

    def submit(self):
        self.click('report_submit_btn')

    def reference(self):
        # List ordering is newest first. A reused authenticated suite can
        # contain earlier records, so resolve the current top record.
        self.activity()
        for _ in range(6):
            references = re.findall(r'report_record_([0-9a-f-]{36})', self.driver.page_source)
            if references:
                return references[0]
            if self.scroll('down') is False:
                break
        raise AssertionError('No report reference found after submission')

    def references(self):
        """Return all unique report reference IDs currently visible in activity history."""
        self.activity()
        found = []
        seen = set()
        for _ in range(6):
            references = re.findall(r'report_record_([0-9a-f-]{36})', self.driver.page_source)
            for reference in references:
                if reference not in seen:
                    seen.add(reference)
                    found.append(reference)
            if self.scroll('down') is False:
                break
        return list(found)

    def wait_home(self):
        return self.scroll_to(self.HOME)

    def ensure_authenticated(self, email, password):
        """Reuse an existing session and only sign in from a ready login form."""
        login = LoginPage(self.driver)
        if self._visible(self.HOME):
            return self.wait_home()
        if login._visible(login.SUBMIT_BUTTON):
            login.wait_for_form_ready()
            # A session restore can finish while the form is becoming ready.
            if self._visible(self.HOME):
                return self.wait_home()
            login.login_as(email, password)
        return self.wait_home()

    def assert_no_submission(self, previous_references=None):
        self.activity()
        references = set(self.references())
        if previous_references is None:
            assert not references, 'Invalid form created a submission'
        else:
            # Activity is capped to the most recent records. Old records can
            # naturally fall outside that window, so only newly observed IDs
            # indicate that the invalid form was submitted.
            created = references - set(previous_references)
            assert not created, f'Invalid form created submissions: {sorted(created)}'

    def status(self, reference, expected, timeout=60):
        identifier = f'report_status_{reference}'
        self.scroll_to(identifier)
        def state(_):
            element = self._visible(identifier)
            if not element:
                return False
            value = element.text or element.get_attribute('label') or ''
            if 'Access denied' in self.driver.page_source:
                raise AssertionError('Firebase rejected report creation. Publish the latest firestore.rules before running the offline demo.')
            return expected in value
        WebDriverWait(self.driver, timeout, poll_frequency=0.5).until(
            state,
            f'Report {reference} did not become {expected}')

    def sync_pending(self, references, timeout=90):
        """Wait for each row to confirm; retry once if automatic sync stalls."""
        self.activity()
        try:
            for reference in references:
                self.status(reference, 'Server confirmed', timeout=timeout)
            return
        except TimeoutException:
            button = self._visible('report_retry_btn')
            if not button or not button.is_enabled():
                raise AssertionError(
                    'Report rows stayed pending while the app kept Retry disabled. '
                    f'Network state: {self.network_label()}; UI error present: '
                    f'{"Unable to send" in self.driver.page_source}'
                )
            self.click('report_retry_btn')
            for reference in references:
                self.status(reference, 'Server confirmed', timeout=timeout)
