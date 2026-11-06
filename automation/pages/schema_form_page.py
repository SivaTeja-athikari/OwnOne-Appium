"""Schema-driven access to configured fields, independent of labels/order."""
import json
from pathlib import Path

from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage


SCHEMA_PATH = Path(__file__).resolve().parents[2] / 'src/features/submissions/report-form-schema.json'


class SchemaFormPage:
    """Small POC page object that reads field identities/types from the app schema."""

    def __init__(self, driver, schema_path=SCHEMA_PATH):
        self.driver = driver
        self.schema = json.loads(Path(schema_path).read_text(encoding='utf-8'))
        self.fields_by_id = {field['id']: field for field in self.schema['fields']}
        if len(self.fields_by_id) != len(self.schema['fields']):
            raise ValueError(f"Duplicate field IDs in schema {self.schema.get('formId')!r}")

    def field_ids(self):
        return list(self.fields_by_id)

    def visible_fields(self):
        visible = []
        for field in self.schema['fields']:
            try:
                element = self._container(field['id'])
                if element.is_displayed():
                    visible.append(field)
            except Exception:
                # Fields hidden by the active form state (for example a
                # conditional date field) are omitted from this live view.
                continue
        return visible

    def _container(self, field_id):
        if field_id not in self.fields_by_id:
            raise KeyError(f'Unknown field schema ID: {field_id}')
        test_id = f"form_field_{field_id}"
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        if platform == 'android':
            return self.driver.find_element(
                AppiumBy.ANDROID_UIAUTOMATOR,
                f'new UiSelector().resourceId("{test_id}")',
            )
        return self.driver.find_element(AppiumBy.ACCESSIBILITY_ID, test_id)

    def input(self, field_id):
        field = self.fields_by_id[field_id]
        if field['type'] not in {'text', 'multiline', 'phone', 'date'}:
            raise ValueError(f"Unsupported text input type {field['type']!r}")
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        native_class = 'android.widget.EditText' if platform == 'android' else 'XCUIElementTypeTextField'
        container_id = f'form_field_{field_id}'
        # Scroll the schema-identified field fully into the usable viewport.
        # React Native's native tree may omit a TextInput while it is clipped
        # beneath the fixed bottom navigation, and testID wrappers do not
        # consistently retain their native descendants on Android.
        BasePage(self.driver).scroll_to(container_id)
        container = self._container(field_id)
        if platform == 'android':
            scroll_views = [
                view for view in self.driver.find_elements(By.CLASS_NAME, 'android.widget.ScrollView')
                if view.is_displayed()
            ]
            # Forms are nested inside the screen's outer scroll view. Use the
            # smallest scroll view containing this field, so the gesture moves
            # the form instead of an outer screen wrapper or fixed navigation.
            containing = []
            for view in scroll_views:
                rect = view.rect
                field_rect = container.rect
                if (rect['y'] <= field_rect['y'] and
                        rect['y'] + rect['height'] >= field_rect['y'] + field_rect['height']):
                    containing.append((rect['width'] * rect['height'], view))
            if containing:
                scroll_view = min(containing, key=lambda pair: pair[0])[1]
                for _ in range(5):
                    field_rect = container.rect
                    viewport = scroll_view.rect
                    if field_rect['y'] + field_rect['height'] <= viewport['y'] + viewport['height'] - 100:
                        break
                    moved = self.driver.execute_script('mobile: scrollGesture', {
                        'elementId': scroll_view.id,
                        'direction': 'down',
                        'percent': 0.35,
                        'speed': 1200,
                    })
                    if not moved:
                        break
                    container = self._container(field_id)
        try:
            return container.find_element(By.XPATH, f'.//{native_class}')
        except Exception:
            # On Android the accessible tree can flatten the label/input out
            # of the wrapper. Once scrolled into view, select the closest
            # native text input by its vertical position relative to the
            # schema wrapper, without depending on configured labels or order.
            candidates = self.driver.find_elements(By.CLASS_NAME, native_class)
            wrapper = container.rect
            below = []
            for candidate in candidates:
                try:
                    rect = candidate.rect
                    if candidate.is_displayed() and rect['y'] >= wrapper['y'] - 8:
                        below.append((rect['y'] - wrapper['y'], candidate))
                except Exception:
                    continue
            if below:
                return min(below, key=lambda pair: pair[0])[1]
            raise

    def enter(self, field_id, value):
        """Type by stable schema ID and verify that the native field retained it."""
        field = self.input(field_id)
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        field.click()
        if platform == 'android':
            self.driver.press_keycode(29, metastate=4096)  # Ctrl+A
            self.driver.press_keycode(67)  # Backspace
            if value:
                self.driver.execute_script('mobile: type', {'text': value})
        else:
            field.clear()
            field.send_keys(value)
        field = self.input(field_id)
        actual = field.get_attribute('text' if platform == 'android' else 'value') or ''
        if actual != value:
            raise AssertionError(f'Field {field_id} did not retain the entered value')

    def value(self, field_id):
        field = self.input(field_id)
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        return field.get_attribute('text' if platform == 'android' else 'value') or ''
