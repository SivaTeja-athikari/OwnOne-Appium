"""Native identifiers, bounded waits, scroll handling, and readable test evidence."""
import os
from pathlib import Path
from typing import Any, Optional
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from appium.webdriver.common.appiumby import AppiumBy

from automation.core.healer import SelfHealingEngine
from automation.core.locator_catalog import LocatorCatalog


class BasePage:
    def __init__(self, driver: Any, timeout: int = 25):
        self.driver = driver
        self.timeout = timeout
        self.healer = SelfHealingEngine.get_instance()
        self.healing_enabled = os.environ.get("ENABLE_SELF_HEALING", "1").lower() not in ("0", "false", "no")

    @property
    def is_mock(self):
        return isinstance(getattr(self.driver, 'elements', None), dict)

    def _matches(self, test_id):
        if self.is_mock:
            matches = self.driver.find_elements('id', test_id)
            if not matches and self.healing_enabled:
                cached_id = self.healer.get_cached_id(test_id)
                if cached_id:
                    matches = self.driver.find_elements('id', cached_id)
            return matches

        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        if platform == 'android':
            # UiAutomator2's resourceId selector is primary for React Native testIDs.
            matches = self.driver.find_elements(
                AppiumBy.ANDROID_UIAUTOMATOR,
                f'new UiSelector().resourceId("{test_id}")',
            )
            if not matches:
                # Fast React Native alias: testID rendered as content-desc
                matches = self.driver.find_elements(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    f'new UiSelector().description("{test_id}")',
                )
            if not matches and self.healing_enabled:
                cached_locator = self.healer.get_cached_locator(test_id)
                if cached_locator:
                    by, query = cached_locator
                    matches = self.driver.find_elements(by, query)
            return matches

        strategy = AppiumBy.ACCESSIBILITY_ID
        matches = self.driver.find_elements(strategy, test_id)
        if not matches and self.healing_enabled:
            cached_locator = self.healer.get_cached_locator(test_id)
            if cached_locator:
                by, query = cached_locator
                matches = self.driver.find_elements(by, query)
        return matches

    def _visible(self, test_id):
        """Checks if the genuine element matching test_id (or cached healed query) is displayed."""
        for element in self._matches(test_id):
            try:
                if element.is_displayed():
                    return element
            except WebDriverException:
                continue
        return False

    def find_element(self, test_id: str, timeout: Optional[int] = None):
        self.dismiss_ios_password_suggestion()
        wait_time = self.timeout if timeout is None else timeout
        try:
            return WebDriverWait(self.driver, wait_time, poll_frequency=0.3).until(
                lambda _: self._visible(test_id),
                f'Visible element not found: {test_id}',
            )
        except TimeoutException:
            # Self-healing fallback: Only runs when standard locator resolution
            # has exhausted its timeout, preventing premature healing or false matches.
            if self.healing_enabled:
                healed = self.healer.heal(self.driver, test_id, screen=self.__class__.__name__)
                if healed:
                    return healed
            raise

    def scroll(self, direction='down'):
        self.hide_keyboard_if_present()
        size = self.driver.get_window_size()
        if self.driver.capabilities.get('platformName', '').lower() == 'android':
            # Target the app's scroll container instead of a fixed screen
            # rectangle. The latter can land on the fixed header/tab bar and
            # report a successful gesture without moving the form content.
            containers = []
            for element in self.driver.find_elements(By.CLASS_NAME, 'android.widget.ScrollView'):
                try:
                    if element.is_displayed():
                        bounds = element.rect
                        containers.append((bounds['width'] * bounds['height'], element))
                except WebDriverException:
                    # Navigation can replace the native tree while locating a
                    # container; skip stale nodes and use the viewport fallback.
                    continue
            if containers:
                _, container = max(containers, key=lambda pair: pair[0])
                try:
                    moved = self.driver.execute_script('mobile: scrollGesture', {
                        # Smaller, moderate-speed gestures behave more like a
                        # deliberate user drag and avoid jumping past fields.
                        'elementId': container.id, 'direction': direction,
                        'percent': 0.55, 'speed': 1800,
                    })
                    if moved:
                        return True
                except WebDriverException:
                    # A route transition can invalidate the element between
                    # discovery and the gesture; the coordinate gesture below
                    # targets the newly rendered screen instead.
                    pass
            # Some Android builds expose a wrapper ScrollView that reports
            # no scroll range while its child content is still scrollable.
            # Fall back to a gesture over the app content viewport.
            return self.driver.execute_script('mobile: scrollGesture', {
                'left': int(size['width'] * 0.12), 'top': int(size['height'] * 0.24),
                'width': int(size['width'] * 0.76), 'height': int(size['height'] * 0.60),
                'direction': direction, 'percent': 0.55, 'speed': 1800,
            })
        if self.driver.capabilities.get('platformName', '').lower() == 'ios':
            containers = [
                element
                for element in self.driver.find_elements(By.CLASS_NAME, 'XCUIElementTypeScrollView')
                if element.is_displayed()
            ]
            gesture = {'direction': 'up' if direction == 'down' else 'down'}
            if containers:
                gesture['elementId'] = containers[0].id
            # XCUITest's swipe supports velocity in px/s; keep it moderate so
            # the viewport advances naturally instead of jumping several rows.
            gesture['velocity'] = 1200
            self.driver.execute_script('mobile: swipe', gesture)
        return True

    def scroll_to(self, test_id):
        element = self._visible(test_id)
        if element:
            return element

        self.hide_keyboard_if_present()
        if not self.is_mock and self.driver.capabilities.get('platformName', '').lower() == 'android':
            try:
                element = self.driver.find_element(
                    AppiumBy.ANDROID_UIAUTOMATOR,
                    'new UiScrollable(new UiSelector().scrollable(true))'
                    f'.scrollIntoView(new UiSelector().resourceId("{test_id}"))',
                )
                self.hide_keyboard_if_present()
                return element
            except WebDriverException:
                desc = LocatorCatalog.get(test_id)
                if desc and (desc.texts or desc.labels):
                    for target_text in desc.texts + desc.labels:
                        try:
                            element = self.driver.find_element(
                                AppiumBy.ANDROID_UIAUTOMATOR,
                                'new UiScrollable(new UiSelector().scrollable(true))'
                                f'.scrollIntoView(new UiSelector().text("{target_text}"))',
                            )
                            self.hide_keyboard_if_present()
                            return element
                        except WebDriverException:
                            pass
        for direction in ['down', 'up']:
            for _ in range(9):
                more = self.scroll(direction)
                element = self._visible(test_id)
                if element:
                    return element
                if more is False:
                    break
        return self.find_element(test_id, timeout=3)

    def click(self, test_id: str, timeout: Optional[int] = None):
        self.hide_keyboard_if_present()
        element = self.scroll_to(test_id)
        WebDriverWait(self.driver, timeout or self.timeout).until(lambda _: element.is_enabled())
        if not self.is_mock:
            previous = [None]
            def settled(_):
                current = element.rect
                stable = current == previous[0]
                previous[0] = current
                return stable and element.is_enabled()
            WebDriverWait(self.driver, 5, poll_frequency=0.25).until(settled)
        element.click()

    def type_text(self, test_id: str, text: str, timeout: Optional[int] = None):
        # TextInputs are temporarily disabled while auth or save requests are
        # in flight. Wait for the current native element to be interactable;
        # otherwise Appium can fail with InvalidElementStateException.
        wait_timeout = self.timeout if timeout is None else timeout
        last_stale_error = None
        for attempt in range(3):
            if not self._visible(test_id):
                self.hide_keyboard_if_present()
            self.scroll_to(test_id)

            def interactable(_):
                current = self._visible(test_id)
                if not current and not self.is_mock:
                    self.hide_keyboard_if_present()
                    current = self._visible(test_id)
                try:
                    return current if current and current.is_enabled() else False
                except WebDriverException:
                    return False

            element = WebDriverWait(self.driver, wait_timeout, poll_frequency=0.25).until(
                interactable,
                f'Enabled element not found: {test_id}',
            )
            try:
                if not self.is_mock and self.driver.capabilities.get('platformName', '').lower() == 'android':
                    # Android 17 can replace a React Native input's
                    # accessibility node when the IME opens. Select and clear
                    # via key events, then type through UiAutomator2's focused
                    # field command so no cached element is reused.
                    element.click()
                    self.driver.press_keycode(29, metastate=4096)  # Ctrl+A
                    self.driver.press_keycode(67)  # Backspace
                    if text:
                        self.driver.execute_script('mobile: type', {'text': text})
                else:
                    element.click()
                    self.dismiss_ios_password_suggestion()
                    element.clear()
                    element.send_keys(text)
                if not self.is_mock and self.driver.capabilities.get('platformName', '').lower() == 'ios':
                    def retained(_):
                        matches = self._matches(test_id)
                        if not matches:
                            return False
                        # The keyboard may cover the field after typing; its
                        # native value remains readable even when not visible.
                        current = matches[0]
                        value = current.get_attribute('value') or ''
                        placeholder = current.get_attribute('placeholderValue') or ''
                        if value == placeholder:
                            value = ''
                        if current.get_attribute('type') == 'XCUIElementTypeSecureTextField':
                            # XCTest masks passwords; verify length without exposing them.
                            return len(value) == len(text)
                        return value == text

                    try:
                        WebDriverWait(self.driver, 3, poll_frequency=0.3).until(
                            retained, f'iOS input did not retain entered text: {test_id}',
                        )
                    except TimeoutException:
                        if attempt == 2:
                            raise
                        continue
                last_stale_error = None
                break
            except StaleElementReferenceException as exc:
                last_stale_error = exc
                if attempt == 2:
                    raise
        if last_stale_error:
            raise last_stale_error
        self.hide_keyboard_if_present()

    def get_text(self, test_id: str, timeout: Optional[int] = None):
        element = self.scroll_to(test_id)
        if element.text:
            return element.text
        if not self.is_mock:
            descendants = element.find_elements(By.XPATH, './/*[@text != ""]')
            text = ' '.join(child.text for child in descendants if child.text)
            if text:
                return text
        return element.get_attribute('label' if not self.is_mock and self.driver.capabilities.get('platformName') == 'iOS' else 'content-desc') or ''

    def is_visible(self, test_id: str, timeout: int = 2) -> bool:
        try:
            return bool(WebDriverWait(self.driver, timeout, poll_frequency=0.25).until(
                lambda _: self._visible(test_id)
            ))
        except (TimeoutException, WebDriverException):
            return False

    def dismiss_ios_password_suggestion(self):
        if not self.is_mock and self.driver.capabilities.get('platformName', '').lower() == 'ios':
            try:
                for action in ('Not Now', 'Close'):
                    buttons = self.driver.find_elements(
                        By.XPATH,
                        f"//XCUIElementTypeButton[@name='{action}' or @label='{action}']",
                    )
                    for button in buttons:
                        try:
                            if button.is_displayed():
                                button.click()
                                break
                        except WebDriverException:
                            pass
            except WebDriverException:
                pass

    def hide_keyboard_if_present(self):
        self.dismiss_ios_password_suggestion()
        if not self.is_mock:
            try:
                self.driver.hide_keyboard()
            except WebDriverException:
                pass

    def capture_screenshot(self, filepath: str):
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        self.driver.get_screenshot_as_file(filepath)
